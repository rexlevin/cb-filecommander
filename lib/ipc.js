/**
 * 文件系统 IPC 注册
 *
 * 渲染层只提交绝对路径与意图；这里统一做参数校验并返回 {ok, error}。
 */
const { ipcMain, shell, app, nativeImage, clipboard } = require('electron');
const fsp = require('fs').promises;
const path = require('path');
const listing = require('./listing');
const places = require('./places');
const watch = require('./watch');
const ops = require('./ops');
const transfer = require('./transfer');
const { validateName, nameExists } = require('./names');
const { expandPath, isAbsolutePath } = require('./paths');

// ---------------------------------------------------------------------------
// 文件图标缓存（主进程内）
// 系统对同一扩展名/目录/链接，图标是一样的——按 kind+ext 做 key，大幅减少 getFileIcon 调用
// ---------------------------------------------------------------------------
const ICON_CACHE = new Map();
const ICON_PENDING = new Map();   // 正在 fetch 的 Promise，用于并发合并

function iconCacheKey(kind, filePath) {
    if (kind === 'dir') return 'dir::';
    if (kind === 'link') return 'link::';
    if (kind === 'file') {
        const ext = path.extname(filePath).toLowerCase();
        return `file::${ext}`;
    }
    return 'other::';
}

async function fetchIconForEntry(kind, filePath) {
    const key = iconCacheKey(kind, filePath);
    if (ICON_CACHE.has(key)) return { key, dataUrl: ICON_CACHE.get(key) };
    if (ICON_PENDING.has(key)) return ICON_PENDING.get(key);

    const promise = (async () => {
        try {
            // 必须传真实路径——getFileIcon 内部会读路径类型（文件/目录/链接）决定图标
            const img = await app.getFileIcon(filePath, { size: 'normal' });
            const dataUrl = img.isEmpty() ? null : img.toDataURL();
            ICON_CACHE.set(key, dataUrl);
            return { key, dataUrl };
        } catch (err) {
            // 路径不存在或权限不足时，按 kind+ext 返回通用 fallback
            ICON_CACHE.set(key, null);
            return { key, dataUrl: null };
        } finally {
            ICON_PENDING.delete(key);
        }
    })();

    ICON_PENDING.set(key, promise);
    return promise;
}

function registerIpc({ send }) {
    const sendEvent = (channel, payload) => send(channel, payload);
    transfer.init({ send: sendEvent });

    // -----------------------------------------------------------------------
    // 文件图标（系统原生）
    // -----------------------------------------------------------------------
    ipcMain.handle('filecommander.getFileIcons', async (_event, payload) => {
        const paths = Array.isArray(payload) ? payload : (payload && payload.paths) || [];
        if (!paths.length) return {};
        const results = await Promise.all(paths.map((p) => (
            fetchIconForEntry(p.kind, p.path).then(({ dataUrl }) => ({
                path: p.path,
                kind: p.kind,
                dataUrl
            }))
        )));
        const map = {};
        for (const r of results) map[r.path] = r.dataUrl;
        return map;
    });

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

    // -----------------------------------------------------------------------
    // 系统剪贴板（文本路径互操作）
    // -----------------------------------------------------------------------
    ipcMain.handle('filecommander.clipboard.writeText', (_event, payload) => {
        const text = payload && typeof payload.text === 'string' ? payload.text : '';
        clipboard.writeText(text);
        return { ok: true };
    });

    ipcMain.handle('filecommander.clipboard.readText', () => ({
        ok: true,
        text: clipboard.readText()
    }));

    // -----------------------------------------------------------------------
    // 在系统文件管理器中显示
    // -----------------------------------------------------------------------
    ipcMain.handle('filecommander.showInFolder', (_event, payload) => {
        const target = payload && payload.path;
        if (!isAbsolutePath(target)) return { ok: false, error: 'EINVAL' };
        try {
            shell.showItemInFolder(target);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: 'OPEN_FAILED' };
        }
    });

    // -----------------------------------------------------------------------
    // 拖拽：渲染层发起原生拖拽（拖出到系统）
    // -----------------------------------------------------------------------
    ipcMain.on('filecommander.drag.start', (event, payload) => {
        const paths = payload && Array.isArray(payload.paths) ? payload.paths : [];
        if (!paths.length || !event.sender || !event.sender.startDrag) return;
        const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'public', 'logo.png'));
        try {
            event.sender.startDrag({ files: paths, icon: icon.isEmpty() ? undefined : icon });
        } catch (err) {
            // 拖拽启动失败静默处理
        }
    });
}

module.exports = { registerIpc };
