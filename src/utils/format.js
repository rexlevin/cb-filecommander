/**
 * 列表显示格式化：大小、时间、类型文案。
 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

const EXT_GROUPS = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif', 'tif', 'tiff', 'heic'],
    video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'lz', 'iso'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'epub'],
    code: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss', 'less', 'html', 'htm', 'json', 'xml', 'yml', 'yaml', 'toml', 'sh', 'bash', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'sql']
};

const EXT_MAP = new Map();
for (const [group, extensions] of Object.entries(EXT_GROUPS)) {
    for (const ext of extensions) EXT_MAP.set(ext, group);
}

export function formatSize(bytes) {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const text = value >= 10 ? String(Math.round(value)) : value.toFixed(1);
    return `${text} ${UNITS[unit]}`;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

export function formatTime(ms) {
    if (!ms) return '—';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件名扩展名（小写，无点）；无扩展名返回空串 */
export function extensionOf(name) {
    const dot = String(name || '').lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return '';
    return name.slice(dot + 1).toLowerCase();
}

/** 扩展名所属分组（image/video/audio/archive/document/code），未知返回 null */
export function groupForName(name) {
    return EXT_MAP.get(extensionOf(name)) || null;
}

export function typeText(entry, t) {
    if (entry.kind === 'dir') return t('list.typeDir');
    if (entry.kind === 'link') {
        return entry.linkTarget === 'broken' ? t('list.typeBroken') : t('list.typeLink');
    }
    if (entry.kind === 'other') return t('list.typeOther');

    const ext = extensionOf(entry.name);
    if (!ext) return t('list.typeFile');
    const group = EXT_MAP.get(ext);
    if (group) return t(`list.type${group[0].toUpperCase()}${group.slice(1)}`);
    return t('list.typeExt', { ext: ext.toUpperCase() });
}
