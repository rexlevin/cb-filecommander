/**
 * 文件系统 IPC 注册
 *
 * 渲染层只提交绝对路径与意图；这里统一做参数校验并返回 {ok, error}。
 */
const { ipcMain, shell, app } = require('electron');
const fsp = require('fs').promises;
const listing = require('./listing');
const places = require('./places');
const watch = require('./watch');
const { expandPath, isAbsolutePath } = require('./paths');

function registerIpc({ send }) {
    const sendEvent = (channel, payload) => send(channel, payload);

    ipcMain.handle('filecommander.listDir', (_event, payload) => {
        const dir = payload && payload.dir;
        if (!isAbsolutePath(dir)) return { ok: false, dir, error: 'EINVAL' };
        return listing.listDir({ dir, showHidden: !!(payload && payload.showHidden) }, sendEvent);
    });

    ipcMain.handle('filecommander.listCancel', (_event, payload) => {
        const token = payload && typeof payload === 'object' ? payload.token : payload;
        listing.cancel(token);
        return { ok: true };
    });

    ipcMain.handle('filecommander.path.expand', (_event, payload) => {
        const input = payload && payload.input;
        const baseDir = payload && payload.baseDir;
        if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'EINVAL' };
        return expandPath(input, isAbsolutePath(baseDir) ? baseDir : app.getPath('home'));
    });

    ipcMain.handle('filecommander.places.list', () => places.listPlaces());

    ipcMain.handle('filecommander.fs.freeSpace', async (_event, payload) => {
        const dir = payload && payload.path;
        if (!isAbsolutePath(dir)) return { ok: false };
        try {
            const stat = await fsp.statfs(dir);
            return {
                ok: true,
                free: Number(stat.bavail) * Number(stat.bsize),
                total: Number(stat.blocks) * Number(stat.bsize)
            };
        } catch (error) {
            return { ok: false };
        }
    });

    ipcMain.handle('filecommander.openPath', async (_event, payload) => {
        const target = payload && payload.path;
        if (!isAbsolutePath(target)) return { ok: false, error: 'EINVAL' };
        try {
            await fsp.stat(target);
        } catch (error) {
            return { ok: false, error: error.code || 'ENOENT' };
        }
        const detail = await shell.openPath(target);
        return detail ? { ok: false, error: 'OPEN_FAILED', detail } : { ok: true };
    });

    ipcMain.handle('filecommander.watch.set', (_event, payload) => {
        watch.setWatches(payload && payload.dirs, sendEvent);
        return { ok: true };
    });

    ipcMain.handle('filecommander.openExternal', async (_event, payload) => {
        const url = payload && payload.url;
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: 'EINVAL' };
        try {
            await shell.openExternal(url);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: 'OPEN_FAILED' };
        }
    });
}

module.exports = { registerIpc };
