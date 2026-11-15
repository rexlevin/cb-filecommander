/**
 * Windows 任务栏集成
 *
 * 背景：APP 通过 electron.exe 启动（源码运行或 canbox 启动器），
 * 若开始菜单里没有与进程 AppUserModelID 一致的快捷方式，Windows 在
 * “固定到任务栏”时只能创建一个指向 electron.exe、且不带启动参数的快捷方式，
 * 结果就是图标变成 Electron 默认图标、点击后打开 Electron 默认窗口。
 *
 * 处理方式：启动时把开始菜单快捷方式对齐到“当前正在运行的这个 APP”：
 * 目标为 process.execPath，参数由 app.getAppPath() + appId 重建，图标使用 APP 的 ICO，
 * AUMID 与进程一致。源码运行和已安装运行都走同一套逻辑——只补 AUMID 而保留
 * manager 生成的旧启动方式（canbox.exe app <旧id>）会让固定后的图标/启动目标错位。
 *
 * 快捷方式用 Electron 内置的 shell.writeShortcutLink 写入（原生 IPersistFile，
 * 支持 appUserModelId/icon），不依赖外部 PowerShell。
 */

const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
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
 * 当前进程的启动参数（源码运行与已安装运行都适用）。
 *
 * 快捷方式必须指向“正在跑的这个 APP”，并且 AUMID 与进程一致：
 * 只补 AUMID、却保留 manager 生成的旧启动方式（canbox.exe app <旧id>）时，
 * 固定到任务栏后点开的是另一个/已失效的应用，表现就是 Electron 默认窗口。
 */
function buildLaunchSpec() {
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

/** 记录任务栏集成过程，便于排查“固定到任务栏仍为 Electron”这类只在安装态出现的问题 */
function appendLog(line) {
    try {
        const dir = path.join(app.getPath('userData'), 'taskbar');
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, 'taskbar.log'), `[${new Date().toISOString()}] ${line}\n`);
    } catch (error) {
        // 日志失败不影响主流程
    }
}

/** 现有快捷方式是否已经指向当前 APP（避免每次启动都重写） */
function isUpToDate(lnk, options) {
    try {
        const current = shell.readShortcutLink(lnk);
        return current.target === options.target
            && current.args === options.args
            && current.cwd === options.cwd
            && current.appUserModelId === options.appUserModelId
            && (!options.icon || current.icon === options.icon);
    } catch (error) {
        return false;
    }
}

function writeShortcut(lnk, options, attempt) {
    const exists = fs.existsSync(lnk);
    if (exists && isUpToDate(lnk, options)) return;
    try {
        fs.mkdirSync(path.dirname(lnk), { recursive: true });
        const ok = shell.writeShortcutLink(lnk, exists ? 'replace' : 'create', options);
        if (ok) {
            appendLog(`shortcut ${exists ? 'replaced' : 'created'} aumid=${options.appUserModelId} target=${options.target} args=${options.args} icon=${options.icon || '(none)'}`);
            return;
        }
        appendLog(`writeShortcutLink returned false (attempt=${attempt}) lnk=${lnk}`);
    } catch (error) {
        appendLog(`writeShortcutLink failed (attempt=${attempt}): ${error.message}`);
    }
    // Explorer 偶尔短时间占用开始菜单里的 .lnk，稍后重试
    if (attempt < 3) {
        setTimeout(() => writeShortcut(lnk, options, attempt + 1), 1200);
    }
}

function ensure() {
    if (process.platform !== 'win32') return;

    let aumid;
    try {
        aumid = appUserModelId();
        app.setAppUserModelId(aumid);
    } catch (error) {
        appendLog(`setAppUserModelId failed: ${error.message}`);
        return;
    }

    const spec = buildLaunchSpec();
    const icon = ensureShortcutIcon();
    const options = {
        target: spec.target,
        args: spec.args,
        cwd: spec.workingDirectory,
        description: pkg.displayName,
        appUserModelId: aumid
    };
    if (icon) {
        options.icon = icon;
        options.iconIndex = 0;
    }

    // 每次启动都校验一次：快捷方式可能被 manager 重建（会丢失 AUMID、改回失效的启动参数），
    // 只靠“已处理过”标记会漏掉这种情况。内容一致时 isUpToDate 会直接跳过写入。
    writeShortcut(startMenuShortcutPath(), options, 1);
}

module.exports = { ensure, appUserModelId };
