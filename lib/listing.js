/**
 * 两阶段列目录
 *
 * 第一阶段：readdir 立即返回名称与基础类型，界面马上可渲染。
 * 第二阶段：lstat/stat 并发 32，按 100ms 或 200 条分批推送，渲染层合并。
 */
const fsp = require('fs').promises;
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
            hidden: isHidden(name), linkTarget: null, readable: false
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
        readable: true
    };

    if (lst.isSymbolicLink()) {
        entry.kind = 'link';
        try {
            const target = await fsp.stat(full);
            entry.linkTarget = target.isDirectory() ? 'dir' : 'file';
            entry.mtime = target.mtimeMs;
            entry.size = target.isDirectory() ? null : target.size;
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
 * @param {{dir: string, showHidden: boolean}} options
 * @param {(channel: string, payload: object) => void} send
 */
async function listDir({ dir, showHidden }, send) {
    let stat;
    try {
        stat = await fsp.stat(dir);
    } catch (error) {
        return { ok: false, dir, error: error.code || 'ENOENT' };
    }
    if (!stat.isDirectory()) return { ok: false, dir, error: 'ENOTDIR' };

    let dirents;
    try {
        dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
        return { ok: false, dir, error: error.code || 'EACCES' };
    }

    // 同一目录的新请求作废旧统计任务，避免旧批次覆盖新结果
    for (const [token, session] of sessions) {
        if (session.dir === dir) {
            session.cancelled = true;
            sessions.delete(token);
        }
    }

    const visible = dirents.filter((dirent) => showHidden || !isHidden(dirent.name));

    const token = (tokenSeq += 1);
    const session = { token, dir, cancelled: false };
    sessions.set(token, session);

    const entries = visible.map((dirent) => ({
        name: dirent.name,
        path: path.join(dir, dirent.name),
        kind: baseKind(dirent),
        size: null,
        mtime: null,
        hidden: isHidden(dirent.name),
        linkTarget: null,
        readable: true
    }));

    startStats(session, dir, visible.map((dirent) => dirent.name), send);

    return { ok: true, token, dir, entries };
}

function cancel(token) {
    const session = sessions.get(Number(token));
    if (!session) return;
    session.cancelled = true;
    sessions.delete(session.token);
}

module.exports = { listDir, cancel };
