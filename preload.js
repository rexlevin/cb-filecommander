/**
 * cb-filecommander preload
 *
 * 暴露 window.filecommander：
 *   - bootstrap() 同步获取 { settings, session, platform, home, version, locale, dark }
 *   - settingsGetAll() / settingsSet(key, value)
 *   - sessionGet() / sessionSet(session)
 *   - themeSet(theme) / localeSet(locale)
 *   - listDir() / listCancel() / pathExpand() / placesList()
 *   - freeSpace() / openPath() / openWith() / openWithApp() / chooseProgram() / listApps() / watchSet() / openExternal()
 *   - validateName() / mkdir() / createFile() / rename() / properties()
 *   - transferStart() / transferRespond() / transferCancel() / transferList()
 *   - onSettingApplied(cb) / onThemeApplied(cb) / onMenuAction(cb)
 *   - onDirStats(cb) / onDirChanged(cb)
 *   - onTransferProgress(cb) / onTransferConflict(cb) / onTransferDone(cb)
 *   - whatsNew.check(options) / whatsNew.ack(version) — 更新内容（canbox-core 提供）
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const path = require('path');
const pkg = require(path.join(__dirname, 'package.json'));

window.addEventListener('DOMContentLoaded', () => {
    document.title = pkg.displayName;
});

function subscribe(channel, cb) {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('filecommander', {
    bootstrap: () => ipcRenderer.sendSync('filecommander.bootstrap'),

    settingsGetAll: () => ipcRenderer.invoke('filecommander.settings.getAll'),
    settingsSet: (key, value) => ipcRenderer.invoke('filecommander.settings.set', { key, value }),

    sessionGet: () => ipcRenderer.invoke('filecommander.session.get'),
    sessionSet: (session) => ipcRenderer.invoke('filecommander.session.set', session),

    themeSet: (theme) => ipcRenderer.invoke('filecommander.theme.set', { theme }),
    localeSet: (locale) => ipcRenderer.invoke('filecommander.locale.set', { locale }),

    listDir: (payload) => ipcRenderer.invoke('filecommander.listDir', payload),
    listCancel: (payload) => ipcRenderer.invoke('filecommander.listCancel', payload),
    pathExpand: (payload) => ipcRenderer.invoke('filecommander.path.expand', payload),
    placesList: () => ipcRenderer.invoke('filecommander.places.list'),
    freeSpace: (dir) => ipcRenderer.invoke('filecommander.fs.freeSpace', { path: dir }),
    openPath: (dir) => ipcRenderer.invoke('filecommander.openPath', { path: dir }),
    openWith: (payload) => ipcRenderer.invoke('filecommander.openWith', payload),
    openWithApp: (payload) => ipcRenderer.invoke('filecommander.openWithApp', payload),
    chooseProgram: (payload) => ipcRenderer.invoke('filecommander.chooseProgram', payload),
    listApps: () => ipcRenderer.invoke('filecommander.apps.list'),
    openTerminal: (payload) => ipcRenderer.invoke('filecommander.openTerminal', payload),
    showInFolder: (dir) => ipcRenderer.invoke('filecommander.showInFolder', { path: dir }),
    watchSet: (dirs) => ipcRenderer.invoke('filecommander.watch.set', { dirs }),
    openExternal: (url) => ipcRenderer.invoke('filecommander.openExternal', { url }),

    validateName: (payload) => ipcRenderer.invoke('filecommander.path.validateName', payload),
    mkdir: (payload) => ipcRenderer.invoke('filecommander.mkdir', payload),
    createFile: (payload) => ipcRenderer.invoke('filecommander.createFile', payload),
    rename: (payload) => ipcRenderer.invoke('filecommander.rename', payload),
    properties: (payload) => ipcRenderer.invoke('filecommander.fs.properties', payload),
    propsSizeStart: (payload) => ipcRenderer.invoke('filecommander.fs.sizeStart', payload),
    propsSizeCancel: (payload) => ipcRenderer.invoke('filecommander.fs.sizeCancel', payload),

    transferStart: (payload) => ipcRenderer.invoke('filecommander.transfer.start', payload),
    transferRespond: (payload) => ipcRenderer.invoke('filecommander.transfer.respond', payload),
    transferCancel: (taskId) => ipcRenderer.invoke('filecommander.transfer.cancel', { taskId }),
    transferList: () => ipcRenderer.invoke('filecommander.transfer.list'),

    getFileIcons: (paths) => ipcRenderer.invoke('filecommander.getFileIcons', paths),

    whatsNew: {
        check: (options) => ipcRenderer.invoke('canbox.whatsNew.check', options),
        ack: (version) => ipcRenderer.invoke('canbox.whatsNew.ack', version)
    },

    clipboardWriteText: (text) => ipcRenderer.invoke('filecommander.clipboard.writeText', { text }),
    clipboardReadText: () => ipcRenderer.invoke('filecommander.clipboard.readText'),

    dragStart: (paths) => ipcRenderer.send('filecommander.drag.start', { paths }),
    getPathForFile: (file) => webUtils.getPathForFile(file),

    onSettingApplied: (cb) => subscribe('filecommander.settingApplied', cb),
    onThemeApplied: (cb) => subscribe('filecommander.themeApplied', cb),
    onMenuAction: (cb) => subscribe('filecommander.menuAction', cb),
    onDirStats: (cb) => subscribe('filecommander.dirStats', cb),
    onPropsSize: (cb) => subscribe('filecommander.propsSize', cb),
    onDirChanged: (cb) => subscribe('filecommander.dirChanged', cb),
    onTransferProgress: (cb) => subscribe('filecommander.transfer.progress', cb),
    onTransferConflict: (cb) => subscribe('filecommander.transfer.conflict', cb),
    onTransferDone: (cb) => subscribe('filecommander.transfer.done', cb)
});
