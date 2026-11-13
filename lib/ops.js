/**
 * 单文件操作：新建目录、新建文件、重命名、属性
 */
const fsp = require('./fsx').promises;
const path = require('path');
const { validateName, nameExists } = require('./names');
const { isAbsolutePath, toFsPath } = require('./paths');

function fail(error) {
    return { ok: false, error: error && error.code ? error.code : 'UNKNOWN' };
}

/** Linux 权限位 → `0755 rwxr-xr-x`；Windows 不展示 ACL */
function modeText(mode) {
    if (process.platform === 'win32') return '';
    const rwx = (bits) => `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${bits & 1 ? 'x' : '-'}`;
    const octal = (mode & 0o777).toString(8).padStart(3, '0');
    return `0${octal} ${rwx((mode >> 6) & 7)}${rwx((mode >> 3) & 7)}${rwx(mode & 7)}`;
}

function kindOf(stat) {
    if (stat.isDirectory()) return 'dir';
    if (stat.isSymbolicLink()) return 'link';
    if (stat.isFile()) return 'file';
    return 'other';
}

/** 父目录必须存在且为目录 */
async function requireDir(parent) {
    if (!isAbsolutePath(parent)) return { ok: false, error: 'EINVAL' };
    try {
        const stat = await fsp.stat(toFsPath(parent));
        if (!stat.isDirectory()) return { ok: false, error: 'ENOTDIR' };
    } catch (error) {
        return fail(error);
    }
    return { ok: true };
}

async function mkdir({ parent, name }) {
    const dirCheck = await requireDir(parent);
    if (!dirCheck.ok) return dirCheck;

    const checked = validateName(name, 'dir');
    if (!checked.ok) return checked;
    if (await nameExists(parent, name)) return { ok: false, error: 'EEXIST' };

    const target = path.join(parent, name);
    try {
        await fsp.mkdir(toFsPath(target));
        return { ok: true, path: target };
    } catch (error) {
        return fail(error);
    }
}

async function createFile({ parent, name }) {
    const dirCheck = await requireDir(parent);
    if (!dirCheck.ok) return dirCheck;

    const checked = validateName(name, 'file');
    if (!checked.ok) return checked;
    if (await nameExists(parent, name)) return { ok: false, error: 'EEXIST' };

    const target = path.join(parent, name);
    let handle = null;
    try {
        handle = await fsp.open(toFsPath(target), 'wx');
        return { ok: true, path: target };
    } catch (error) {
        return fail(error);
    } finally {
        if (handle) await handle.close().catch(() => {});
    }
}

async function rename({ path: source, newName }) {
    if (!isAbsolutePath(source)) return { ok: false, error: 'EINVAL' };
    const checked = validateName(newName, 'file');
    if (!checked.ok) return checked;

    const parent = path.dirname(source);
    const sourceName = path.basename(source);
    const target = path.join(parent, newName);
    if (target === source) return { ok: true, path: source };

    const caseOnly = process.platform === 'win32'
        && sourceName.toLowerCase() === newName.toLowerCase()
        && sourceName !== newName;

    if (!caseOnly && await nameExists(parent, newName)) {
        return { ok: false, error: 'EEXIST' };
    }

    try {
        if (caseOnly) {
            // Windows 仅大小写重命名：临时名两步完成
            const temp = path.join(parent, `.${sourceName}.filecommander-rename-${Date.now().toString(36)}`);
            await fsp.rename(toFsPath(source), toFsPath(temp));
            await fsp.rename(toFsPath(temp), toFsPath(target));
        } else {
            await fsp.rename(toFsPath(source), toFsPath(target));
        }
        return { ok: true, path: target };
    } catch (error) {
        return fail(error);
    }
}

/** 单选：完整属性；多选：数量、总大小、共同父目录 */
async function properties({ paths }) {
    if (!Array.isArray(paths) || !paths.length) return { ok: false, error: 'EINVAL' };
    const items = [];
    let totalSize = 0;
    let totalFiles = 0;
    let totalDirs = 0;

    for (const itemPath of paths) {
        if (!isAbsolutePath(itemPath)) return { ok: false, error: 'EINVAL' };
        let stat;
        try {
            stat = await fsp.lstat(toFsPath(itemPath));
        } catch (error) {
            return fail(error);
        }

        const kind = kindOf(stat);
        const item = {
            path: itemPath,
            name: path.basename(itemPath),
            kind,
            size: stat.isFile() ? stat.size : null,
            mtime: stat.mtimeMs,
            mode: modeText(stat.mode),
            linkTarget: null
        };

        // 目录大小由独立的异步统计任务计算，属性请求立即返回
        if (stat.isSymbolicLink()) {
            try {
                item.linkTarget = await fsp.readlink(toFsPath(itemPath));
            } catch (error) {
                item.linkTarget = '?';
            }
        }

        if (kind === 'dir') totalDirs += 1;
        else {
            totalFiles += 1;
            totalSize += stat.size || 0;
        }
        items.push(item);
    }

    let commonParent = null;
    if (items.length === 1) {
        commonParent = path.dirname(items[0].path);
    } else {
        const parts = items.map((item) => path.dirname(item.path).split(path.sep));
        let prefix = parts[0];
        for (const segments of parts.slice(1)) {
            let index = 0;
            while (index < prefix.length && index < segments.length && prefix[index] === segments[index]) index += 1;
            prefix = prefix.slice(0, index);
        }
        commonParent = prefix.join(path.sep) || path.sep;
    }

    return {
        ok: true,
        items,
        totalSize,
        totalFiles,
        totalDirs,
        commonParent,
        platform: process.platform
    };
}

module.exports = { mkdir, createFile, rename, properties };
