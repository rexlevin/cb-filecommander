/**
 * cb-filecommander preload
 *
 * 暴露 window.filecommander：
 *   - bootstrap() 同步获取 { settings, session, platform, home, version, locale, dark }
 *   - settingsGetAll() / settingsSet(key, value)
 *   - sessionGet() / sessionSet(session)
 *   - themeSet(theme) / localeSet(locale)
 *   - listDir() / listCancel() / pathExpand() / placesList()
 *   - freeSpace() / openPath() / watchSet() / openExternal()
 *   - onSettingApplied(cb) / onThemeApplied(cb) / onMenuAction(cb)
 *   - onDirStats(cb) / onDirChanged(cb)
 */
const { contextBridge, ipcRenderer } = require('electron');
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
    watchSet: (dirs) => ipcRenderer.invoke('filecommander.watch.set', { dirs }),
    openExternal: (url) => ipcRenderer.invoke('filecommander.openExternal', { url }),

    onSettingApplied: (cb) => subscribe('filecommander.settingApplied', cb),
    onThemeApplied: (cb) => subscribe('filecommander.themeApplied', cb),
    onMenuAction: (cb) => subscribe('filecommander.menuAction', cb),
    onDirStats: (cb) => subscribe('filecommander.dirStats', cb),
    onDirChanged: (cb) => subscribe('filecommander.dirChanged', cb)
});
