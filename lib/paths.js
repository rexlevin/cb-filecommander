/**
 * 路径规范化
 *
 * 渲染层只提交用户输入与当前目录，主进程负责展开 `~`、解析相对路径并校验目录。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function unquote(value) {
    const raw = String(value || '').trim();
    if (raw.length >= 2) {
        const first = raw[0];
        const last = raw[raw.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return raw.slice(1, -1).trim();
        }
    }
    return raw;
}

/**
 * 展开路径并校验目录。
 * @param {string} input 用户输入
 * @param {string} baseDir 相对路径基准目录
 * @returns {{ok: boolean, path?: string, error?: string}}
 */
function expandPath(input, baseDir) {
    const raw = unquote(input);
    if (!raw) return { ok: false, error: 'EINVAL' };

    const home = os.homedir();
    let target;
    if (raw === '~') target = home;
    else if (raw.startsWith('~/') || raw.startsWith('~\\')) target = path.join(home, raw.slice(2));
    else if (path.isAbsolute(raw)) target = raw;
    else target = path.resolve(baseDir || home, raw);

    target = path.normalize(target);

    let stat;
    try {
        stat = fs.statSync(target);
    } catch (error) {
        return { ok: false, path: target, error: error.code || 'ENOENT' };
    }
    if (!stat.isDirectory()) return { ok: false, path: target, error: 'ENOTDIR' };
    return { ok: true, path: target };
}

function isAbsolutePath(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 4096 && path.isAbsolute(value);
}

module.exports = { expandPath, isAbsolutePath };
