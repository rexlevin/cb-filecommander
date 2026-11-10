/**
 * 名称校验
 *
 * 新建与重命名共用：只校验名称本身（非法字符、保留名、长度），
 * 是否重名由调用方按平台规则查询目录后判断。
 */
const fsp = require('fs').promises;
const path = require('path');
const { toFsPath } = require('./paths');

const WIN_INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const WIN_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function platformOf(value) {
    return value === 'win32' ? 'win32' : 'linux';
}

/**
 * @param {string} name 用户输入的名称（不含路径）
 * @param {'file'|'dir'} kind
 * @param {string} platform
 * @returns {{ok: boolean, error?: string}}
 */
function validateName(name, kind = 'file', platform = process.platform) {
    const value = typeof name === 'string' ? name : '';
    if (!value) return { ok: false, error: 'EMPTY_NAME' };
    if (value === '.' || value === '..') return { ok: false, error: 'INVALID_NAME' };
    if (value.includes('/') || value.includes('\0')) return { ok: false, error: 'INVALID_NAME' };

    if (platformOf(platform) === 'win32') {
        if (value.includes('\\')) return { ok: false, error: 'INVALID_NAME' };
        if (WIN_INVALID_CHARS.test(value)) return { ok: false, error: 'INVALID_CHARS' };
        if (/[ .]$/.test(value)) return { ok: false, error: 'TRAILING_SPACE_DOT' };
        // 保留设备名：含扩展名形式（CON.txt）同样不允许
        const stem = value.split('.')[0];
        if (WIN_RESERVED.test(stem)) return { ok: false, error: 'RESERVED_NAME' };
        if (value.length > 255) return { ok: false, error: 'NAME_TOO_LONG' };
    } else if (Buffer.byteLength(value, 'utf8') > 255) {
        return { ok: false, error: 'NAME_TOO_LONG' };
    }
    return { ok: true };
}

function compareKey(name, platform) {
    return platformOf(platform) === 'win32' ? String(name).toLowerCase() : String(name);
}

/** 目标目录中是否已有同名项（Windows 不区分大小写） */
async function nameExists(parent, name, platform = process.platform) {
    if (platformOf(platform) === 'win32') {
        try {
            const list = await fsp.readdir(toFsPath(parent));
            const key = compareKey(name, platform);
            return list.some((item) => compareKey(item, platform) === key);
        } catch (error) {
            return false;
        }
    }
    try {
        await fsp.lstat(toFsPath(path.join(parent, name)));
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = { validateName, nameExists, platformOf };
