<template>
    <div class="file-list">
        <div class="list-header" :style="gridStyle">
            <button class="col-head name" @click.stop="onSort('name')">
                <span>{{ t('list.name') }}</span>
                <span v-if="sortBy === 'name'" class="sort-arrow">{{ sortDesc ? '↓' : '↑' }}</span>
            </button>
            <button class="col-head size" @click.stop="onSort('size')">
                <span>{{ t('list.size') }}</span>
                <span v-if="sortBy === 'size'" class="sort-arrow">{{ sortDesc ? '↓' : '↑' }}</span>
            </button>
            <button class="col-head" @click.stop="onSort('mtime')">
                <span>{{ t('list.mtime') }}</span>
                <span v-if="sortBy === 'mtime'" class="sort-arrow">{{ sortDesc ? '↓' : '↑' }}</span>
            </button>
            <button class="col-head" @click.stop="onSort('type')">
                <span>{{ t('list.type') }}</span>
                <span v-if="sortBy === 'type'" class="sort-arrow">{{ sortDesc ? '↓' : '↑' }}</span>
            </button>
        </div>

        <div
            ref="bodyRef"
            class="list-body"
            :class="{ 'drag-over': dragOverPath === '' }"
            @scroll="onScroll"
            @click="onBlankClick"
            @contextmenu.stop.prevent="onBlankContextMenu"
            @dragover="onBodyDragOver"
            @drop="onBodyDrop"
        >
            <div v-if="st.loading && !st.entries.length" class="state-block">
                <span class="state-spinner" aria-hidden="true"></span>
                <span class="state-text">{{ t('list.loading') }}</span>
            </div>

            <div v-else-if="st.error" class="state-block">
                <AppIcon name="warning" :size="30" class="state-icon is-danger" />
                <span class="state-title">{{ t('list.errorTitle') }}</span>
                <span class="state-text">{{ errorText }}</span>
                <div class="state-actions">
                    <button class="state-button" @click="refresh">{{ t('list.retry') }}</button>
                    <button v-if="canUp" class="state-button" @click="goUp">{{ t('path.up') }}</button>
                </div>
            </div>

            <div v-else-if="!sorted.length" class="state-block">
                <AppIcon name="folder-open" :size="32" class="state-icon" />
                <span class="state-text">{{ t('list.empty') }}</span>
            </div>

            <template v-else>
                <div :style="{ height: `${topPad}px` }"></div>
                <div
                    v-for="entry in visible"
                    :key="entry.path"
                    class="row"
                    :class="{
                        selected: isSelected(entry),
                        focused: entry.path === st.focusedPath,
                        unreadable: !entry.readable,
                        'is-cut': clipboard.isCut(entry.path),
                        'drag-over': dragOverPath === entry.path
                    }"
                    :style="{ ...gridStyle, height: `${rowHeight}px` }"
                    :draggable="true"
                    @click.stop="onRowClick(entry, $event)"
                    @dblclick.stop="onRowDblClick(entry)"
                    @contextmenu.stop.prevent="onRowContextMenu(entry, $event)"
                    @dragstart="onRowDragStart(entry, $event)"
                    @dragover="onRowDragOver(entry, $event)"
                    @dragleave="onRowDragLeave"
                    @drop="onRowDrop(entry, $event)"
                    @dragend="onRowDragEnd"
                >
                    <span class="cell name">
                        <AppIcon
                            v-if="settings.showIcons"
                            class="icon"
                            :class="iconClass(entry)"
                            :name="fileIcon(entry)"
                            :size="iconSize"
                            :dataUrl="entry.icon || null"
                        />
                        <input
                            v-if="renamingPath === entry.path"
                            ref="renameInputRef"
                            v-model="renameDraft"
                            class="rename-input"
                            spellcheck="false"
                            @click.stop
                            @dblclick.stop
                            @keydown.enter.prevent="commitRename(entry)"
                            @keydown.esc.prevent="cancelRename"
                            @blur="commitRename(entry)"
                        />
                        <span v-else class="name-text">{{ entry.name }}</span>
                        <AppIcon
                            v-if="entry.kind === 'link' && entry.linkTarget === 'broken'"
                            name="warning"
                            :size="14"
                            class="broken-icon"
                        />
                    </span>
                    <span class="cell size">{{ isDirEntry(entry) ? '—' : formatSize(entry.size) }}</span>
                    <span class="cell mtime">{{ formatTime(entry.mtime) }}</span>
                    <span class="cell type">{{ typeText(entry, t) }}</span>
                </div>
                <div :style="{ height: `${bottomPad}px` }"></div>
            </template>
        </div>

        <transition name="toast">
            <div v-if="toast" class="toast">{{ toast }}</div>
        </transition>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';
import { useSettingsStore } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';
import { useClipboardStore } from '@/stores/clipboard';
import { useTransfersStore } from '@/stores/transfers';
import AppIcon from './AppIcon.vue';
import { sortEntries, isDirEntry } from '@/utils/sort';
import { formatSize, formatTime, typeText, errorText as errorTextOf } from '@/utils/format';
import { fileIcon } from '@/utils/icons';
import { isRoot } from '@/utils/path';
import { setInternalDrag, getInternalDrag, clearInternalDrag } from '@/utils/drag';

const api = window.filecommander;

const props = defineProps({
    pane: { type: String, required: true }
});

const { t, te } = useI18n();
const panes = usePanesStore();
const listings = useListingsStore();
const settings = useSettingsStore();
const ui = useUiStore();
const clipboard = useClipboardStore();
const transfers = useTransfersStore();

const bodyRef = ref(null);
const scrollTop = ref(0);
const viewport = ref(600);
const toast = ref('');
const dragOverPath = ref(null); // '' 表示空白区域，null 表示无
const typeBuffer = ref('');
let toastTimer = null;
let observer = null;
let typeTimer = null;

const tab = computed(() => panes.activeTab(props.pane));
const st = computed(() => listings.ensure(tab.value.id));
const tabId = computed(() => tab.value.id);
const sortBy = computed(() => st.value.sort.by);
const sortDesc = computed(() => st.value.sort.desc);
const rowHeight = computed(() => settings.rowHeight);
// 图标大小跟随文件字号线性缩放，并受行高约束避免溢出
// 字号 13 → 图标 16px，字号 16 → 图标 19px；行高给图标留 4px 边距
const iconSize = computed(() => {
    const byFont = settings.fonts.file.size + 3;
    const byRow = settings.rowHeight - 4;
    return Math.max(12, Math.min(32, Math.min(byFont, byRow)));
});

const sorted = computed(() => {
    const list = sortEntries(st.value.entries, {
        by: st.value.sort.by,
        desc: st.value.sort.desc,
        dirsFirst: settings.dirsFirst
    });
    const filter = (st.value.filter || '').trim().toLowerCase();
    if (!filter) return list;
    return list.filter((entry) => entry.name.toLowerCase().includes(filter));
});

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - 3));
const endIndex = computed(() => Math.min(
    sorted.value.length,
    Math.ceil((scrollTop.value + viewport.value) / rowHeight.value) + 3
));
const visible = computed(() => sorted.value.slice(startIndex.value, endIndex.value));
const topPad = computed(() => startIndex.value * rowHeight.value);
const bottomPad = computed(() => Math.max(0, (sorted.value.length - endIndex.value) * rowHeight.value));

const gridStyle = computed(() => ({
    gridTemplateColumns: [
        'minmax(0, 1fr)',
        `clamp(56px, 20%, ${settings.columns.size}px)`,
        `clamp(84px, 30%, ${settings.columns.mtime}px)`,
        `clamp(56px, 20%, ${settings.columns.type}px)`
    ].join(' ')
}));

const canUp = computed(() => !isRoot(st.value.dir));
const errorText = computed(() => {
    const key = `errors.${st.value.error}`;
    return te(key) ? t(key) : t('errors.UNKNOWN');
});

function isSelected(entry) {
    return st.value.selected.has(entry.path);
}

function iconClass(entry) {
    if (entry.kind === 'dir' || (entry.kind === 'link' && entry.linkTarget === 'dir')) return 'is-dir';
    if (entry.kind === 'link' && entry.linkTarget === 'broken') return 'is-danger';
    return 'is-file';
}

function showToast(message) {
    toast.value = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.value = '';
        toastTimer = null;
    }, 2600);
}

// ---------------------------------------------------------------------------
// 内联重命名（F2）
// ---------------------------------------------------------------------------
const renamingPath = computed(() => (
    ui.renaming && ui.renaming.tabId === tabId.value ? ui.renaming.path : null
));
const renameDraft = ref('');
const renameInputRef = ref(null);
let renameCommitting = false;

watch(renamingPath, (path) => {
    if (!path) return;
    const entry = st.value.entries.find((item) => item.path === path);
    renameDraft.value = entry ? entry.name : '';
    nextTick(() => {
        const el = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value;
        if (!el) return;
        el.focus();
        const dot = renameDraft.value.lastIndexOf('.');
        if (entry && entry.kind !== 'dir' && dot > 0) el.setSelectionRange(0, dot);
        else el.select();
    });
});

function cancelRename() {
    if (renameCommitting) return;
    ui.cancelRename();
}

async function commitRename(entry) {
    if (renameCommitting || !ui.renaming) return;
    const newName = renameDraft.value.trim();
    if (!newName || newName === entry.name) {
        ui.cancelRename();
        return;
    }

    renameCommitting = true;
    const res = await api.rename({ path: entry.path, newName });
    renameCommitting = false;

    if (!res || !res.ok) {
        showToast(errorTextOf(res && res.error, t, te));
        nextTick(() => {
            const el = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value;
            if (el) el.focus();
        });
        return;
    }

    ui.cancelRename();
    await listings.openDir(props.pane, tabId.value, st.value.dir, { mode: 'refresh' });
    if (st.value.entries.some((item) => item.path === res.path)) {
        listings.selectOnly(tabId.value, res.path);
    }
}

function onScroll(event) {
    scrollTop.value = event.target.scrollTop;
}

function onSort(by) {
    panes.activatePane(props.pane);
    listings.setSort(tabId.value, by);
}

function onRowClick(entry, event) {
    panes.activatePane(props.pane);
    if (event.shiftKey) listings.extendSelection(tabId.value, entry.path, sorted.value);
    else if (event.ctrlKey || event.metaKey) listings.toggleSelection(tabId.value, entry.path);
    else listings.selectOnly(tabId.value, entry.path);
}

async function onRowDblClick(entry) {
    panes.activatePane(props.pane);
    listings.selectOnly(tabId.value, entry.path);
    await listings.open(props.pane, tabId.value, entry);
}

function onBlankClick() {
    panes.activatePane(props.pane);
    listings.clearSelection(tabId.value);
}

// ---------------------------------------------------------------------------
// 右键菜单
// ---------------------------------------------------------------------------
function onRowContextMenu(entry, event) {
    panes.activatePane(props.pane);
    // 右键未选中项时改为单选
    if (!st.value.selected.has(entry.path)) {
        listings.selectOnly(tabId.value, entry.path);
    }
    const paths = [...st.value.selected];
    ui.openContextMenu({
        x: event.clientX,
        y: event.clientY,
        pane: props.pane,
        tabId: tabId.value,
        entry,
        paths
    });
}

function onBlankContextMenu(event) {
    panes.activatePane(props.pane);
    ui.openContextMenu({
        x: event.clientX,
        y: event.clientY,
        pane: props.pane,
        tabId: tabId.value,
        entry: null,
        paths: []
    });
}

// ---------------------------------------------------------------------------
// 拖拽
// ---------------------------------------------------------------------------
function onRowDragStart(entry, event) {
    panes.activatePane(props.pane);
    // 如果拖动的项不在当前选中集合中，改为单选此项
    if (!st.value.selected.has(entry.path)) {
        listings.selectOnly(tabId.value, entry.path);
    }
    const paths = [...st.value.selected];
    if (!paths.length) {
        event.preventDefault();
        return;
    }
    setInternalDrag({ paths, sourcePane: props.pane });
    // 通知主进程发起原生拖拽（拖出到系统文件管理器）
    try {
        api.dragStart(paths);
    } catch (err) {
        // 忽略
    }
}

function onRowDragEnd() {
    clearInternalDrag();
    dragOverPath.value = null;
}

function onRowDragOver(entry, event) {
    if (!entry) return;
    event.preventDefault();
    dragOverPath.value = entry.path;
}

function onRowDragLeave() {
    // 延迟清除，避免在行间移动时闪烁
    dragOverPath.value = null;
}

function onBodyDragOver(event) {
    // 只在没有内部/外部数据时不处理
    event.preventDefault();
    dragOverPath.value = '';
}

function resolveTransfer(event) {
    const internal = getInternalDrag();
    if (internal && internal.paths && internal.paths.length) {
        // 内部拖拽：默认移动（同卷），按住 Ctrl 为复制
        const ctrl = event.ctrlKey || event.metaKey;
        const op = ctrl ? 'copy' : 'move';
        return { op, sources: internal.paths, internal: true };
    }
    // 外部拖入：默认复制
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        const files = Array.from(event.dataTransfer.files);
        const paths = files
            .map((f) => {
                try { return api.getPathForFile(f); } catch (err) { return null; }
            })
            .filter(Boolean);
        if (paths.length) return { op: 'copy', sources: paths, internal: false };
    }
    return null;
}

function onRowDrop(entry, event) {
    event.preventDefault();
    event.stopPropagation();
    const internal = getInternalDrag();
    // 拖到目录行上时目标为该目录；否则为面板当前目录
    const targetDir = entry && isDirEntry(entry) ? entry.path : st.value.dir;
    doDrop(event, targetDir);
}

function onBodyDrop(event) {
    event.preventDefault();
    doDrop(event, st.value.dir);
}

async function doDrop(event, targetDir) {
    const plan = resolveTransfer(event);
    dragOverPath.value = null;
    clearInternalDrag();
    if (!plan) return;
    if (!targetDir) return;
    const res = await transfers.start(plan.op, plan.sources, targetDir);
    if (!res || !res.ok) {
        ui.showToast(errorTextOf(res && res.error, t, te), 'danger');
    }
}

function refresh() {
    listings.refresh(props.pane, tabId.value);
}

function goUp() {
    listings.up(props.pane, tabId.value);
}

// ---------------------------------------------------------------------------
// 虚拟滚动与聚焦滚动
// ---------------------------------------------------------------------------
function measure() {
    if (bodyRef.value) viewport.value = bodyRef.value.clientHeight;
}

watch(() => st.value.dir, () => {
    scrollTop.value = 0;
    if (bodyRef.value) bodyRef.value.scrollTop = 0;
});

watch(() => st.value.focusedPath, (path) => {
    if (!path || !bodyRef.value) return;
    const index = sorted.value.findIndex((entry) => entry.path === path);
    if (index < 0) return;
    const top = index * rowHeight.value;
    const bottom = top + rowHeight.value;
    const viewTop = bodyRef.value.scrollTop;
    const viewBottom = viewTop + bodyRef.value.clientHeight;
    if (top < viewTop) bodyRef.value.scrollTop = top;
    else if (bottom > viewBottom) bodyRef.value.scrollTop = bottom - bodyRef.value.clientHeight;
});

// ---------------------------------------------------------------------------
// 键盘
// ---------------------------------------------------------------------------
function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function moveFocus(delta, { extend = false, page = false } = {}) {
    const list = sorted.value;
    if (!list.length) return;
    const pageSize = Math.max(1, Math.floor(viewport.value / rowHeight.value) - 1);
    let index = list.findIndex((entry) => entry.path === st.value.focusedPath);
    if (index < 0) index = delta > 0 ? -1 : 0;
    const next = Math.max(0, Math.min(list.length - 1, index + (page ? pageSize * delta : delta)));
    const entry = list[next];
    if (extend) listings.extendSelection(tabId.value, entry.path, list);
    else listings.selectOnly(tabId.value, entry.path);
}

function focusOnly(delta) {
    const list = sorted.value;
    if (!list.length) return;
    let index = list.findIndex((entry) => entry.path === st.value.focusedPath);
    if (index < 0) index = -1;
    const next = Math.max(0, Math.min(list.length - 1, index + delta));
    listings.setFocus(tabId.value, list[next].path);
}

function toggleCurrent(moveAfter) {
    const list = sorted.value;
    if (!list.length) return;
    const current = list.find((entry) => entry.path === st.value.focusedPath) || list[0];
    listings.toggleSelection(tabId.value, current.path);
    if (moveAfter) focusOnly(1);
}

function onKeydown(event) {
    if (ui.settingsOpen || ui.helpOpen || ui.namePrompt || ui.properties) return;
    if (props.pane !== panes.activePane) return;
    if (event.defaultPrevented || event.isComposing || isEditable(event.target)) return;

    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && !event.altKey) {
        if (event.key.toLowerCase() === 'a') {
            event.preventDefault();
            if (event.shiftKey) listings.clearSelection(tabId.value);
            else listings.selectAll(tabId.value);
        }
        return;
    }
    if (ctrl || event.altKey) return;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            moveFocus(1, { extend: event.shiftKey });
            break;
        case 'ArrowUp':
            event.preventDefault();
            moveFocus(-1, { extend: event.shiftKey });
            break;
        case 'PageDown':
            event.preventDefault();
            moveFocus(1, { extend: event.shiftKey, page: true });
            break;
        case 'PageUp':
            event.preventDefault();
            moveFocus(-1, { extend: event.shiftKey, page: true });
            break;
        case 'Home':
            event.preventDefault();
            if (sorted.value.length) {
                const first = sorted.value[0];
                if (event.shiftKey) listings.extendSelection(tabId.value, first.path, sorted.value);
                else listings.selectOnly(tabId.value, first.path);
            }
            break;
        case 'End':
            event.preventDefault();
            if (sorted.value.length) {
                const last = sorted.value[sorted.value.length - 1];
                if (event.shiftKey) listings.extendSelection(tabId.value, last.path, sorted.value);
                else listings.selectOnly(tabId.value, last.path);
            }
            break;
        case ' ':
            event.preventDefault();
            toggleCurrent(false);
            break;
        case 'Insert':
            event.preventDefault();
            toggleCurrent(true);
            break;
        case 'Backspace':
            // 类型定位缓冲内删除字符
            if (typeBuffer.value) {
                event.preventDefault();
                typeBuffer.value = typeBuffer.value.slice(0, -1);
                resetTypeTimer();
            }
            break;
        default:
            // 类型定位：可打印字符
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                typeBuffer.value += event.key;
                resetTypeTimer();
                typeAheadJump();
            }
            break;
    }
}

function resetTypeTimer() {
    if (typeTimer) clearTimeout(typeTimer);
    typeTimer = setTimeout(() => {
        typeBuffer.value = '';
        typeTimer = null;
    }, 500);
}

function typeAheadJump() {
    const list = sorted.value;
    if (!list.length || !typeBuffer.value) return;
    const prefix = typeBuffer.value.toLowerCase();
    const currentIndex = list.findIndex((entry) => entry.path === st.value.focusedPath);
    const start = currentIndex + 1;
    // 从当前焦点的下一项开始循环查找
    for (let i = 0; i < list.length; i++) {
        const idx = (start + i) % list.length;
        if (list[idx].name.toLowerCase().startsWith(prefix)) {
            listings.selectOnly(tabId.value, list[idx].path);
            return;
        }
    }
}

onMounted(() => {
    measure();
    observer = new ResizeObserver(measure);
    if (bodyRef.value) observer.observe(bodyRef.value);
    window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    if (observer) observer.disconnect();
    if (toastTimer) clearTimeout(toastTimer);
    if (typeTimer) clearTimeout(typeTimer);
});
</script>

<style scoped>
.file-list {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    background: var(--panel-bg);
}

.list-header {
    display: grid;
    align-items: center;
    flex: 0 0 28px;
    height: 28px;
    padding: 0 10px;
    background: var(--panel-head);
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 12px;
    overflow: hidden;
}

.col-head {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}

.col-head > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.col-head:hover {
    color: var(--text);
}

.col-head.size {
    justify-content: flex-end;
    padding-right: 12px;
}

.col-head:nth-child(3) {
    padding-right: 12px;
}

.sort-arrow {
    flex: 0 0 auto;
    font-size: 10px;
    color: var(--accent);
}

.list-body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    outline: none;
}

.row {
    display: grid;
    align-items: center;
    padding: 0 10px;
    color: var(--text);
    font-family: var(--file-font-family);
    font-size: var(--file-font-size);
    cursor: default;
}

.row:hover {
    background: var(--hover-bg);
}

.row.selected {
    background: var(--selected);
}

.row.focused {
    box-shadow: inset 0 0 0 1px var(--accent);
    border-radius: 2px;
}

.row.unreadable {
    color: var(--text-secondary);
}

.row.is-cut {
    opacity: 0.45;
}

.row.drag-over {
    background: var(--selected);
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
}

.list-body.drag-over {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
}

.cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cell.name {
    display: flex;
    align-items: center;
    gap: 6px;
}

.icon.is-dir {
    color: var(--icon-folder);
}

.icon.is-file {
    color: var(--icon-file);
}

.icon.is-danger {
    color: var(--danger);
}

.broken-icon {
    color: var(--danger);
}

.name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rename-input {
    flex: 1 1 auto;
    min-width: 0;
    height: calc(var(--row-height) - 8px);
    padding: 0 4px;
    border: 1px solid var(--accent);
    border-radius: 2px;
    background: var(--input-bg);
    color: var(--text);
    font-family: inherit;
    font-size: inherit;
    outline: none;
}

.state-icon {
    color: var(--text-secondary);
    opacity: 0.8;
}

.state-icon.is-danger {
    color: var(--danger);
    opacity: 1;
}

.state-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: fc-spin 800ms linear infinite;
}

@keyframes fc-spin {
    to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
    .state-spinner {
        animation-duration: 2.4s;
    }
}

.cell.size {
    text-align: right;
    padding-right: 12px;
    color: var(--text-secondary);
}

.cell.mtime,
.cell.type {
    padding-right: 12px;
    color: var(--text-secondary);
}

.state-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    padding: 24px;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: center;
}

.state-title {
    color: var(--text);
    font-size: 13px;
}

.state-actions {
    display: flex;
    gap: 8px;
}

.state-button {
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel-bg);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
}

.state-button:hover {
    border-color: var(--accent);
    color: var(--accent);
}

.toast {
    position: absolute;
    right: 12px;
    bottom: 12px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-head);
    color: var(--text);
    font-size: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

.toast-enter-active,
.toast-leave-active {
    transition: opacity 150ms ease;
}

.toast-enter-from,
.toast-leave-to {
    opacity: 0;
}
</style>
