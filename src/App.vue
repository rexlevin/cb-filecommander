<template>
    <DualPane />
    <SettingsDialog v-if="ui.settingsOpen" />
    <HelpDialog v-if="ui.helpOpen" />
    <NameDialog v-if="ui.namePrompt" />
    <PropertiesDialog v-if="ui.properties" />
    <ConflictDialog v-if="transfers.conflict" />
    <ConfirmDialog v-if="ui.confirm" />
    <TransferBar />
    <ContextMenu />
    <transition name="app-toast">
        <div v-if="ui.toast" class="app-toast" :class="`is-${ui.toast.tone}`" @click="ui.closeToast()">
            {{ ui.toast.message }}
        </div>
    </transition>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DualPane from '@/components/DualPane.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import HelpDialog from '@/components/HelpDialog.vue';
import NameDialog from '@/components/NameDialog.vue';
import PropertiesDialog from '@/components/PropertiesDialog.vue';
import ConflictDialog from '@/components/ConflictDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import TransferBar from '@/components/TransferBar.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { useTransfersStore } from '@/stores/transfers';
import { useClipboardStore } from '@/stores/clipboard';
import { useUiStore } from '@/stores/ui';
import { sortEntries } from '@/utils/sort';
import { errorText } from '@/utils/format';

const api = window.filecommander;
const { t, te } = useI18n();
const panes = usePanesStore();
const listings = useListingsStore();
const session = useSessionStore();
const settings = useSettingsStore();
const transfers = useTransfersStore();
const clipboard = useClipboardStore();
const ui = useUiStore();

let offMenuAction = null;
let offDirChanged = null;
let offTransferDone = null;

function clampZoom(value) {
    return Math.min(2, Math.max(0.5, Math.round(value * 10) / 10));
}

function stepZoom(delta) {
    const current = Number(settings.zoom) || 1;
    const next = clampZoom(current + delta);
    if (next !== current) settings.set('zoom', next);
}

function resetZoom() {
    const current = Number(settings.zoom) || 1;
    if (current !== 1) settings.set('zoom', 1);
}

function onWheelZoom(event) {
    if (modalOpen()) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (!ctrl) return;
    // 只在不聚焦在可编辑控件时拦截（数字输入框允许用滚轮调节值）
    if (isEditable(event.target)) return;
    event.preventDefault();
    // 100 deltaY ≈ 鼠标一格；精细步长避免一次跨太多档
    const delta = -Math.sign(event.deltaY) * (Math.abs(event.deltaY) < 20 ? 0.02 : 0.05);
    stepZoom(delta);
}

function saveSession() {
    session.persist(panes.snapshot());
}

function flushSession() {
    session.persistNow(panes.snapshot());
}

function activeContext() {
    const pane = panes.activePane;
    const tab = panes.activeTab(pane);
    return { pane, tab };
}

/** 当前面板选中项，按列表排序顺序返回 */
function selectedEntries(pane, tab) {
    const state = listings.ensure(tab.id);
    return sortEntries(state.entries, {
        by: state.sort.by,
        desc: state.sort.desc,
        dirsFirst: settings.dirsFirst
    }).filter((entry) => state.selected.has(entry.path));
}

async function transferSelection(op) {
    const { pane, tab } = activeContext();
    if (!tab || !tab.dir) return;
    const entries = selectedEntries(pane, tab);
    if (!entries.length) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    const targetPane = pane === 'left' ? 'right' : 'left';
    const targetTab = panes.activeTab(targetPane);
    if (!targetTab || !targetTab.dir) return;

    const summary = entriesSummary(entries);
    const targetLabel = targetTab.dir;
    const namesLine = entries.length <= 3
        ? summary.names.map((n) => `  · ${n}`).join('\n')
        : `${summary.names.map((n) => `  · ${n}`).join('\n')}\n  ${t('confirm.moreNames', { count: entries.length - 3 })}`;

    const confirmed = await ui.openConfirm({
        title: t(op === 'move' ? 'confirm.moveTitle' : 'confirm.copyTitle'),
        message: t(op === 'move' ? 'confirm.moveMessage' : 'confirm.copyMessage', {
            summary: summaryText(summary, t),
            names: namesLine,
            target: targetLabel
        }),
        confirmLabel: t(op === 'move' ? 'ops.move' : 'ops.copy'),
        cancelLabel: t('common.cancel')
    });
    if (!confirmed) return;

    const res = await transfers.start(op, entries.map((entry) => entry.path), targetTab.dir);
    if (!res || !res.ok) {
        ui.showToast(errorText(res && res.error, t, te), 'danger');
    }
}

async function deleteSelection() {
    const { pane, tab } = activeContext();
    if (!tab || !tab.dir) return;
    const entries = selectedEntries(pane, tab);
    if (!entries.length) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }

    const summary = entriesSummary(entries);
    const namesLine = entries.length <= 3
        ? summary.names.map((n) => `  · ${n}`).join('\n')
        : `${summary.names.map((n) => `  · ${n}`).join('\n')}\n  ${t('confirm.moreNames', { count: entries.length - 3 })}`;

    const confirmed = await ui.openConfirm({
        title: t('confirm.deleteTitle'),
        message: t('confirm.deleteMessage', {
            summary: summaryText(summary, t),
            names: namesLine
        }),
        confirmLabel: t('ops.delete'),
        cancelLabel: t('common.cancel'),
        danger: true
    });
    if (!confirmed) return;

    const res = await transfers.start('delete', entries.map((entry) => entry.path));
    if (!res || !res.ok) {
        ui.showToast(errorText(res && res.error, t, te), 'danger');
    }
}

function openNamePrompt(kind) {
    const { pane, tab } = activeContext();
    if (!tab || !tab.dir) return;
    ui.openNamePrompt({ kind, pane, tabId: tab.id, dir: tab.dir });
}

function startRename() {
    const { pane, tab } = activeContext();
    if (!tab) return;
    const state = listings.ensure(tab.id);
    if (state.selected.size > 1) {
        ui.showToast(t('errors.RENAME_MULTI'), 'warning');
        return;
    }
    const path = state.focusedPath || state.selected.values().next().value || null;
    if (!path) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    ui.startRename(tab.id, path);
}

function openProperties() {
    const { pane, tab } = activeContext();
    if (!tab) return;
    const entries = selectedEntries(pane, tab);
    if (!entries.length) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    ui.openProperties(entries.map((entry) => entry.path));
}

/** 用外部编辑器打开焦点文件（F4） */
async function openFocusedWithEditor() {
    const { pane, tab } = activeContext();
    if (!tab) return;
    const state = listings.ensure(tab.id);
    if (state.selected.size > 1) {
        ui.showToast(t('errors.MULTI_SELECTED'), 'warning');
        return;
    }
    const path = state.focusedPath || (state.selected.size === 1 ? state.selected.values().next().value : null);
    if (!path) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    const entry = state.entries.find((item) => item.path === path);
    if (!entry) return;
    if (entry.kind === 'dir') {
        ui.showToast(t('open.editorNotDir'), 'warning');
        return;
    }
    const program = settings.externalEditor;
    const res = await api.openWith({ path, program });
    if (!res || !res.ok) {
        ui.showToast(errorText(res && res.error, t, te), 'danger');
    }
}

// ---------------------------------------------------------------------------
// 剪贴板：Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+Shift+C
// ---------------------------------------------------------------------------
function copySelection() {
    const { pane, tab } = activeContext();
    if (!tab) return;
    const entries = selectedEntries(pane, tab);
    if (!entries.length) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    const paths = entries.map((entry) => entry.path);
    clipboard.set('copy', paths, pane);
    clipboard.writePathsText(paths);
    ui.showToast(t('clipboard.copied', { count: paths.length }), 'info');
}

function cutSelection() {
    const { pane, tab } = activeContext();
    if (!tab) return;
    const entries = selectedEntries(pane, tab);
    if (!entries.length) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    const paths = entries.map((entry) => entry.path);
    clipboard.set('cut', paths, pane);
    clipboard.writePathsText(paths);
    ui.showToast(t('clipboard.cut', { count: paths.length }), 'info');
}

async function copyPathSelection() {
    const { pane, tab } = activeContext();
    if (!tab) return;
    const entries = selectedEntries(pane, tab);
    if (!entries.length) {
        ui.showToast(t('ops.noSelection'), 'warning');
        return;
    }
    const paths = entries.map((entry) => entry.path);
    await clipboard.writePathsText(paths);
    ui.showToast(t('clipboard.pathCopied', { count: paths.length }), 'info');
}

async function pasteSelection() {
    const { pane, tab } = activeContext();
    if (!tab || !tab.dir) return;
    const targetDir = tab.dir;

    try {
        // 内部剪贴板优先
        if (clipboard.mode !== 'none' && clipboard.paths.length) {
            const mode = clipboard.mode;
            const sources = clipboard.paths;
            // 剪贴板模式 cut 对应传输引擎的 move 操作
            const op = mode === 'cut' ? 'move' : 'copy';
            // 剪切粘贴到源自身目录为无操作；粘贴到源子目录直接拒绝
            const res = await transfers.start(op, sources, targetDir);
            if (res && res.ok) {
                if (mode === 'cut') clipboard.clear();
                ui.showToast(t('clipboard.pasting'), 'info');
            } else {
                ui.showToast(errorText(res && res.error, t, te), 'danger');
            }
            return;
        }

        // 内部剪贴板为空时，从系统剪贴板读取文本路径
        const systemPaths = await clipboard.readPathsFromSystem();
        if (!systemPaths.length) {
            ui.showToast(t('clipboard.empty'), 'warning');
            return;
        }
        const res = await transfers.start('copy', systemPaths, targetDir);
        if (res && res.ok) {
            ui.showToast(t('clipboard.pasting'), 'info');
        } else {
            ui.showToast(errorText(res && res.error, t, te), 'danger');
        }
    } catch (error) {
        ui.showToast(error && error.message ? error.message : String(error), 'danger');
    }
}

function modalOpen() {
    return !!(ui.settingsOpen || ui.helpOpen || ui.namePrompt || ui.properties
        || ui.confirm || transfers.conflict);
}

/** 统计选中条目：分目录/文件/符号链接/其他，并抽出前几个名字 */
function entriesSummary(entries, { t: trans } = {}) {
    let dirs = 0;
    let files = 0;
    let links = 0;
    let other = 0;
    const names = [];
    for (const entry of entries) {
        if (entry.kind === 'dir') dirs += 1;
        else if (entry.kind === 'file') files += 1;
        else if (entry.kind === 'link') links += 1;
        else other += 1;
        if (names.length < 3) names.push(entry.name);
    }
    const count = entries.length;
    return { dirs, files, links, other, count, names };
}

/** 把统计转成可读中文/英文（按当前 locale） */
function summaryText(summary, tFunc) {
    const parts = [];
    if (summary.dirs) parts.push(tFunc('confirm.kindCountDir', { count: summary.dirs }));
    if (summary.files) parts.push(tFunc('confirm.kindCountFile', { count: summary.files }));
    if (summary.links) parts.push(tFunc('confirm.kindCountLink', { count: summary.links }));
    if (summary.other) parts.push(tFunc('confirm.kindCountOther', { count: summary.other }));
    return parts.join('，');
}

function handleMenuAction(payload) {
    const action = payload && payload.action;
    const { pane, tab } = activeContext();
    if (!tab) return;

    switch (action) {
        case 'tab.new':
            panes.addTab(pane);
            break;
        case 'tab.close':
            panes.closeActiveTab(pane);
            break;
        case 'pane.switch':
            panes.togglePane();
            break;
        case 'pane.focusLeft':
            panes.activatePane('left');
            break;
        case 'pane.focusRight':
            panes.activatePane('right');
            break;
        case 'file.open':
            listings.openFocused(pane, tab.id);
            break;
        case 'file.openWith':
            openFocusedWithEditor();
            break;
        case 'file.newFile':
            openNamePrompt('file');
            break;
        case 'file.newFolder':
            openNamePrompt('dir');
            break;
        case 'file.rename':
            startRename();
            break;
        case 'file.properties':
            openProperties();
            break;
        case 'file.copyTo':
            transferSelection('copy');
            break;
        case 'file.moveTo':
            transferSelection('move');
            break;
        case 'file.delete':
            deleteSelection();
            break;
        case 'view.refresh':
            clipboard.clear();
            listings.refresh(pane, tab.id);
            break;
        case 'view.sort.name':
            listings.setSort(tab.id, 'name');
            break;
        case 'view.sort.size':
            listings.setSort(tab.id, 'size');
            break;
        case 'view.sort.mtime':
            listings.setSort(tab.id, 'mtime');
            break;
        case 'view.sort.type':
            listings.setSort(tab.id, 'type');
            break;
        case 'edit.selectAll':
            listings.selectAll(tab.id);
            break;
        case 'edit.copy':
            copySelection();
            break;
        case 'edit.cut':
            cutSelection();
            break;
        case 'edit.paste':
            pasteSelection();
            break;
        case 'edit.copyPath':
            copyPathSelection();
            break;
        case 'go.up':
            listings.up(pane, tab.id);
            break;
        case 'go.back':
            listings.back(pane, tab.id);
            break;
        case 'go.forward':
            listings.forward(pane, tab.id);
            break;
        case 'go.pathBar':
            panes.focusPath(pane);
            break;
        case 'app.settings':
            ui.openSettings('appearance');
            break;
        case 'app.about':
            ui.openSettings('about');
            break;
        case 'help.shortcuts':
            ui.openHelp();
            break;
        default:
            break;
    }
}

function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function onKeydown(event) {
    if (modalOpen()) return;
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'F1') {
        event.preventDefault();
        ui.openHelp();
        return;
    }
    if (event.key === 'Escape') {
        // Esc：清空剪切状态与选择
        if (clipboard.mode === 'cut') clipboard.clear();
        const { pane, tab } = activeContext();
        if (tab) listings.clearSelection(tab.id);
        return;
    }
    const editable = isEditable(event.target);
    const ctrl = event.ctrlKey || event.metaKey;
    const { pane, tab } = activeContext();
    if (!tab) return;

    if (ctrl && !event.altKey) {
        const key = event.key;
        // Ctrl+Shift+C 必须先于 Ctrl+C 判断：只复制路径文本，不写入内部文件剪贴板
        if (key.toLowerCase() === 'c' && event.shiftKey) {
            event.preventDefault();
            if (!event.repeat) copyPathSelection();
            return;
        }
        // 缩放：Ctrl+=、Ctrl+-、Ctrl+0（macOS/Meta 同理）
        if (key === '=' || key === '+' || key === '-') {
            event.preventDefault();
            stepZoom(key === '-' ? -0.1 : 0.1);
            return;
        }
        if (key === '0') {
            event.preventDefault();
            resetZoom();
            return;
        }
        if (key === 'Tab') {
            event.preventDefault();
            panes.cycleTab(pane, event.shiftKey ? -1 : 1);
            return;
        }
        if (key === 'PageDown' || key === 'PageUp') {
            event.preventDefault();
            const delta = key === 'PageDown' ? 1 : -1;
            if (event.shiftKey) panes.moveActiveTab(pane, delta);
            else panes.cycleTab(pane, delta);
            return;
        }
        switch (key.toLowerCase()) {
            case 't':
                if (!event.shiftKey) {
                    event.preventDefault();
                    if (!event.repeat) panes.addTab(pane);
                }
                return;
            case 'w':
                if (!event.shiftKey) {
                    event.preventDefault();
                    if (!event.repeat) panes.closeActiveTab(pane);
                }
                return;
            case 'r':
                event.preventDefault();
                if (!event.repeat) {
                    clipboard.clear();
                    listings.refresh(pane, tab.id);
                }
                return;
            case 'h':
                event.preventDefault();
                if (!event.repeat) settings.set('showHidden', !settings.showHidden);
                return;
            case 'l':
                if (!editable) {
                    event.preventDefault();
                    panes.focusPath(pane);
                }
                return;
            case 'f':
                if (!editable) {
                    event.preventDefault();
                    if (!event.repeat) panes.focusFilter(pane);
                }
                return;
            case 'c':
                if (editable) return;
                event.preventDefault();
                if (!event.repeat) copySelection();
                return;
            case 'x':
                if (editable) return;
                event.preventDefault();
                if (!event.repeat) cutSelection();
                return;
            case 'v':
                if (editable) return;
                event.preventDefault();
                if (!event.repeat) pasteSelection();
                return;
            default:
                return;
        }
    }

    if (editable) return;

    // 文件操作快捷键（M2）
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === 'F2') {
            event.preventDefault();
            if (!event.repeat) startRename();
            return;
        }
        if (event.key === 'F4') {
            event.preventDefault();
            if (!event.repeat) openFocusedWithEditor();
            return;
        }
        if (event.key === 'F5') {
            event.preventDefault();
            if (!event.repeat) transferSelection('copy');
            return;
        }
        if (event.key === 'F6') {
            event.preventDefault();
            if (!event.repeat) transferSelection('move');
            return;
        }
        if (event.key === 'F7') {
            event.preventDefault();
            if (!event.repeat) openNamePrompt('dir');
            return;
        }
        if (event.key === 'F4' && event.shiftKey) {
            event.preventDefault();
            if (!event.repeat) openNamePrompt('file');
            return;
        }
        if (event.key === 'Delete') {
            event.preventDefault();
            if (!event.repeat) deleteSelection();
            return;
        }
    }
    if (event.altKey && event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) openProperties();
        return;
    }

    if (event.key === 'Tab') {
        event.preventDefault();
        panes.togglePane();
        return;
    }
    if (event.altKey && (event.key === '1' || event.key === '2')) {
        event.preventDefault();
        panes.activatePane(event.key === '1' ? 'left' : 'right');
        return;
    }
    if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        listings.back(pane, tab.id);
        return;
    }
    if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        listings.forward(pane, tab.id);
        return;
    }
    if (event.altKey) return;

    if (event.key === 'Enter') {
        event.preventDefault();
        listings.openFocused(pane, tab.id);
        return;
    }
    if (event.key === 'Backspace') {
        event.preventDefault();
        listings.up(pane, tab.id);
    }
}

function refreshActiveTabs({ onlyStale = false } = {}) {
    const now = Date.now();
    for (const pane of ['left', 'right']) {
        const tab = panes.activeTab(pane);
        if (!tab) continue;
        const state = listings.ensure(tab.id);
        if (!state.dir) continue;
        if (onlyStale && now - state.lastLoadedAt < 2000) continue;
        listings.refresh(pane, tab.id);
    }
}

function onWindowFocus() {
    if (document.hasFocus()) refreshActiveTabs({ onlyStale: true });
}

function onDirChanged(payload) {
    const dir = payload && payload.dir;
    if (!dir) return;
    for (const pane of ['left', 'right']) {
        const tab = panes.activeTab(pane);
        if (tab && tab.dir === dir) listings.refresh(pane, tab.id);
    }
}

watch(
    () => [panes.state, panes.ratio, panes.activePane],
    saveSession,
    { deep: true }
);

watch(
    () => [panes.activeTab('left').dir, panes.activeTab('right').dir],
    (dirs) => api.watchSet(dirs.filter(Boolean)),
    { immediate: true }
);

watch(() => settings.showHidden, () => refreshActiveTabs());

onMounted(() => {
    offMenuAction = api.onMenuAction(handleMenuAction);
    offDirChanged = api.onDirChanged(onDirChanged);
    offTransferDone = api.onTransferDone((payload) => {
        transfers.handleDone(payload);
        refreshActiveTabs();
    });
    window.addEventListener('beforeunload', flushSession);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('keydown', onKeydown);
    // Ctrl+滚轮缩放：passive 必须 false 才能 preventDefault，用 capture 优先于其它 wheel 监听
    window.addEventListener('wheel', onWheelZoom, { capture: true, passive: false });
});

onBeforeUnmount(() => {
    if (offMenuAction) offMenuAction();
    if (offDirChanged) offDirChanged();
    if (offTransferDone) offTransferDone();
    window.removeEventListener('beforeunload', flushSession);
    window.removeEventListener('focus', onWindowFocus);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('wheel', onWheelZoom, { capture: true });
});
</script>

<style scoped>
.app-toast {
    position: fixed;
    left: 50%;
    bottom: 96px;
    z-index: 150;
    max-width: min(560px, calc(100vw - 40px));
    padding: 7px 14px;
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-head);
    color: var(--text);
    font-size: var(--tab-font-size);
    box-shadow: var(--dialog-shadow);
    cursor: pointer;
}

.app-toast.is-warning {
    border-color: var(--accent);
    color: var(--accent);
}

.app-toast.is-danger {
    border-color: var(--danger);
    color: var(--danger);
}

.app-toast-enter-active,
.app-toast-leave-active {
    transition: opacity 150ms ease, transform 150ms ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
    opacity: 0;
    transform: translate(-50%, 8px);
}
</style>
