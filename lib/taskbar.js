/**
 * Windows 任务栏集成
 *
 * 背景：APP 通过 electron.exe 启动（源码运行或 canbox 启动器），
 * 若开始菜单里没有与进程 AppUserModelID 一致的快捷方式，Windows 在
 * “固定到任务栏”时只能创建一个指向 electron.exe、且不带启动参数的快捷方式，
 * 结果就是图标变成 Electron 默认图标、点击后打开 Electron 默认窗口。
 *
 * 处理方式：启动时确保开始菜单存在与 AUMID 匹配、且能正确启动本 APP 的快捷方式：
 *   - 源码运行（process.defaultApp）：目标为当前 electron 可执行文件，参数带上
 *     injection.js / APP 路径 / --app-id，图标使用 APP 的 ICO；
 *   - 已安装运行：沿用 canbox-manager 生成的快捷方式（启动参数由 manager 维护），
 *     只补齐缺失的 AppUserModelID 属性。
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pkg = require('../package.json');

const AUMID_PREFIX = 'com.canbox.';

function resolveAppId() {
    const env = global.__CANBOX_ENV__;
    if (env && env.appId) return env.appId;
    const fromArgv = process.argv.find((item) => item.startsWith('--app-id='));
    if (fromArgv) return fromArgv.slice('--app-id='.length) || pkg.name;
    return pkg.name;
}

function appUserModelId() {
    return `${AUMID_PREFIX}${resolveAppId()}`;
}

function startMenuShortcutPath() {
    const appData = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Canbox', `${pkg.displayName}.lnk`);
}

/**
 * 源码运行时的启动参数；返回 null 表示不应由 APP 自己创建快捷方式（已安装场景）。
 */
function buildLaunchSpec() {
    if (!process.defaultApp) return null;
    const appPath = app.getAppPath();
    const corePath = global.__CANBOX_CORE_PATH__;
    const parts = [];
    if (corePath) parts.push('-r', `"${path.join(corePath, 'injection.js')}"`);
    parts.push(`"${appPath}"`, `--app-id=${resolveAppId()}`, '--no-sandbox');
    return {
        target: process.execPath,
        args: parts.join(' '),
        workingDirectory: corePath || appPath
    };
}

/** PNG 字节流封装为单图 ICO（Vista+ 支持 PNG-in-ICO） */
function pngToIco(pngBuf) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);

    let width = 0;
    let height = 0;
    if (pngBuf.length >= 24 && pngBuf[0] === 0x89 && pngBuf[1] === 0x50) {
        width = pngBuf.readUInt32BE(16);
        height = pngBuf.readUInt32BE(20);
        if (width === 256) width = 0;
        if (height === 256) height = 0;
    }

    const entry = Buffer.alloc(16);
    entry.writeUInt8(width & 0xFF, 0);
    entry.writeUInt8(height & 0xFF, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuf.length, 8);
    entry.writeUInt32LE(22, 12);

    return Buffer.concat([header, entry, pngBuf]);
}

/**
 * 生成快捷方式图标（.lnk 的 IconLocation 对 PNG 支持不可靠，统一转 ICO）。
 * 打包后源文件位于 asar 内，因此先读入内存再写到 userData。
 */
function ensureShortcutIcon() {
    const source = path.join(__dirname, '..', 'icons', '256.png');
    try {
        if (!fs.existsSync(source)) return '';
        const dir = path.join(app.getPath('userData'), 'taskbar');
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, `${resolveAppId()}.ico`);
        fs.writeFileSync(dest, pngToIco(fs.readFileSync(source)));
        return dest;
    } catch (error) {
        return '';
    }
}

/** 打包后脚本在 asar 内 PowerShell 无法直接读取，先复制到 userData */
function materializeScript() {
    const source = path.join(__dirname, 'ensure-taskbar-shortcut.ps1');
    const dest = path.join(app.getPath('userData'), 'taskbar', 'ensure-taskbar-shortcut.ps1');
    try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, fs.readFileSync(source));
        return dest;
    } catch (error) {
        return '';
    }
}

function ensure() {
    if (process.platform !== 'win32') return;

    let aumid;
    try {
        aumid = appUserModelId();
        app.setAppUserModelId(aumid);
    } catch (error) {
        return;
    }

    const script = materializeScript();
    if (!script) return;

    const spec = buildLaunchSpec();
    const env = global.__CANBOX_ENV__;
    const icon = ensureShortcutIcon();

    const args = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
        '-Lnk', startMenuShortcutPath(),
        '-Aumid', aumid,
        '-AppsDir', env && env.usersPath ? path.join(env.usersPath, 'apps') : '',
        '-AllowCreate', spec ? '1' : '0'
    ];
    if (spec) args.push('-Target', spec.target, '-Arguments', spec.args, '-WorkingDirectory', spec.workingDirectory);
    if (icon) args.push('-Icon', icon);

    try {
        const child = spawn('powershell.exe', args, { windowsHide: true, stdio: 'ignore', detached: true });
        child.on('error', () => {});
        child.unref();
    } catch (error) {
        // 任务栏集成失败不影响 APP 启动
    }
}

module.exports = { ensure, appUserModelId };
