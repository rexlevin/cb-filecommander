import { defineStore } from 'pinia';
import { ref } from 'vue';

const api = window.filecommander;

/**
 * 内部剪贴板：复制 / 剪切。
 *
 * - Ctrl+C / Ctrl+X 写入内部剪贴板，同时把绝对路径以纯文本写入系统剪贴板，
 *   方便与其它程序交换路径文本。
 * - Ctrl+Shift+C 只把选中项的绝对路径写入系统剪贴板，不写入内部剪贴板，
 *   因此不会把 Ctrl+V 变成文件复制操作。
 * - Ctrl+V 优先使用内部剪贴板；为空时读取系统剪贴板文本，按行过滤真实存在的绝对路径。
 * - 剪切后的源项在列表中显示为半透明；粘贴成功或 Esc 后清除。
 */
export const useClipboardStore = defineStore('clipboard', () => {
    /** 'none' | 'copy' | 'cut' */
    const mode = ref('none');
    const paths = ref([]);
    const sourcePane = ref('left');

    function set(modeValue, pathList, pane) {
        mode.value = modeValue;
        paths.value = Array.isArray(pathList) ? [...pathList] : [];
        sourcePane.value = pane || 'left';
    }

    function clear() {
        mode.value = 'none';
        paths.value = [];
    }

    function isCut(path) {
        return mode.value === 'cut' && paths.value.includes(path);
    }

    /** 把路径列表以换行分隔的文本写入系统剪贴板 */
    async function writePathsText(pathList) {
        if (!Array.isArray(pathList) || !pathList.length) return;
        await api.clipboardWriteText(pathList.join('\n'));
    }

    /**
     * 从系统剪贴板读取文本，按行/空白拆分并过滤出真实存在的绝对路径。
     * 返回 Promise<string[]>。
     */
    async function readPathsFromSystem() {
        const res = await api.clipboardReadText();
        if (!res || !res.ok || !res.text) return [];
        const candidates = res.text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        const result = [];
        for (const candidate of candidates) {
            if (!/^([A-Za-z]:[\\/]|\/|\\\\)/.test(candidate)) continue;
            result.push(candidate);
        }
        return result;
    }

    return {
        mode, paths, sourcePane,
        set, clear, isCut, writePathsText, readPathsFromSystem
    };
});
