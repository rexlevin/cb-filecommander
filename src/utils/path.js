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
