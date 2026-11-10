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
const ops = require('./ops');
const transfer = require('./transfer');
const { validateName, nameExists } = require('./names');
const { expandPath, isAbsolutePath } = require('./paths');

function registerIpc({ send }) {
    const sendEvent = (channel, payload) => send(channel, payload);
    transfer.init({ send: sendEvent });

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

    // -----------------------------------------------------------------------
    // 新建 / 重命名 / 属性
    // -----------------------------------------------------------------------
    ipcMain.handle('filecommander.path.validateName', async (_event, payload) => {
        const parent = payload && payload.parent;
        const kind = payload && payload.kind === 'dir' ? 'dir' : 'file';
        if (!isAbsolutePath(parent)) return { ok: false, error: 'EINVAL' };
        const checked = validateName(payload && payload.name, kind);
        if (!checked.ok) return checked;
        if (await nameExists(parent, payload.name)) return { ok: false, error: 'EEXIST' };
        return { ok: true };
    });

    ipcMain.handle('filecommander.mkdir', (_event, payload) => ops.mkdir(payload || {}));
    ipcMain.handle('filecommander.createFile', (_event, payload) => ops.createFile(payload || {}));
    ipcMain.handle('filecommander.rename', (_event, payload) => ops.rename(payload || {}));
    ipcMain.handle('filecommander.fs.properties', (_event, payload) => (
        ops.properties(payload || {})
    ));

    // -----------------------------------------------------------------------
    // 复制 / 移动
    // -----------------------------------------------------------------------
    ipcMain.handle('filecommander.transfer.start', (_event, payload) => transfer.start(payload || {}));
    ipcMain.handle('filecommander.transfer.respond', (_event, payload) => (
        transfer.respond(payload || {})
    ));
    ipcMain.handle('filecommander.transfer.cancel', (_event, payload) => (
        transfer.cancel(payload && payload.taskId)
    ));
    ipcMain.handle('filecommander.transfer.list', () => transfer.list());

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
