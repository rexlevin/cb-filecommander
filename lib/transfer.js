/**
 * 复制 / 移动任务引擎
 *
 * 全局单队列顺序执行。流程：校验 → 扫描统计 → 逐项复制/移动（冲突可暂停）→ 汇总。
 * 复制文件先写 `.<name>.filecommander-part` 临时文件，校验大小后原子 rename；
 * 取消或失败会删除临时文件，已完成项保留。
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { shell } = require('electron');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { isAbsolutePath, toFsPath } = require('./paths');

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
        await fsp.utimes(toFsPath(temp), stat.atime, stat.mtime).catch(() => {});
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

/** 移动单个顶层项：同卷 rename，跨卷或目录合并时降级为复制 + 删除源 */
async function moveRoot(task, root) {
    const targetBase = path.join(task.targetDir, root.name);
    const decision = await askConflict(task, root.src, targetBase, root.kind);

    if (decision === 'skip') {
        task.skipped += root.files;
        task.index += root.files;
        task.bytesDone += root.bytes;
        emitProgress(task, true);
        return;
    }

    const destination = decision === 'rename' ? await uniquePath(targetBase) : targetBase;
    if (decision === 'overwrite') await removeTarget(targetBase);

    try {
        await fsp.rename(toFsPath(root.src), toFsPath(destination));
        task.copied += root.files;
        task.index += root.files;
        task.bytesDone += root.bytes;
        emitProgress(task, true);
        return;
    } catch (error) {
        // 目录合并时 rename 会失败，继续走递归复制；其它错误直接上报
        const mergeFallback = root.kind === 'dir'
            && (error.code === 'ENOTEMPTY' || error.code === 'EEXIST');
        if (error.code !== 'EXDEV' && !mergeFallback) throw error;
    }

    const skippedBefore = task.skipped;
    const failedBefore = task.failed;
    await copyEntry(task, root.src, destination);
    throwIfCancelled(task);
    // 有跳过或失败项时保留源，避免移动丢数据
    if (task.skipped > skippedBefore || task.failed > failedBefore) return;
    if (root.kind === 'dir') {
        await fsp.rm(toFsPath(root.src), { recursive: true, force: true });
    } else {
        await fsp.unlink(toFsPath(root.src));
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
                    await copyEntry(task, root.src, path.join(task.targetDir, root.name));
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

        emitDone(task, task.cancelled ? 'cancelled' : 'done');
    } catch (error) {
        if (error.code === 'ECANCELLED') {
            emitDone(task, 'cancelled');
        } else {
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
