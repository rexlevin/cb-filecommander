import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 浮层状态：设置、帮助、新建、属性、内联重命名、确认框与全局提示。
 */
export const useUiStore = defineStore('ui', () => {
    const settingsOpen = ref(false);
    const settingsSection = ref('appearance');
    const helpOpen = ref(false);
    // 新建文件/文件夹：{ kind: 'dir'|'file', pane, tabId, dir }
    const namePrompt = ref(null);
    // 属性：{ paths: string[] }
    const properties = ref(null);
    // 内联重命名：{ tabId, path }
    const renaming = ref(null);
    // 通用确认框：{ title, message, confirmLabel, cancelLabel, danger, callback(result) }
    const confirm = ref(null);
    // 全局提示：{ id, message, tone }
    const toast = ref(null);
    // 右键菜单：{ x, y, pane, tabId, entry: Entry|null, paths: string[] }
    const contextMenu = ref(null);
    let toastTimer = null;

    function openSettings(section = 'appearance') {
        settingsSection.value = section;
        helpOpen.value = false;
        settingsOpen.value = true;
    }

    function closeSettings() {
        settingsOpen.value = false;
    }

    function openHelp() {
        settingsOpen.value = false;
        helpOpen.value = true;
    }

    function closeHelp() {
        helpOpen.value = false;
    }

    function openNamePrompt(payload) {
        namePrompt.value = payload;
    }

    function closeNamePrompt() {
        namePrompt.value = null;
    }

    function openProperties(paths) {
        properties.value = { paths: Array.isArray(paths) ? paths : [] };
    }

    function closeProperties() {
        properties.value = null;
    }

    function startRename(tabId, path) {
        renaming.value = { tabId, path };
    }

    function cancelRename() {
        renaming.value = null;
    }

    function showToast(message, tone = 'info', duration = 2600) {
        if (!message) return;
        toast.value = { id: Date.now(), message, tone };
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.value = null;
            toastTimer = null;
        }, duration);
    }

    function closeToast() {
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        toast.value = null;
    }

    /**
     * 返回 Promise：resolve(true) 确认；resolve(false) 取消。
     * 连续调用时会替换上一个等待（callback 被强制 false）。
     */
    function openConfirm({ title, message, confirmLabel, cancelLabel, danger }) {
        return new Promise((resolve) => {
            // 替换上一个等待
            if (confirm.value && confirm.value.resolve) confirm.value.resolve(false);
            confirm.value = {
                title: title || '确认',
                message: String(message || ''),
                confirmLabel: confirmLabel || '确定',
                cancelLabel: cancelLabel || '取消',
                danger: !!danger,
                resolve
            };
        });
    }

    function closeConfirm(result = false) {
        if (!confirm.value) return;
        const resolver = confirm.value.resolve;
        confirm.value = null;
        if (typeof resolver === 'function') resolver(result);
    }

    function openContextMenu(payload) {
        contextMenu.value = payload || null;
    }

    function closeContextMenu() {
        contextMenu.value = null;
    }

    return {
        settingsOpen, settingsSection, helpOpen,
        namePrompt, properties, renaming, confirm, toast, contextMenu,
        openSettings, closeSettings, openHelp, closeHelp,
        openNamePrompt, closeNamePrompt, openProperties, closeProperties,
        startRename, cancelRename,
        openConfirm, closeConfirm,
        openContextMenu, closeContextMenu,
        showToast, closeToast
    };
});
