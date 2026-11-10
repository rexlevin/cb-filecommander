/**
 * 应用内拖拽载荷。
 *
 * 内部拖拽使用模块级变量传递（路径 + 源面板），不依赖 dataTransfer 自定义类型，
 * 避免与系统拖入/拖出的文件数据互相干扰。
 *
 * @type {{paths: string[], sourcePane: 'left'|'right'|null}|null}
 */
let internalDrag = null;

export function setInternalDrag(payload) {
    internalDrag = payload || null;
}

export function getInternalDrag() {
    return internalDrag;
}

export function clearInternalDrag() {
    internalDrag = null;
}
