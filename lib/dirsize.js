/**
 * 目录大小异步统计
 *
 * 属性弹窗只做一次 lstat 立即返回；目录占用空间由独立任务递归统计，
 * 期间按固定间隔推送累计进度，可随时取消（关闭弹窗 / 切换目标）。
 */
const fsp = require('./fsx').promises;
const path = require('path');
const { isAbsolutePath, toFsPath } = require('./paths');

const READDIR_BATCH = 16;   // 同时 readdir 的目录数
const STAT_BATCH = 32;      // 同时 lstat 的文件数
const FLUSH_MS = 150;       // 进度推送最小间隔

let tokenSeq = 0;
const jobs = new Map();

function emit(send, job, root, state, extra) {
    send('filecommander.propsSize', {
        jobId: job.token,
        path: root,
        size: state.size,
        files: state.files,
        dirs: state.dirs,
        done: false,
        ...extra
    });
}

async function walk(root, job, send) {
    const state = { size: 0, files: 0, dirs: 0 };
    let lastFlush = 0;
    const flush = (extra) => {
        const now = Date.now();
        if (extra || now - lastFlush >= FLUSH_MS) {
            lastFlush = now;
            emit(send, job, root, state, extra);
        }
    };

    const stack = [root];
    while (stack.length && !job.cancelled) {
        const batch = stack.splice(0, READDIR_BATCH);
        const listings = await Promise.all(batch.map(async (dir) => {
            try {
                return await fsp.readdir(toFsPath(dir), { withFileTypes: true });
            } catch (error) {
                return [];
            }
        }));

        const filePaths = [];
        for (let index = 0; index < listings.length; index += 1) {
            for (const entry of listings[index]) {
                // 不跟随符号链接，避免循环目录
                if (entry.isSymbolicLink()) continue;
                const childPath = path.join(batch[index], entry.name);
                if (entry.isDirectory()) {
                    state.dirs += 1;
                    stack.push(childPath);
                } else if (entry.isFile()) {
                    filePaths.push(childPath);
                }
            }
        }

        for (let index = 0; index < filePaths.length && !job.cancelled; index += STAT_BATCH) {
            const chunk = filePaths.slice(index, index + STAT_BATCH);
            const stats = await Promise.all(chunk.map(async (filePath) => {
                try {
                    return await fsp.lstat(toFsPath(filePath));
                } catch (error) {
                    return null;
                }
            }));
            for (const stat of stats) {
                if (!stat) continue;
                state.size += stat.size;
                state.files += 1;
            }
            flush();
        }
    }

    if (job.cancelled) emit(send, job, root, state, { cancelled: true });
    else emit(send, job, root, state, { done: true });
}

async function run(paths, job, send) {
    for (const root of paths) {
        if (job.cancelled) return;
        let stat = null;
        try {
            stat = await fsp.stat(toFsPath(root));
        } catch (error) {
            stat = null;
        }
        if (!stat || !stat.isDirectory()) {
            emit(send, job, root, { size: null, files: 0, dirs: 0 }, { done: true });
            continue;
        }
        await walk(root, job, send);
    }
}

/**
 * @param {{paths: string[], jobId?: string}} payload
 * @param {(channel: string, payload: object) => void} send
 */
function start({ paths, jobId }, send) {
    if (!Array.isArray(paths) || !paths.length) return { ok: false, error: 'EINVAL' };
    if (!paths.every(isAbsolutePath)) return { ok: false, error: 'EINVAL' };

    const token = jobId ? String(jobId) : `dirsize-${(tokenSeq += 1)}`;
    const existing = jobs.get(token);
    if (existing) existing.cancelled = true;
    const job = { token, cancelled: false };
    jobs.set(token, job);

    // setImmediate 让 invoke 响应先回到渲染层，避免首批进度事件被丢弃
    setImmediate(() => {
        run(paths, job, send)
            .catch(() => {})
            .finally(() => {
                if (jobs.get(token) === job) jobs.delete(token);
            });
    });

    return { ok: true, jobId: token };
}

function cancel(jobId) {
    if (jobId === undefined || jobId === null) return { ok: true };
    const job = jobs.get(String(jobId));
    if (!job) return { ok: true };
    job.cancelled = true;
    jobs.delete(job.token);
    return { ok: true };
}

module.exports = { start, cancel };
