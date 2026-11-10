/**
 * 取路径最后一段作为标签标题。
 * 根目录与 Windows 盘符根返回自身。
 */
export function baseName(dir) {
    if (!dir) return '';
    const normalized = dir.replace(/[\\/]+$/, '');
    if (!normalized) return /^[\\/]/.test(dir) ? (dir.startsWith('\\') ? '\\' : '/') : dir;
    const parts = normalized.split(/[\\/]/);
    return parts[parts.length - 1] || normalized;
}

/** 是否为根目录（Linux `/` 或 Windows `C:\`） */
export function isRoot(dir) {
    return dir === '/' || /^[A-Za-z]:[\\/]?$/.test(dir || '');
}

/** 上级目录；根目录返回自身 */
export function parentDir(dir) {
    if (!dir || isRoot(dir)) return dir;
    const normalized = dir.replace(/[\\/]+$/, '');
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (index < 0) return dir;
    if (index === 0) return '/';
    const parent = normalized.slice(0, index);
    if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
    return parent;
}

/** 面包屑分段：`/home/user` → [/, home, user] */
export function segments(dir) {
    if (!dir) return [];
    if (/^[A-Za-z]:[\\/]/.test(dir)) {
        const root = dir.slice(0, 3);
        const parts = [{ label: root, path: root }];
        let acc = root;
        for (const part of dir.slice(3).split(/[\\/]+/).filter(Boolean)) {
            acc = acc.endsWith('\\') ? `${acc}${part}` : `${acc}\\${part}`;
            parts.push({ label: part, path: acc });
        }
        return parts;
    }
    const parts = [{ label: '/', path: '/' }];
    let acc = '';
    for (const part of dir.split('/').filter(Boolean)) {
        acc += `/${part}`;
        parts.push({ label: part, path: acc });
    }
    return parts;
}
