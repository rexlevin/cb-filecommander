/**
 * 两阶段列目录
 *
 * 第一阶段：readdir 立即返回名称与基础类型，界面马上可渲染。
 * 第二阶段：lstat/stat 并发 32，按 100ms 或 200 条分批推送，渲染层合并。
 */
const fsp = require('./fsx').promises;
const { isNativeExecutable } = require('./exec');
const path = require('path');

const STAT_CONCURRENCY = 32;
const STAT_BATCH_SIZE = 200;
const STAT_FLUSH_MS = 100;

let tokenSeq = 0;
const sessions = new Map();

function isHidden(name) {
    return name.startsWith('.');
}

function baseKind(dirent) {
    if (dirent.isDirectory()) return 'dir';
    if (dirent.isSymbolicLink()) return 'link';
    if (dirent.isFile()) return 'file';
    return 'other';
}

async function statEntry(dir, name) {
    const full = path.join(dir, name);
    let lst;
    try {
        lst = await fsp.lstat(full);
    } catch (error) {
        return {
            name, path: full, kind: 'other', size: null, mtime: null,
            hidden: isHidden(name), linkTarget: null, executable: false, readable: false
        };
    }

    const entry = {
        name,
        path: full,
        kind: 'other',
        size: null,
        mtime: lst.mtimeMs,
        hidden: isHidden(name),
        linkTarget: null,
        executable: false,
        readable: true
    };

    if (lst.isSymbolicLink()) {
        entry.kind = 'link';
        try {
            const target = await fsp.stat(full);
            entry.linkTarget = target.isDirectory() ? 'dir' : 'file';
            entry.mtime = target.mtimeMs;
            entry.size = target.isDirectory() ? null : target.size;
            // 跟随链接取真实目标：只有带执行位的 ELF/AppImage 才算可直接运行，
            // 脚本（如 application/x-shellscript）仍由系统关联打开
            entry.executable = target.isFile()
                && (Number(target.mode) & 0o111) !== 0
                && await isNativeExecutable(full);
        } catch (error) {
            entry.linkTarget = 'broken';
        }
        return entry;
    }

    if (lst.isDirectory()) {
        entry.kind = 'dir';
    } else if (lst.isFile()) {
        entry.kind = 'file';
        entry.size = lst.size;
        // 只有带执行位的 ELF/AppImage 才算可直接运行，脚本仍交给系统关联打开
        entry.executable = (Number(lst.mode) & 0o111) !== 0 && await isNativeExecutable(full);
    }
    return entry;
}

function startStats(session, dir, names, send) {
    let cursor = 0;
    let batch = [];
    let timer = null;

    function flush() {
        if (!batch.length) return;
        const entries = batch;
        batch = [];
        send('filecommander.dirStats', { token: session.token, dir, entries, done: false });
    }

    function scheduleFlush() {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            if (!session.cancelled) flush();
        }, STAT_FLUSH_MS);
    }

    async function worker() {
        while (!session.cancelled && cursor < names.length) {
            const name = names[cursor];
            cursor += 1;
            const entry = await statEntry(dir, name);
            if (session.cancelled) return;
            batch.push(entry);
            if (batch.length >= STAT_BATCH_SIZE) flush();
            else scheduleFlush();
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(STAT_CONCURRENCY, names.length); i += 1) {
        workers.push(worker());
    }

    Promise.all(workers)
        .then(() => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (session.cancelled) return;
            flush();
            send('filecommander.dirStats', { token: session.token, dir, entries: [], done: true });
        })
        .catch(() => {
            session.cancelled = true;
        })
        .finally(() => {
            sessions.delete(session.token);
        });
}

/**
 * 解析链接/联接的真实目标；返回空字符串表示无法解析或与自身相同。
 *
 * 只用于 Windows 兼容性联接（Application Data / Cookies 等带 deny ACL 的联接）。
 * 其它平台保持原有的 stat/readdir 错误语义，不做额外解析。
 */
async function tryRealpath(dir) {
    if (process.platform !== 'win32') return '';
    try {
        const real = await fsp.realpath(dir);
        return real && real !== dir ? real : '';
    } catch (error) {
        return '';
    }
}

/**
 * @param {{dir: string, showHidden: boolean}} options
 * @param {(channel: string, payload: object) => void} send
 */
async function listDir({ dir, showHidden }, send) {
    // listDirPath 可能因 Windows 兼容性联接而变成解析后的真实目录
    let listDirPath = dir;
    let stat;
    try {
        stat = await fsp.stat(dir);
    } catch (error) {
        const real = await tryRealpath(dir);
        if (!real) return { ok: false, dir, error: error.code || 'ENOENT' };
        listDirPath = real;
        try {
            stat = await fsp.stat(real);
        } catch (realError) {
            return { ok: false, dir, error: realError.code || error.code || 'ENOENT' };
        }
    }
    if (!stat.isDirectory()) return { ok: false, dir, error: 'ENOTDIR' };

    let dirents;
    try {
        dirents = await fsp.readdir(listDirPath, { withFileTypes: true });
    } catch (error) {
        // Windows 的兼容性联接（如 %USERPROFILE%\Application Data、Cookies、My Documents）
        // 带 deny ACL，只能解析到真实目标后再列目录；直接列目录会报 EACCES/EPERM。
        const real = listDirPath === dir ? await tryRealpath(dir) : '';
        if (!real) return { ok: false, dir, error: error.code || 'EACCES' };
        listDirPath = real;
        try {
            dirents = await fsp.readdir(listDirPath, { withFileTypes: true });
        } catch (realError) {
            return { ok: false, dir, error: realError.code || error.code || 'EACCES' };
        }
    }

    // 同一目录的新请求作废旧统计任务，避免旧批次覆盖新结果
    for (const [token, session] of sessions) {
        if (session.dir === listDirPath || session.dir === dir) {
            session.cancelled = true;
            sessions.delete(token);
        }
    }

    const visible = dirents.filter((dirent) => showHidden || !isHidden(dirent.name));

    const token = (tokenSeq += 1);
    const session = { token, dir: listDirPath, cancelled: false };
    sessions.set(token, session);

    const entries = visible.map((dirent) => ({
        name: dirent.name,
        path: path.join(listDirPath, dirent.name),
        kind: baseKind(dirent),
        size: null,
        mtime: null,
        hidden: isHidden(dirent.name),
        linkTarget: null,
        executable: false,
        readable: true
    }));

    startStats(session, listDirPath, visible.map((dirent) => dirent.name), send);

    return { ok: true, token, dir: listDirPath, entries };
}

function cancel(token) {
    const session = sessions.get(Number(token));
    if (!session) return;
    session.cancelled = true;
    sessions.delete(session.token);
}

module.exports = { listDir, cancel };
