/**
 * cb-filecommander — 主进程入口
 *
 * 标准 Electron APP，通过 canbox-core 注入启动：
 *   electron -r canbox-core/injection.js cb-filecommander/
 *
 * M0 职责：窗口与原生菜单、主题、语言、设置/会话/窗口状态持久化。
 * 文件系统相关 IPC 从 M1 开始接入。
 */
const { app, BrowserWindow, Menu, ipcMain, nativeTheme, screen, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');
const { getStore } = require('./lib/settings');
const { buildMenu } = require('./lib/menu');
const { registerIpc } = require('./lib/ipc');
const transfer = require('./lib/transfer');

const DEFAULT_FONTS = {
    file: { family: '', size: 13 },     // 文件面板
    tab: { family: '', size: 12 },      // 标签
    status: { family: '', size: 11 },   // 状态栏
    dialog: { family: '', size: 13 }    // 设置与快捷键帮助弹窗
};

const DEFAULT_SETTINGS = {
    theme: 'system',            // system | light | dark
    locale: 'system',           // system | zh-CN | en-US
    fonts: DEFAULT_FONTS,
    rowHeight: 26,
    showHidden: false,
    dirsFirst: true,
    showIcons: true,
    confirmOverwrite: true,
    restoreSession: true,
    restoreWindow: true,
    zoom: 1,
    columns: { size: 96, mtime: 150, type: 100 },
    externalEditor: ''          // 外部编辑器路径，留空则使用系统默认打开方式
};

const THEMES = ['system', 'light', 'dark'];
const LOCALES = ['system', 'zh-CN', 'en-US'];
const MAX_TABS = 7;

let mainWindow = null;
let winStateTimer = null;
let tabSeq = 0;

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------
function readSettings() {
    let raw = {};
    try {
        const value = getStore('settings').get('settings');
        if (value && typeof value === 'object') raw = value;
    } catch (error) {
        // 读取失败按默认值启动
    }
    const settings = { ...DEFAULT_SETTINGS, ...raw };
    if (!THEMES.includes(settings.theme)) settings.theme = DEFAULT_SETTINGS.theme;
    if (!LOCALES.includes(settings.locale)) settings.locale = DEFAULT_SETTINGS.locale;
    settings.columns = { ...DEFAULT_SETTINGS.columns, ...(raw.columns || {}) };
    settings.fonts = sanitizeFonts(raw.fonts, DEFAULT_FONTS);
    return settings;
}

function writeSettings(settings) {
    try {
        getStore('settings').set('settings', settings);
    } catch (error) {
        // 持久化失败不阻断当前会话
    }
}

function resolveLocale(settings) {
    if (settings.locale === 'zh-CN' || settings.locale === 'en-US') return settings.locale;
    return String(app.getLocale() || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

function validateSetting(key, value) {
    switch (key) {
        case 'theme':
            return THEMES.includes(value);
        case 'locale':
            return LOCALES.includes(value);
        case 'fonts':
            return value !== null && typeof value === 'object' && !Array.isArray(value);
        case 'rowHeight':
            return Number.isFinite(value) && value >= 20 && value <= 45;
        case 'zoom':
            return Number.isFinite(value) && value >= 0.5 && value <= 2;
        case 'columns':
            return value !== null && typeof value === 'object' && !Array.isArray(value);
        case 'externalEditor':
            return typeof value === 'string' && value.length <= 500;
        case 'showHidden':
        case 'dirsFirst':
        case 'showIcons':
        case 'confirmOverwrite':
        case 'restoreSession':
        case 'restoreWindow':
            return typeof value === 'boolean';
        default:
            return false;
    }
}

function sanitizeColumns(columns) {
    const next = { ...readSettings().columns };
    for (const key of ['size', 'mtime', 'type']) {
        const width = Number(columns[key]);
        if (Number.isFinite(width) && width >= 40 && width <= 600) next[key] = Math.round(width);
    }
    return next;
}

/**
 * 规整字体设置：family 为空表示跟随系统默认；size 限制在 8–24。
 * base 用于补齐缺失区域，不读取持久化文件以避免递归。
 */
function sanitizeFonts(fonts, base = DEFAULT_FONTS) {
    const next = {};
    for (const area of Object.keys(DEFAULT_FONTS)) {
        const fallback = base[area] || DEFAULT_FONTS[area];
        const source = fonts && typeof fonts === 'object' && fonts[area] && typeof fonts[area] === 'object'
            ? fonts[area]
            : {};
        const family = typeof source.family === 'string' ? source.family.trim().slice(0, 120) : fallback.family;
        const size = Number(source.size);
        next[area] = {
            family,
            size: Number.isFinite(size) ? Math.min(25, Math.max(8, Math.round(size))) : fallback.size
        };
    }
    return next;
}

function sendToMain(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function applyZoom(factor) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.setZoomFactor(factor);
    }
}

function changeZoom(direction) {
    const current = readSettings().zoom || 1;
    let next = current;
    if (direction === 'in') next = Math.min(2, Math.round((current + 0.1) * 10) / 10);
    else if (direction === 'out') next = Math.max(0.5, Math.round((current - 0.1) * 10) / 10);
    else next = 1;
    applySetting('zoom', next);
}

function applySetting(key, value) {
    const settings = readSettings();
    if (key === 'columns') settings.columns = sanitizeColumns(value);
    else if (key === 'fonts') settings.fonts = sanitizeFonts(value);
    else settings[key] = value;
    writeSettings(settings);

    if (key === 'theme') {
        nativeTheme.themeSource = settings.theme;
        updateWindowBackground();
    }
    if (key === 'zoom') applyZoom(settings.zoom);

    rebuildMenu();
    sendToMain('filecommander.settingApplied', {
        key,
        value: settings[key],
        dark: nativeTheme.shouldUseDarkColors,
        locale: resolveLocale(settings)
    });
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------
function nextTabId() {
    tabSeq += 1;
    return `tab-${Date.now().toString(36)}-${tabSeq}`;
}

function freshPane(home) {
    const id = nextTabId();
    return { tabs: [{ id, dir: home }], activeTabId: id };
}

function sanitizePane(raw, home, verifyDir) {
    const tabs = [];
    const usedIds = new Set();
    if (raw && Array.isArray(raw.tabs)) {
        for (const tab of raw.tabs.slice(0, MAX_TABS)) {
            if (!tab || typeof tab.dir !== 'string' || !tab.dir) continue;
            let dir = tab.dir;
            if (verifyDir) {
                try {
                    if (!fs.statSync(dir).isDirectory()) dir = home;
                } catch (error) {
                    dir = home;
                }
            }
            const id = typeof tab.id === 'string' && tab.id && !usedIds.has(tab.id) ? tab.id : nextTabId();
            usedIds.add(id);
            tabs.push({ id, dir });
        }
    }
    if (tabs.length === 0) return freshPane(home);
    const activeTabId = tabs.some(tab => tab.id === raw.activeTabId) ? raw.activeTabId : tabs[0].id;
    return { tabs, activeTabId };
}

function readSession() {
    const home = app.getPath('home');
    const settings = readSettings();
    let raw = null;
    if (settings.restoreSession) {
        try {
            raw = getStore('session').get('session');
        } catch (error) {
            raw = null;
        }
    }
    if (!raw || typeof raw !== 'object') {
        return { panes: { left: freshPane(home), right: freshPane(home) }, activePane: 'left', ratio: 0.5 };
    }
    const ratio = Number(raw.ratio);
    return {
        panes: {
            left: sanitizePane(raw.panes && raw.panes.left, home, true),
            right: sanitizePane(raw.panes && raw.panes.right, home, true)
        },
        activePane: raw.activePane === 'right' ? 'right' : 'left',
        ratio: Number.isFinite(ratio) ? Math.min(0.8, Math.max(0.2, ratio)) : 0.5
    };
}

function writeSession(session) {
    const home = app.getPath('home');
    const ratio = Number(session && session.ratio);
    const next = {
        panes: {
            left: sanitizePane(session && session.panes && session.panes.left, home, false),
            right: sanitizePane(session && session.panes && session.panes.right, home, false)
        },
        activePane: session && session.activePane === 'right' ? 'right' : 'left',
        ratio: Number.isFinite(ratio) ? Math.min(0.8, Math.max(0.2, ratio)) : 0.5
    };
    try {
        getStore('session').set('session', next);
    } catch (error) {
        // ignore
    }
    return next;
}

// ---------------------------------------------------------------------------
// 窗口状态
// ---------------------------------------------------------------------------
function getWinStateStore() {
    return getStore('winState');
}

function persistWindowState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
        const isMaximized = mainWindow.isMaximized();
        const isFullScreen = mainWindow.isFullScreen();
        const bounds = isMaximized || isFullScreen ? null : mainWindow.getBounds();
        getWinStateStore().set('state', { bounds, isMaximized, isFullScreen });
    } catch (error) {
        // 忽略保存失败
    }
}

function saveWindowState() {
    if (winStateTimer) clearTimeout(winStateTimer);
    winStateTimer = setTimeout(() => {
        winStateTimer = null;
        persistWindowState();
    }, 300);
}

function saveWindowStateNow() {
    if (winStateTimer) {
        clearTimeout(winStateTimer);
        winStateTimer = null;
    }
    persistWindowState();
}

function loadWindowState() {
    let state = null;
    try {
        state = getWinStateStore().get('state');
    } catch (error) {
        state = null;
    }
    if (!state) return null;
    if (state.isMaximized || state.isFullScreen || !state.bounds) {
        return { isMaximized: !!state.isMaximized, isFullScreen: !!state.isFullScreen };
    }

    const bounds = state.bounds;
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    const visible =
        bounds.x + bounds.width > area.x &&
        bounds.x < area.x + area.width &&
        bounds.y + bounds.height > area.y &&
        bounds.y < area.y + area.height;

    if (!visible) return { width: bounds.width, height: bounds.height };
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function updateWindowBackground() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#17181c' : '#f5f6f8');
    }
}

// ---------------------------------------------------------------------------
// 菜单
// ---------------------------------------------------------------------------
function rebuildMenu() {
    const settings = readSettings();
    const menu = buildMenu({
        locale: resolveLocale(settings),
        settings,
        handlers: {
            command: (action) => sendToMain('filecommander.menuAction', { action }),
            setSetting: (key, value) => applySetting(key, value),
            zoom: (direction) => changeZoom(direction),
            quit: () => app.quit()
        }
    });
    Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.on('filecommander.bootstrap', (event) => {
    const settings = readSettings();
    event.returnValue = {
        settings,
        session: readSession(),
        platform: process.platform,
        home: app.getPath('home'),
        version: pkg.version,
        electron: process.versions.electron,
        arch: process.arch,
        homepage: pkg.homepage,
        appName: pkg.displayName,
        locale: resolveLocale(settings),
        dark: nativeTheme.shouldUseDarkColors
    };
});

ipcMain.handle('filecommander.settings.getAll', () => readSettings());

ipcMain.handle('filecommander.settings.set', (_e, payload) => {
    const { key, value } = payload || {};
    if (!validateSetting(key, value)) return { ok: false, error: 'INVALID_SETTING' };
    applySetting(key, value);
    return { ok: true };
});

ipcMain.handle('filecommander.session.get', () => readSession());

ipcMain.handle('filecommander.session.set', (_e, session) => {
    if (!session || typeof session !== 'object') return { ok: false, error: 'INVALID_SESSION' };
    writeSession(session);
    return { ok: true };
});

ipcMain.handle('filecommander.theme.set', (_e, payload) => {
    const theme = payload && payload.theme;
    if (!THEMES.includes(theme)) return { ok: false, error: 'INVALID_THEME' };
    applySetting('theme', theme);
    return { ok: true };
});

ipcMain.handle('filecommander.locale.set', (_e, payload) => {
    const locale = payload && payload.locale;
    if (!LOCALES.includes(locale)) return { ok: false, error: 'INVALID_LOCALE' };
    applySetting('locale', locale);
    return { ok: true };
});

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function windowIcon() {
    const iconPath = path.join(__dirname, 'public', 'logo.png');
    return fs.existsSync(iconPath) ? iconPath : undefined;
}

function createWindow() {
    const settings = readSettings();
    nativeTheme.themeSource = settings.theme;

    const saved = settings.restoreWindow ? loadWindowState() : null;

    mainWindow = new BrowserWindow({
        width: (saved && saved.width) || 1200,
        height: (saved && saved.height) || 760,
        x: saved && saved.x !== undefined ? saved.x : undefined,
        y: saved && saved.y !== undefined ? saved.y : undefined,
        minWidth: 900,
        minHeight: 560,
        title: pkg.displayName,
        icon: windowIcon(),
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#17181c' : '#f5f6f8',
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    if (saved && saved.isMaximized) mainWindow.maximize();
    else if (saved && saved.isFullScreen) mainWindow.setFullScreen(true);

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5182');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }

    mainWindow.webContents.on('did-finish-load', () => {
        applyZoom(readSettings().zoom || 1);
    });

    // 禁止页面跳转与新窗口
    mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('maximize', saveWindowState);
    mainWindow.on('unmaximize', saveWindowState);
    mainWindow.on('enter-full-screen', saveWindowState);
    mainWindow.on('leave-full-screen', saveWindowState);
    mainWindow.on('close', (event) => {
        if (!confirmTransferQuit()) {
            event.preventDefault();
            return;
        }
        saveWindowStateNow();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

nativeTheme.on('updated', () => {
    updateWindowBackground();
    if (readSettings().theme === 'system') {
        sendToMain('filecommander.themeApplied', {
            theme: 'system',
            dark: nativeTheme.shouldUseDarkColors
        });
    }
});

app.whenReady().then(() => {
    registerIpc({ send: sendToMain });
    rebuildMenu();
    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});

// 有运行中的复制/移动任务时退出需二次确认（M2）
let quitConfirmed = false;

function confirmTransferQuit() {
    if (quitConfirmed || !transfer.hasRunning()) return true;
    const zh = resolveLocale(readSettings()) === 'zh-CN';
    const choice = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: zh ? ['取消', '退出'] : ['Cancel', 'Quit'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: zh ? '任务进行中' : 'Transfer in Progress',
        message: zh
            ? '文件任务正在进行，确定退出 FileCommander？'
            : 'A file task is still running. Quit FileCommander anyway?',
        detail: zh
            ? '未完成的项目会被中断，已复制完成的内容会保留。'
            : 'Unfinished items will be interrupted; completed files will be kept.'
    });
    if (choice === 0) return false;
    quitConfirmed = true;
    return true;
}

app.on('before-quit', (event) => {
    if (!confirmTransferQuit()) event.preventDefault();
});

app.on('will-quit', () => {
    transfer.cancelAll();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
