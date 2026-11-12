/**
 * 复制 / 移动任务引擎
 *
 * 全局单队列顺序执行。流程：校验 → 扫描统计 → 逐项复制/移动（冲突可暂停）→ 汇总。
 * 复制文件先写 `.<name>.filecommander-part` 临时文件，校验大小后原子 rename；
 * 取消或失败会删除临时文件，已完成项保留。
 */
const fs = require('./fsx');
const fsp = fs.promises;
const path = require('path');
const { shell } = require('electron');
const { spawn } = require('child_process');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { isAbsolutePath, toFsPath } = require('./paths');

// ---------------------------------------------------------------------------
// 日志：复用 canbox-core 的 logger（延迟获取，未注入时降级到 console）
// ---------------------------------------------------------------------------
function getLogger() {
    try {
        const corePath = global.__CANBOX_CORE_PATH__;
        if (corePath) {
            const l = require(path.join(corePath, 'lib', 'logger')).get();
            if (l) return l;
        }
    } catch (_) { /* ignore */ }
    return null;
}

function LOG_debug(...args) { const l = getLogger(); l ? l.debug('[transfer]', ...args) : console.debug('[transfer]', ...args); }
function LOG_info(...args)  { const l = getLogger(); l ? l.info('[transfer]', ...args)  : console.info('[transfer]', ...args); }
function LOG_warn(...args)  { const l = getLogger(); l ? l.warn('[transfer]', ...args)  : console.warn('[transfer]', ...args); }
function LOG_error(...args) { const l = getLogger(); l ? l.error('[transfer]', ...args) : console.error('[transfer]', ...args); }

const PART_SUFFIX = '.filecommander-part';
const PROGRESS_INTERVAL = 100;
const HIGH_WATER_MARK = 1024 * 1024;
const POLICIES = ['ask', 'overwrite', 'skip', 'rename'];

let sendEvent = () => {};
let seq = 0;
let activeTask = null;
const queue = [];
const tasks = new Map();

function init({ send }) {
    sendEvent = typeof send === 'function' ? send : () => {};
}

function cancelError() {
    return Object.assign(new Error('Cancelled'), { code: 'ECANCELLED' });
}

function isCancelled(task) {
    return task.cancelled;
}

function throwIfCancelled(task) {
    if (isCancelled(task)) throw cancelError();
}

function kindOf(stat) {
    if (!stat) return null;
    if (stat.isDirectory()) return 'dir';
    if (stat.isSymbolicLink()) return 'link';
    if (stat.isFile()) return 'file';
    return 'other';
}

async function lstatOrNull(target) {
    try {
        return await fsp.lstat(toFsPath(target));
    } catch (error) {
        return null;
    }
}

function samePath(a, b) {
    if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase();
    return a === b;
}

function isInside(child, parent) {
    const base = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
    return process.platform === 'win32'
        ? child.toLowerCase().startsWith(base.toLowerCase())
        : child.startsWith(base);
}

function progressPayload(task) {
    const now = Date.now();
    if (task.lastSampleAt && now > task.lastSampleAt) {
        const deltaBytes = task.bytesDone - task.lastSampleBytes;
        const deltaSeconds = (now - task.lastSampleAt) / 1000;
        const instant = deltaSeconds > 0 ? deltaBytes / deltaSeconds : 0;
        task.speed = task.speed ? task.speed * 0.7 + instant * 0.3 : instant;
    }
    task.lastSampleAt = now;
    task.lastSampleBytes = task.bytesDone;

    const remaining = Math.max(0, task.bytesTotal - task.bytesDone);
    return {
        taskId: task.id,
        op: task.op,
        status: task.status,
        phase: task.phase,
        index: task.index,
        total: task.total,
        bytesDone: task.bytesDone,
        bytesTotal: task.bytesTotal,
        speed: Math.max(0, Math.round(task.speed || 0)),
        eta: task.speed > 0 ? Math.round(remaining / task.speed) : null,
        file: task.currentFile,
        targetDir: task.targetDir,
        pending: queue.length
    };
}

function emitProgress(task, immediate = false) {
    if (immediate) {
        if (task.progressTimer) {
            clearTimeout(task.progressTimer);
            task.progressTimer = null;
        }
        sendEvent('filecommander.transfer.progress', progressPayload(task));
        return;
    }
    if (task.progressTimer) return;
    task.progressTimer = setTimeout(() => {
        task.progressTimer = null;
        sendEvent('filecommander.transfer.progress', progressPayload(task));
    }, PROGRESS_INTERVAL);
}

function emitDone(task, status) {
    task.status = status;
    if (task.progressTimer) {
        clearTimeout(task.progressTimer);
        task.progressTimer = null;
    }
    sendEvent('filecommander.transfer.progress', progressPayload(task));
    sendEvent('filecommander.transfer.done', {
        taskId: task.id,
        op: task.op,
        status,
        targetDir: task.targetDir,
        copied: task.op !== 'delete' ? task.copied : 0,
        deleted: task.op === 'delete' ? task.deleted : 0,
        skipped: task.skipped,
        failed: task.failed,
        errors: task.errors.slice(0, 20)
    });
    pruneTasks();
}

/** 只保留最近 20 个已结束任务，避免长会话内存增长 */
function pruneTasks() {
    const finishedTasks = [...tasks.values()].filter((task) => (
        task.status === 'done' || task.status === 'cancelled' || task.status === 'failed'
    ));
    if (finishedTasks.length <= 20) return;
    for (const task of finishedTasks.slice(0, finishedTasks.length - 20)) {
        tasks.delete(task.id);
    }
}

/**
 * 读取目标已存在时的处理策略；目录对目录默认合并，不打扰用户。
 * @returns {Promise<'proceed'|'merge'|'overwrite'|'skip'|'rename'|'cancel'>}
 */
async function askConflict(task, source, target, sourceKind) {
    const targetStat = await lstatOrNull(target);
    if (!targetStat) return 'proceed';
    const targetKind = kindOf(targetStat);
    const policy = task.applyPolicy || task.policy;

    if (sourceKind === 'dir' && targetKind === 'dir') {
        // 目录对目录默认合并；显式选择跳过/重命名时按用户策略
        if (policy === 'skip' || policy === 'rename') return policy;
        return 'merge';
    }
    if (policy !== 'ask') return policy;

    task.status = 'waiting';
    task.currentFile = source;
    emitProgress(task, true);
    sendEvent('filecommander.transfer.conflict', {
        taskId: task.id,
        source,
        target,
        sourceKind,
        targetKind
    });

    const decision = await new Promise((resolve) => {
        task.conflictResolver = resolve;
    });
    task.conflictResolver = null;
    task.status = 'running';
    emitProgress(task, true);
    if (decision === 'cancel') throw cancelError();
    return decision;
}

/** 目标目录内生成不冲突的名称：`name (1).ext` */
async function uniquePath(dest) {
    const dir = path.dirname(dest);
    const ext = path.extname(dest);
    const stem = path.basename(dest, ext);
    for (let index = 1; index < 10000; index += 1) {
        const candidate = path.join(dir, `${stem} (${index})${ext}`);
        const stat = await lstatOrNull(candidate);
        if (!stat) return candidate;
    }
    return path.join(dir, `${stem} (${Date.now()})${ext}`);
}

/**
 * 同目录复制时的自动命名：copy1_原名、copy2_原名……取第一个未被占用的序号。
 * 与 doubleCommander 一致：复制到自身所在目录时不再询问，直接生成副本。
 */
async function duplicatePath(source, targetDir) {
    const name = path.basename(source);
    for (let index = 1; index < 10000; index += 1) {
        const candidate = path.join(targetDir, `copy${index}_${name}`);
        const stat = await lstatOrNull(candidate);
        if (!stat) return candidate;
    }
    return path.join(targetDir, `copy${Date.now()}_${name}`);
}

async function removeTarget(target) {
    const stat = await lstatOrNull(target);
    if (!stat) return;
    try {
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
            await fsp.rm(toFsPath(target), { recursive: true, force: true });
        } else {
            await fsp.unlink(toFsPath(target));
        }
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

/**
 * 用系统命令复制目录树（跨平台）。
 * 比逐文件复制更健壮：处理硬链接、设备文件、socket 等特殊类型，
 * 且保留所有属性（权限/时间戳/所有者/扩展属性/ACL）。
 *
 * Linux / macOS:
 *   非合并：cp -a source target          → 创建 target 为 source 的副本
 *   合并：   cp -a source/. target/      → 把 source 内容合并进已存在的 target
 *
 * Windows: robocopy 天然就是合并语义（复制匹配文件 + 添加新文件），
 *   /E /COPYALL /R:3 /W:3 /NFL /NDL /NJH /NJS
 *
 * 注意：robocopy 退出码 0-7 都是成功（8+ 才是错误），和普通命令不同。
 */
function copyWithSystem(task, source, target, isMerge = false) {
    return new Promise((resolve, reject) => {
        task.currentFile = source;
        emitProgress(task, true);

        let cmd, args;
        if (process.platform === 'win32') {
            // robocopy 天然是合并语义，不需要额外处理
            cmd = 'robocopy';
            args = [
                source, target,
                '/E',           // 递归含空目录
                '/COPYALL',     // 保留全部属性
                '/R:3',         // 重试 3 次
                '/W:3',         // 间隔 3s
                '/NFL', '/NDL', // 不输出文件/目录列表
                '/NJH', '/NJS'  // 不输出头部/摘要
            ];
            LOG_debug(`robocopy ${source} ${target} /E /COPYALL /R:3 /W:3`);
        } else {
            // Linux / macOS：合并时用 source/. target/ 语法（尾部斜杠+点）
            // 这样 cp 会把 source 目录里的内容复制进 target，而不是创建 target/source
            if (isMerge) {
                cmd = 'cp';
                args = ['-a', '--', `${source}/.`, `${target}/`];
                LOG_debug(`cp -a ${source}/. ${target}/  (merge)`);
            } else {
                cmd = 'cp';
                args = ['-a', '--', source, target];
                LOG_debug(`cp -a ${source} ${target}`);
            }
        }

        let stderr = '';
        let stdout = '';
        const child = spawn(cmd, args, { windowsHide: true });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.on('error', (err) => {
            LOG_error(`copyWithSystem spawn error: ${err.message}`);
            reject(err);
        });
        child.on('close', (code) => {
            if (process.platform === 'win32') {
                // robocopy 退出码 0-7 表示不同程度的成功
                // 0: 无文件被复制, 1: 所有文件已复制, 2: 额外文件, 4: 有一些未复制, 8+: 真正错误
                if (code < 8) {
                    LOG_info(`robocopy done exit=${code} source=${source} target=${target}`);
                    resolve();
                } else {
                    const err = new Error(stderr.trim() || stdout.trim() || `robocopy exited with ${code}`);
                    err.code = 'CP_FAILED';
                    LOG_error(`robocopy failed exit=${code} stderr=${stderr.trim()}`);
                    reject(err);
                }
            } else {
                if (code === 0) {
                    LOG_info(`cp done source=${source} target=${target} merge=${isMerge}`);
                    resolve();
                } else {
                    const err = new Error(stderr.trim() || `cp exited with ${code}`);
                    err.code = 'CP_FAILED';
                    LOG_error(`cp failed exit=${code} stderr=${stderr.trim()} source=${source} target=${target}`);
                    reject(err);
                }
            }
        });
    });
}

/**
 * 用系统命令强制删除（跨平台）。
 * 比 fsp.rm({ recursive:true, force:true }) 更可靠：
 *   Node.js 遇到 lock 文件（EBUSY/EPERM）时只是跳过，导致父目录空不了 → rmdir ENOTEMPTY
 *   系统命令 rm -rf / rmdir /s /q 才是真正的强制递归删除
 *
 * Linux / macOS: rm -rf path
 * Windows:      rmdir /s /q path（目录）或 del /f path（文件）
 */
function removeWithSystem(target, kind) {
    return new Promise((resolve, reject) => {
        let cmd, args;
        if (process.platform === 'win32') {
            if (kind === 'dir') {
                cmd = 'rmdir';
                args = ['/s', '/q', target];
            } else {
                cmd = 'del';
                args = ['/f', target];
            }
            LOG_debug(`${cmd} ${args.join(' ')}`);
        } else {
            cmd = 'rm';
            args = ['-rf', '--', target];
            LOG_debug(`rm -rf -- ${target}`);
        }

        let stderr = '';
        const child = spawn(cmd, args, { windowsHide: true });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (err) => { reject(err); });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                const err = new Error(stderr.trim() || `${cmd} exited with ${code}`);
                err.code = 'RM_FAILED';
                reject(err);
            }
        });
    });
}

async function copyFile(task, source, target, stat) {
    const dir = path.dirname(target);
    const base = path.basename(target);
    const temp = path.join(dir, `.${base}${PART_SUFFIX}`);
    const controller = new AbortController();
    task.abort = controller;
    task.currentFile = source;

    const transform = new Transform({
        transform(chunk, _encoding, callback) {
            task.bytesDone += chunk.length;
            emitProgress(task);
            callback(null, chunk);
        }
    });

    try {
        await pipeline(
            fs.createReadStream(toFsPath(source), { highWaterMark: HIGH_WATER_MARK }),
            transform,
            fs.createWriteStream(toFsPath(temp), { highWaterMark: HIGH_WATER_MARK }),
            { signal: controller.signal }
        );

        const written = await fsp.stat(toFsPath(temp));
        if (written.size !== stat.size) {
            throw Object.assign(new Error('Size mismatch'), { code: 'SIZE_MISMATCH' });
        }
        // 保留源文件的全部属性：时间戳 + 权限位（mode）
        await fsp.utimes(toFsPath(temp), stat.atime, stat.mtime).catch(() => {});
        await fsp.chmod(toFsPath(temp), stat.mode).catch(() => {});
        await fsp.rename(toFsPath(temp), toFsPath(target));
    } catch (error) {
        await fsp.unlink(toFsPath(temp)).catch(() => {});
        if (isCancelled(task)) throw cancelError();
        throw error;
    } finally {
        task.abort = null;
    }
}

async function copyLink(task, source, target) {
    const linkTarget = await fsp.readlink(toFsPath(source));
    task.currentFile = source;
    try {
        await fsp.symlink(linkTarget, toFsPath(target));
    } catch (error) {
        if (error.code === 'EEXIST') {
            await fsp.unlink(toFsPath(target)).catch(() => {});
            await fsp.symlink(linkTarget, toFsPath(target));
            return;
        }
        // Windows 无符号链接权限：降级复制目标内容
        if (process.platform === 'win32' && (error.code === 'EPERM' || error.code === 'EACCES')) {
            const real = await fsp.stat(toFsPath(source));
            if (real.isDirectory()) {
                await copyEntry(task, await fsp.realpath(toFsPath(source)), target);
            } else {
                await copyFile(task, source, target, real);
            }
            return;
        }
        throw error;
    }
}

async function countTree(root, task = null) {
    const stat = await lstatOrNull(root);
    if (!stat) return { files: 0, bytes: 0 };
    if (stat.isFile()) return { files: 1, bytes: stat.size };
    if (stat.isSymbolicLink()) return { files: 1, bytes: 0 };
    if (!stat.isDirectory()) return { files: 0, bytes: 0 };

    let files = 0;
    let bytes = 0;
    const walk = async (dir) => {
        if (task) throwIfCancelled(task);
        let dirents;
        try {
            dirents = await fsp.readdir(toFsPath(dir), { withFileTypes: true });
        } catch (error) {
            return;
        }
        for (const dirent of dirents) {
            if (task) throwIfCancelled(task);
            const child = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                await walk(child);
            } else if (dirent.isFile()) {
                files += 1;
                try {
                    bytes += (await fsp.lstat(toFsPath(child))).size;
                } catch (error) {
                    // 统计失败按 0 计
                }
            } else if (dirent.isSymbolicLink()) {
                files += 1;
            }
        }
    };
    await walk(root);
    return { files, bytes };
}

// ---------------------------------------------------------------------------
// 删除（op='delete'）
// ---------------------------------------------------------------------------
/**
 * 将单个 root（文件/目录/链接）整体送入系统回收站。
 * 不再递归删子项——回收站天然支持目录整体回收，且保留恢复能力。
 * scan 阶段已统计 files/bytes 用于进度展示。
 */
async function deleteRoot(task, root) {
    throwIfCancelled(task);
    task.currentFile = root.src;
    const stat = await lstatOrNull(root.src);
    if (!stat) {
        // 路径不存在：直接记为已处理
        task.deleted += root.files || 1;
        task.index += root.files || 1;
        emitProgress(task, true);
        return;
    }
    if (root.kind === 'other') {
        task.skipped += 1;
        task.errors.push({ path: root.src, code: 'UNSUPPORTED', message: 'Unsupported file type' });
        return;
    }
    try {
        await shell.trashItem(toFsPath(root.src));
        task.deleted += root.files || 1;
        task.index += root.files || 1;
        task.bytesDone += root.bytes || 0;
        emitProgress(task, true);
    } catch (error) {
        if (error.code === 'ENOENT') {
            task.deleted += root.files || 1;
            task.index += root.files || 1;
            emitProgress(task, true);
            return;
        }
        // trashItem 在部分场景（如极旧 Linux 无 gio/trash）可能失败
        task.errors.push({
            path: root.src,
            code: error.code || 'TRASH_FAILED',
            message: error.message || 'Failed to move to trash'
        });
        task.failed += 1;
        emitProgress(task, true);
    }
}

/**
 * 递归复制单项，冲突按任务策略处理。
 */
async function copyEntry(task, source, target) {
    throwIfCancelled(task);
    const stat = await lstatOrNull(source);
    if (!stat) throw Object.assign(new Error('Missing source'), { code: 'ENOENT' });

    const kind = kindOf(stat);
    if (kind === 'other') {
        task.skipped += 1;
        task.errors.push({ path: source, code: 'UNSUPPORTED', message: 'Unsupported file type' });
        return;
    }

    let destination = target;
    let decision = 'proceed';
    const targetStat = await lstatOrNull(target);
    if (targetStat) {
        decision = await askConflict(task, source, target, kind);
    }

    if (decision === 'skip') {
        const counts = await countTree(source, task);
        task.skipped += counts.files;
        task.index += counts.files;
        task.bytesDone += counts.bytes;
        emitProgress(task, true);
        return;
    }
    if (decision === 'rename') destination = await uniquePath(target);
    if (decision === 'overwrite' && targetStat) await removeTarget(target);

    if (kind === 'dir') {
        task.currentFile = source;
        try {
            await fsp.mkdir(toFsPath(destination), { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        const dirents = await fsp.readdir(toFsPath(source), { withFileTypes: true });
        for (const dirent of dirents) {
            throwIfCancelled(task);
            await copyEntry(
                task,
                path.join(source, dirent.name),
                path.join(destination, dirent.name)
            );
        }
        await fsp.utimes(toFsPath(destination), stat.atime, stat.mtime).catch(() => {});
        return;
    }

    if (kind === 'link') {
        await copyLink(task, source, destination);
        task.copied += 1;
        task.index += 1;
        emitProgress(task, true);
        return;
    }

    await copyFile(task, source, destination, stat);
    task.copied += 1;
    task.index += 1;
    emitProgress(task, true);
}

/** 移动单个顶层项：同卷 rename，跨卷或目录合并时降级为系统命令 + 删源 */
async function moveRoot(task, root) {
    const targetBase = path.join(task.targetDir, root.name);
    if (samePath(root.src, targetBase)) {
        // 同目录内移动是无操作：不弹冲突框，更不能走 overwrite 把源删掉
        task.skipped += root.files;
        task.index += root.files;
        task.bytesDone += root.bytes;
        emitProgress(task, true);
        return;
    }
    const decision = await askConflict(task, root.src, targetBase, root.kind);

    if (decision === 'skip') {
        task.skipped += root.files;
        task.index += root.files;
        task.bytesDone += root.bytes;
        emitProgress(task, true);
        return;
    }

    const isMerge = decision === 'merge';
    const destination = decision === 'rename' ? await uniquePath(targetBase) : targetBase;
    if (decision === 'overwrite') await removeTarget(targetBase);

    // 同分区优先 rename（秒完成）
    try {
        await fsp.rename(toFsPath(root.src), toFsPath(destination));
        task.copied += root.files;
        task.index += root.files;
        task.bytesDone += root.bytes;
        emitProgress(task, true);
        LOG_info(`rename ok: ${root.src} -> ${destination}`);
        return;
    } catch (error) {
        const mergeFallback = root.kind === 'dir'
            && (error.code === 'ENOTEMPTY' || error.code === 'EEXIST');
        if (error.code !== 'EXDEV' && !mergeFallback) {
            LOG_error(`rename failed: ${root.src} -> ${destination} code=${error.code}`);
            throw error;
        }
        LOG_info(`rename ${error.code}, falling back to system copy: ${root.src} -> ${destination} merge=${isMerge}`);
    }

    // 跨分区或目录合并 → 用系统命令做跨文件系统复制
    throwIfCancelled(task);
    try {
        await copyWithSystem(task, root.src, destination, isMerge);
    } catch (cpError) {
        LOG_warn(`copyWithSystem failed (${cpError.code}), fallback to copyEntry: ${root.src}`);
        try {
            await copyEntry(task, root.src, destination);
        } catch (entryError) {
            if (entryError.code === 'ECANCELLED') throw entryError;
            LOG_error(`copyEntry also failed: ${root.src} code=${entryError.code} msg=${entryError.message}`);
            task.errors.push({
                path: root.src,
                code: entryError.code || 'COPY_FAILED',
                message: entryError.message || 'Cross-device copy failed'
            });
            task.failed += root.files;
            emitProgress(task, true);
            return;
        }
    }

    throwIfCancelled(task);
    task.copied += root.files;
    task.index += root.files;
    task.bytesDone += root.bytes;
    emitProgress(task, true);

    // 复制成功后删除源——用系统命令（rm -rf / rmdir /s /q）而非 fsp.rm
    // 原因：Node.js fsp.rm({ recursive:true, force:true }) 遇到 lock 文件（EBUSY/EPERM）
    // 时只是跳过不删，导致父目录永远空不了 → rmdir 报 ENOTEMPTY。
    // 系统命令 rm -rf / rmdir /s /q 才是真正的强制递归删除（doubleCommander 也这么做）
    try {
        await removeWithSystem(root.src, root.kind);
        LOG_info(`rm source ok (system): ${root.src}`);
    } catch (rmErr) {
        LOG_error(`rm source failed (system): ${root.src} code=${rmErr.code} msg=${rmErr.message}`);
        task.errors.push({
            path: root.src,
            code: rmErr.code || 'RM_FAILED',
            message: rmErr.message || 'Failed to remove source after copy'
        });
        task.failed += root.files;
        emitProgress(task, true);
    }
}

async function scanSources(task) {
    for (const source of task.sources) {
        throwIfCancelled(task);
        const stat = await lstatOrNull(source);
        if (!stat) {
            if (task.op === 'delete') {
                // 删除时不存在的路径直接计入 roots，由 deleteTree 记为已处理
                task.roots.push({
                    src: source,
                    name: path.basename(source),
                    kind: 'missing',
                    files: 1,
                    bytes: 0
                });
                task.total += 1;
                emitProgress(task, true);
                continue;
            }
            task.failed += 1;
            task.errors.push({ path: source, code: 'ENOENT', message: 'Source not found' });
            continue;
        }
        const root = {
            src: source,
            name: path.basename(source),
            kind: kindOf(stat),
            files: 0,
            bytes: 0
        };
        if (root.kind === 'file') {
            root.files = 1;
            root.bytes = stat.size;
        } else if (root.kind === 'link') {
            root.files = 1;
        } else if (root.kind === 'dir') {
            const counts = await countTree(source, task);
            root.files = counts.files;
            root.bytes = counts.bytes;
        }
        task.total += root.files;
        task.bytesTotal += root.bytes;
        task.roots.push(root);
        emitProgress(task, true);
    }
}

async function checkFreeSpace(task) {
    try {
        const stat = await fsp.statfs(toFsPath(task.targetDir));
        const free = Number(stat.bavail) * Number(stat.bsize);
        if (task.bytesTotal > free) {
            task.warning = 'ENOSPC';
            sendEvent('filecommander.transfer.progress', {
                ...progressPayload(task),
                warning: 'ENOSPC',
                free
            });
        }
    } catch (error) {
        // 无法读取磁盘空间时不阻断任务
    }
}

async function run(task) {
    activeTask = task;
    task.status = 'scanning';
    task.phase = 'scan';
    emitProgress(task, true);

    try {
        await scanSources(task);
        throwIfCancelled(task);
        if (task.op === 'copy' || task.op === 'move') {
            await checkFreeSpace(task);
        }
        throwIfCancelled(task);

        task.status = 'running';
        task.phase = task.op;
        emitProgress(task, true);

        for (const root of task.roots) {
            throwIfCancelled(task);
            if (root.kind === 'other') {
                task.skipped += 1;
                task.errors.push({ path: root.src, code: 'UNSUPPORTED', message: 'Unsupported file type' });
                continue;
            }
            try {
                if (task.op === 'delete') {
                    await deleteRoot(task, root);
                } else if (task.op === 'move') {
                    await moveRoot(task, root);
                } else {
                    const target = path.join(task.targetDir, root.name);
                    // 同一目录内复制：自动生成 copyN_原名，不打断用户
                    const destination = samePath(root.src, target)
                        ? await duplicatePath(root.src, task.targetDir)
                        : target;
                    await copyEntry(task, root.src, destination);
                }
            } catch (error) {
                if (error.code === 'ECANCELLED') throw error;
                task.failed += 1;
                task.errors.push({
                    path: root.src,
                    code: error.code || 'UNKNOWN',
                    message: error.message || String(error)
                });
                emitProgress(task, true);
            }
        }

        LOG_info(`run done task=${task.id} op=${task.op} copied=${task.copied} skipped=${task.skipped} failed=${task.failed}`);
        emitDone(task, task.cancelled ? 'cancelled' : 'done');
    } catch (error) {
        if (error.code === 'ECANCELLED') {
            LOG_info(`run cancelled task=${task.id}`);
            emitDone(task, 'cancelled');
        } else {
            LOG_error(`run failed task=${task.id} code=${error.code} msg=${error.message}`);
            task.failed += 1;
            task.errors.push({
                path: task.currentFile || task.targetDir,
                code: error.code || 'UNKNOWN',
                message: error.message || String(error)
            });
            emitDone(task, 'failed');
        }
    } finally {
        activeTask = null;
        kick();
    }
}

function kick() {
    if (activeTask) return;
    const next = queue.shift();
    if (!next) return;
    run(next);
}

async function start({ op, sources, targetDir, policy }) {
    if (op !== 'copy' && op !== 'move' && op !== 'delete') return { ok: false, error: 'EINVAL' };
    if (!Array.isArray(sources) || !sources.length) return { ok: false, error: 'EINVAL' };

    LOG_info(`start op=${op} sources=${sources.length} target=${targetDir || '(none)'} policy=${policy}`);

    let targetPath = '';
    const needTarget = op === 'copy' || op === 'move';
    if (needTarget) {
        if (!isAbsolutePath(targetDir)) return { ok: false, error: 'EINVAL' };
        const targetStat = await lstatOrNull(targetDir);
        if (!targetStat) return { ok: false, error: 'ENOENT' };
        if (!targetStat.isDirectory()) return { ok: false, error: 'ENOTDIR' };
        targetPath = targetDir;
    }

    const realTarget = needTarget ? await fsp.realpath(toFsPath(targetPath)).catch(() => targetPath) : null;
    const validSources = [];
    for (const source of sources) {
        if (!isAbsolutePath(source)) return { ok: false, error: 'EINVAL' };
        const stat = await lstatOrNull(source);
        if (!stat) {
            if (op === 'delete') {
                // 删除时路径不存在：记为已处理，继续后续
                validSources.push(source);
                continue;
            }
            return { ok: false, error: 'ENOENT' };
        }
        if (needTarget && stat.isDirectory()) {
            const realSource = await fsp.realpath(toFsPath(source)).catch(() => source);
            if (samePath(realTarget, realSource) || isInside(realTarget, realSource)) {
                return { ok: false, error: 'SELF_TARGET' };
            }
        }
        validSources.push(source);
    }

    seq += 1;
    const task = {
        id: `transfer-${Date.now().toString(36)}-${seq}`,
        op,
        sources: validSources,
        targetDir: targetPath || null,
        policy: POLICIES.includes(policy) ? policy : 'ask',
        applyPolicy: null,
        status: 'queued',
        phase: 'scan',
        index: 0,
        total: 0,
        bytesDone: 0,
        bytesTotal: 0,
        copied: 0,
        deleted: 0,
        skipped: 0,
        failed: 0,
        speed: 0,
        currentFile: null,
        roots: [],
        errors: [],
        cancelled: false,
        abort: null,
        conflictResolver: null,
        progressTimer: null,
        lastSampleAt: 0,
        lastSampleBytes: 0
    };
    tasks.set(task.id, task);
    queue.push(task);
    kick();
    return { ok: true, taskId: task.id };
}

function respond({ taskId, decision, applyToAll }) {
    const task = tasks.get(String(taskId));
    if (!task || !task.conflictResolver) return { ok: false, error: 'EINVAL' };
    if (!['overwrite', 'skip', 'rename', 'cancel'].includes(decision)) {
        return { ok: false, error: 'EINVAL' };
    }
    if (applyToAll && decision !== 'cancel') task.applyPolicy = decision;
    const resolve = task.conflictResolver;
    task.conflictResolver = null;
    resolve(decision);
    return { ok: true };
}

function cancel(taskId) {
    const task = tasks.get(String(taskId));
    if (!task) return { ok: false, error: 'ENOENT' };

    task.cancelled = true;

    if (task.status === 'queued') {
        const index = queue.indexOf(task);
        if (index >= 0) queue.splice(index, 1);
        emitDone(task, 'cancelled');
        return { ok: true };
    }

    if (task.conflictResolver) {
        const resolve = task.conflictResolver;
        task.conflictResolver = null;
        resolve('cancel');
    }
    if (task.abort) task.abort.abort();
    return { ok: true };
}

function cancelAll() {
    for (const task of tasks.values()) {
        if (task.status === 'queued' || task.status === 'scanning'
            || task.status === 'running' || task.status === 'waiting') {
            cancel(task.id);
        }
    }
}

function hasRunning() {
    return tasks.size > 0 && [...tasks.values()].some((task) => (
        task.status === 'queued' || task.status === 'scanning'
        || task.status === 'running' || task.status === 'waiting'
    ));
}

function list() {
    return {
        tasks: [...tasks.values()].map((task) => ({
            id: task.id,
            op: task.op,
            status: task.status,
            targetDir: task.targetDir,
            index: task.index,
            total: task.total,
            bytesDone: task.bytesDone,
            bytesTotal: task.bytesTotal,
            copied: task.copied,
            skipped: task.skipped,
            failed: task.failed
        }))
    };
}

module.exports = { init, start, respond, cancel, cancelAll, hasRunning, list };
