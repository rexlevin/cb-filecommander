/**
 * 自绘 SVG 图标集（16×16 坐标）
 *
 * 文件类型按扩展名映射到图标；未知类型使用通用文件图标。
 * 图形只用 currentColor，颜色由使用方通过 CSS 控制。
 */
import { groupForName, extensionOf } from './format';

export const ICONS = {
    folder: '<path d="M1.5 4.2c0-.7.5-1.2 1.2-1.2h3.1l1.4 1.6h6.1c.7 0 1.2.5 1.2 1.2v6.4c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2V4.2Z" fill="currentColor" opacity=".85"/>',
    'folder-open': '<path d="M1.6 12.4V4.2c0-.7.5-1.2 1.2-1.2h3.1l1.4 1.6h4.8c.7 0 1.2.5 1.2 1.2v1.1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2.3 13.4 4.1 6.9h10.4l-1.9 6.5H2.3Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    file: '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    'file-text': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.4 8.2h5.2M5.4 10.3h5.2M5.4 12.4h3.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
    'file-code': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6.4 8.6 5 10.2l1.4 1.6M9.6 8.6l1.4 1.6-1.4 1.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    'file-image': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6.1" cy="8.6" r="1" fill="currentColor"/><path d="M4.6 12.8 6.9 10.4l1.5 1.4 1.2-1 1.8 2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    'file-video': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6.6 8.1v4.2l3.3-2.1-3.3-2.1Z" fill="currentColor"/>',
    'file-audio': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.9 8v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8.9" cy="12.2" r="1.1" fill="currentColor"/><path d="M9.9 8.2 11.9 7.7v1.4L9.9 9.6" fill="currentColor"/>',
    'file-archive': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7.1 3.4h1.6M7.1 5.2h1.6M7.1 7h1.6M7.1 8.8h1.6M7.1 10.6h1.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
    'file-pdf': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.4 12.6c1.2-.3 1.9-1.2 1.9-2.2 0-.7-.4-1.2-1-1.2-.7 0-1 .6-.8 1.4.3 1.1 1.3 2.1 2.7 2.3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
    'file-exe': '<path d="M3.6 1.9h5.1l3.7 3.7v8.5H3.6V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.7 1.9v3.7h3.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m5.5 8.4 1.4 1.4-1.4 1.4M8.4 11.4h2.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    symlink: '<path d="M3.2 2.6h5.6l3.2 3.2v8H3.2v-11Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.8 2.6v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m6.2 10.7 3-3M7.2 7.6h2.2v2.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
    drive: '<rect x="1.7" y="4.4" width="12.6" height="7.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.7 8.9h12.6" stroke="currentColor" stroke-width="1.2"/><circle cx="4" cy="10.8" r=".7" fill="currentColor"/>',
    home: '<path d="M2.4 7.4 8 2.4l5.6 5v6.2H2.4V7.4Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 13.6V9.8h3.6v3.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    desktop: '<rect x="1.8" y="3" width="12.4" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 11v2.4M5.4 13.4h5.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    documents: '<path d="M4.2 1.9h4.6l3 3v9.2H4.2V1.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8.8 1.9v3h3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.9 8.2h4.2M5.9 10.2h4.2M5.9 12.2h2.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
    downloads: '<path d="M8 2.2v7.1M5 6.4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.6 11.2v1.6c0 .5.4.9.9.9h9c.5 0 .9-.4.9-.9v-1.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    root: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.6 10.9 8.5 5.1M4.8 8.9h6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    warning: '<path d="M8 2.3 14.3 13.3H1.7L8 2.3Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.2v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".65" fill="currentColor"/>'
};

const GROUP_ICONS = {
    image: 'file-image',
    video: 'file-video',
    audio: 'file-audio',
    archive: 'file-archive',
    document: 'file-text',
    code: 'file-code'
};

const EXEC_EXTENSIONS = new Set(['exe', 'msi', 'appimage', 'deb', 'rpm', 'bat', 'cmd', 'com', 'run', 'bin']);

/** 目录项 → 图标名 */
export function fileIcon(entry) {
    if (!entry) return 'file';
    if (entry.kind === 'dir') return 'folder';
    if (entry.kind === 'link') return 'symlink';
    if (entry.kind === 'other') return 'file';

    const ext = extensionOf(entry.name);
    if (EXEC_EXTENSIONS.has(ext)) return 'file-exe';
    if (ext === 'pdf') return 'file-pdf';
    const group = groupForName(entry.name);
    return (group && GROUP_ICONS[group]) || 'file';
}

/** 常用位置 → 图标名；挂载点统一使用硬盘图标 */
export function placeIcon(key) {
    if (key === 'root') return 'root';
    if (key === 'drive') return 'drive';
    return ICONS[key] ? key : 'folder';
}
