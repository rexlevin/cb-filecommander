/**
 * 当前目录监听：fs.watch + 去抖，只通知渲染层刷新，不做递归。
 */
const fs = require('fs');
const path = require('path');

const DEBOUNCE_MS = 200;
const MAX_DIRS = 24;

let sendFn = null;
const watchers = new Map();

function closeWatcher(dir) {
    const item = watchers.get(dir);
    if (!item) return;
    if (item.timer) clearTimeout(item.timer);
    try {
        item.watcher.close();
    } catch (error) {
        // 忽略关闭失败
    }
    watchers.delete(dir);
}

function setWatches(dirs, send) {
    sendFn = send;
    const next = new Set(
        (Array.isArray(dirs) ? dirs : [])
            .filter((dir) => typeof dir === 'string' && dir && path.isAbsolute(dir))
            .slice(0, MAX_DIRS)
    );

    for (const dir of [...watchers.keys()]) {
        if (!next.has(dir)) closeWatcher(dir);
    }

    for (const dir of next) {
        if (watchers.has(dir)) continue;
        try {
            const watcher = fs.watch(dir, { persistent: false }, () => {
                const item = watchers.get(dir);
                if (!item) return;
                if (item.timer) clearTimeout(item.timer);
                item.timer = setTimeout(() => {
                    item.timer = null;
                    if (sendFn) sendFn('filecommander.dirChanged', { dir });
                }, DEBOUNCE_MS);
            });
            watcher.on('error', () => closeWatcher(dir));
            watchers.set(dir, { watcher, timer: null });
        } catch (error) {
            // 目录不可监听时忽略，窗口聚焦刷新兜底
        }
    }
}

module.exports = { setWatches };
