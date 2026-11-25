/**
 * 已安装应用程序枚举与启动（Linux）。
 *
 * 通过 XDG applications 目录中的 .desktop 文件枚举可供「打开方式」选择的程序：
 *   - 仅保留 Type=Application，且未标记隐藏、非终端程序；
 *   - Exec 中的字段码（%f/%F/%u/%U 等）在启动时替换或去除。
 * 其它平台暂不枚举，由渲染层的「浏览其他程序」兜底。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MAX_APPS = 300;
const CACHE_TTL = 60 * 1000;

let cache = null;
let cacheAt = 0;

/** 系统中可能存放 .desktop 的目录（按优先级去重） */
function desktopDirs() {
    if (process.platform !== 'linux') return [];
    const home = os.homedir();
    const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    const dirs = [
        path.join(dataHome, 'applications'),
        path.join(home, '.local', 'share', 'applications'),
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'share', 'applications')
    ];
    const dataDirs = String(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
        .split(':')
        .filter(Boolean);
    for (const dir of dataDirs) dirs.push(path.join(dir, 'applications'));
    dirs.push('/var/lib/flatpak/exports/share/applications');
    dirs.push('/var/lib/snapd/desktop/applications');

    const seen = new Set();
    const result = [];
    for (const dir of dirs) {
        if (seen.has(dir)) continue;
        seen.add(dir);
        try {
            if (fs.statSync(dir).isDirectory()) result.push(dir);
        } catch (error) {
            // 目录不存在则忽略
        }
    }
    return result;
}

function collectDesktopFiles(dir, out, depth = 0) {
    if (depth > 3) return;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectDesktopFiles(full, out, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.desktop')) out.push(full);
    }
}

/** 读取 [Desktop Entry] 组内的键值（忽略本地化键与后续分组） */
function readDesktopEntry(file) {
    let content;
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch (error) {
        return null;
    }
    const data = {};
    let inEntry = false;
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('[')) {
            if (inEntry) break;
            inEntry = trimmed === '[Desktop Entry]';
            continue;
        }
        if (!inEntry) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!(key in data)) data[key] = trimmed.slice(eq + 1).trim();
    }
    return data;
}

/** 按桌面入口规范拆分 Exec（支持双引号与反斜杠转义） */
function tokenizeExec(exec) {
    const tokens = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < exec.length; i += 1) {
        const ch = exec[i];
        if (ch === '\\' && i + 1 < exec.length) {
            current += exec[i + 1];
            i += 1;
        } else if (ch === '"') {
            quoted = !quoted;
        } else if (!quoted && /\s/.test(ch)) {
            if (current) {
                tokens.push(current);
                current = '';
            }
        } else {
            current += ch;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

const FILE_FIELD_CODES = new Set(['f', 'F', 'u', 'U']);

/** Exec 模板 → argv：文件字段码替换为目标路径，未出现时追加到末尾 */
function execToArgv(exec, target) {
    const argv = [];
    let needsTarget = true;
    for (const token of tokenizeExec(exec)) {
        if (/^%[fFuU]$/.test(token)) {
            // 单独的文件字段码：统一在末尾追加，避免重复
            continue;
        }
        let replacedTarget = false;
        const replaced = token.replace(/%[a-zA-Z]/g, (match) => {
            if (FILE_FIELD_CODES.has(match[1])) {
                replacedTarget = true;
                return target;
            }
            return '';
        });
        if (replacedTarget) needsTarget = false;
        if (replaced) argv.push(replaced);
    }
    if (needsTarget) argv.push(target);
    return argv;
}

function listApps() {
    if (process.platform !== 'linux') return { ok: true, apps: [] };
    const now = Date.now();
    if (cache && now - cacheAt < CACHE_TTL) return { ok: true, apps: cache };

    const files = [];
    for (const dir of desktopDirs()) collectDesktopFiles(dir, files);

    const apps = [];
    const seen = new Set();
    for (const file of files) {
        const entry = readDesktopEntry(file);
        if (!entry || entry.Type !== 'Application') continue;
        if (entry.NoDisplay === 'true' || entry.Hidden === 'true' || entry.Terminal === 'true') continue;
        const name = entry.Name;
        if (!name || !entry.Exec) continue;
        const key = `${name}::${entry.Exec}`;
        if (seen.has(key)) continue;
        seen.add(key);
        apps.push({ id: file, name });
        if (apps.length >= MAX_APPS) break;
    }
    apps.sort((a, b) => a.name.localeCompare(b.name));
    cache = apps;
    cacheAt = now;
    return { ok: true, apps };
}

function spawnDetached(command, args) {
    return new Promise((resolve) => {
        try {
            const child = spawn(command, args, { detached: true, stdio: 'ignore' });
            child.on('error', (error) => {
                resolve({ ok: false, error: 'APP_LAUNCH_FAILED', detail: error.message });
            });
            child.unref();
            resolve({ ok: true });
        } catch (error) {
            resolve({ ok: false, error: 'APP_LAUNCH_FAILED', detail: error.message });
        }
    });
}

/** 用指定桌面入口打开目标文件 */
async function launch(appId, target) {
    if (process.platform !== 'linux') return { ok: false, error: 'APP_NOT_FOUND' };
    if (typeof appId !== 'string' || !path.isAbsolute(appId) || !appId.endsWith('.desktop')) {
        return { ok: false, error: 'APP_NOT_FOUND' };
    }
    const entry = readDesktopEntry(appId);
    if (!entry || !entry.Exec) return { ok: false, error: 'APP_NOT_FOUND' };
    const argv = execToArgv(entry.Exec, target);
    if (!argv.length) return { ok: false, error: 'APP_NOT_FOUND' };
    return spawnDetached(argv[0], argv.slice(1));
}

module.exports = { listApps, launch };
