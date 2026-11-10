/**
 * 常用位置：主目录、桌面、文档、下载、根目录/驱动器、挂载点。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const REAL_FS = new Set([
    'ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'f2fs', 'reiserfs', 'jfs',
    'vfat', 'exfat', 'ntfs', 'ntfs3', 'fuseblk', 'cifs', 'smbfs',
    'nfs', 'nfs4', 'zfs', 'hfsplus', 'udf', 'iso9660'
]);

const MAX_MOUNTS = 20;

function existingDir(p) {
    if (!p) return null;
    try {
        return fs.statSync(p).isDirectory() ? p : null;
    } catch (error) {
        return null;
    }
}

function appPath(name) {
    try {
        return existingDir(app.getPath(name));
    } catch (error) {
        return null;
    }
}

function unescapeMount(value) {
    return value.replace(/\\([0-7]{3})/g, (_match, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function readMounts() {
    let content;
    try {
        content = fs.readFileSync('/proc/mounts', 'utf8');
    } catch (error) {
        return [];
    }

    const seen = new Set(['/']);
    const mounts = [];
    for (const line of content.split('\n')) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 3) continue;
        const mountPoint = unescapeMount(fields[1]);
        const fsType = fields[2];
        if (!REAL_FS.has(fsType)) continue;
        if (!mountPoint.startsWith('/') || seen.has(mountPoint)) continue;
        seen.add(mountPoint);
        mounts.push({ path: mountPoint, label: path.basename(mountPoint) || mountPoint });
    }

    mounts.sort((a, b) => a.path.localeCompare(b.path));
    return mounts.slice(0, MAX_MOUNTS);
}

function listPlaces() {
    const home = appPath('home') || os.homedir();
    const places = [{ key: 'home', path: home }];

    for (const [key, name] of [['desktop', 'desktop'], ['documents', 'documents'], ['downloads', 'downloads']]) {
        const p = appPath(name);
        if (p && p !== home) places.push({ key, path: p });
    }

    const roots = [];
    const mounts = [];

    if (process.platform === 'win32') {
        for (let i = 0; i < 26; i += 1) {
            const letter = String.fromCharCode(65 + i);
            const p = `${letter}:\\`;
            try {
                if (fs.existsSync(p)) roots.push({ key: 'drive', path: p, label: `${letter}:` });
            } catch (error) {
                // 忽略无法访问的驱动器
            }
        }
    } else {
        roots.push({ key: 'root', path: '/' });
        mounts.push(...readMounts());
    }

    return { ok: true, home, places, roots, mounts };
}

module.exports = { listPlaces };
