/**
 * 文件列表排序
 *
 * 名称使用 Intl.Collator 自然排序；目录优先只影响分组，不随升降序反转。
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isDirEntry(entry) {
    return entry.kind === 'dir' || (entry.kind === 'link' && entry.linkTarget === 'dir');
}

function extOf(name) {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return '';
    return name.slice(dot + 1).toLowerCase();
}

function valueOf(entry, by) {
    if (by === 'size') return entry.size === null || entry.size === undefined ? -1 : entry.size;
    if (by === 'mtime') return entry.mtime === null || entry.mtime === undefined ? -1 : entry.mtime;
    if (by === 'type') return extOf(entry.name);
    return entry.name;
}

export function sortEntries(entries, { by = 'name', desc = false, dirsFirst = true } = {}) {
    const list = entries.slice();
    list.sort((a, b) => {
        if (dirsFirst) {
            const group = (isDirEntry(a) ? 0 : 1) - (isDirEntry(b) ? 0 : 1);
            if (group) return group;
        }

        let result;
        if (by === 'size' || by === 'mtime') {
            result = valueOf(a, by) - valueOf(b, by);
        } else if (by === 'type') {
            result = collator.compare(valueOf(a, by), valueOf(b, by));
        } else {
            result = collator.compare(a.name, b.name);
        }
        if (!result) result = collator.compare(a.name, b.name);
        return desc ? -result : result;
    });
    return list;
}
