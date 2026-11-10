<template>
    <teleport to="body">
        <div
            v-if="ui.contextMenu"
            class="ctx-mask"
            @pointerdown="onMaskClick"
            @contextmenu.prevent
        >
            <div
                class="ctx-menu"
                :style="menuStyle"
                role="menu"
                @pointerdown.stop
                @contextmenu.prevent
            >
                <template v-for="(item, index) in items" :key="index">
                    <div v-if="item.separator" class="ctx-sep"></div>
                    <button
                        v-else
                        class="ctx-item"
                        :class="{ disabled: item.disabled }"
                        :disabled="item.disabled"
                        @click="onItemClick(item.action)"
                    >
                        <span class="ctx-label">{{ item.label }}</span>
                        <span v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</span>
                    </button>
                </template>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '@/stores/ui';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';
import { useTransfersStore } from '@/stores/transfers';
import { useClipboardStore } from '@/stores/clipboard';
import { isDirEntry } from '@/utils/sort';
import { errorText } from '@/utils/format';

const api = window.filecommander;
const { t, te } = useI18n();
const ui = useUiStore();
const panes = usePanesStore();
const listings = useListingsStore();
const transfers = useTransfersStore();
const clipboard = useClipboardStore();

const ctx = computed(() => ui.contextMenu);
const isSingle = computed(() => ctx.value && ctx.value.paths.length === 1);
const hasSelection = computed(() => ctx.value && ctx.value.paths.length > 0);
const singleEntry = computed(() => ctx.value ? ctx.value.entry : null);
const singleIsDir = computed(() => singleEntry.value && isDirEntry(singleEntry.value));

const menuStyle = computed(() => {
    if (!ctx.value) return {};
    const menuWidth = 220;
    const menuHeight = items.value.length * 30 + 20;
    let x = ctx.value.x;
    let y = ctx.value.y;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    return { left: `${x}px`, top: `${y}px` };
});

const items = computed(() => {
    const list = [];
    if (!ctx.value) return list;

    if (hasSelection.value) {
        // 打开（单选时可用；多选禁用）
        list.push({
            action: 'open',
            label: t('ctx.open'),
            shortcut: 'Enter',
            disabled: ctx.value.paths.length > 1
        });
        // 在新标签打开（仅单选目录）
        if (singleIsDir.value) {
            list.push({ action: 'openInNewTab', label: t('ctx.openInNewTab') });
        }
        list.push({ separator: true });

        // 复制 / 剪切 / 粘贴
        list.push({ action: 'copy', label: t('ctx.copy'), shortcut: 'Ctrl+C' });
        list.push({ action: 'cut', label: t('ctx.cut'), shortcut: 'Ctrl+X' });
        list.push({ action: 'paste', label: t('ctx.paste'), shortcut: 'Ctrl+V' });
        list.push({ separator: true });

        // 复制到另一栏 / 移动到另一栏
        list.push({ action: 'copyTo', label: t('ctx.copyTo'), shortcut: 'F5' });
        list.push({ action: 'moveTo', label: t('ctx.moveTo'), shortcut: 'F6' });
        list.push({ separator: true });

        // 重命名（仅单选）
        list.push({
            action: 'rename',
            label: t('ctx.rename'),
            shortcut: 'F2',
            disabled: !isSingle.value
        });
        // 复制路径
        list.push({ action: 'copyPath', label: t('ctx.copyPath'), shortcut: 'Ctrl+Shift+C' });
        list.push({ separator: true });

        // 在系统中显示（仅单选）
        list.push({
            action: 'showInFolder',
            label: t('ctx.showInFolder'),
            disabled: !isSingle.value
        });
        // 属性
        list.push({ action: 'properties', label: t('ctx.properties'), shortcut: 'Alt+Enter' });
    } else {
        // 空白处菜单
        list.push({ action: 'paste', label: t('ctx.paste'), shortcut: 'Ctrl+V' });
        list.push({ separator: true });
        list.push({ action: 'newFile', label: t('ctx.newFile'), shortcut: 'Shift+F4' });
        list.push({ action: 'newFolder', label: t('ctx.newFolder'), shortcut: 'F7' });
        list.push({ separator: true });
        list.push({ action: 'refresh', label: t('ctx.refresh'), shortcut: 'Ctrl+R' });
    }

    return list;
});

function selectedEntries() {
    if (!ctx.value) return [];
    const state = listings.ensure(ctx.value.tabId);
    return ctx.value.paths
        .map((p) => state.entries.find((e) => e.path === p))
        .filter(Boolean);
}

function activePaneDir() {
    const pane = panes.activePane;
    const tab = panes.activeTab(pane);
    return tab ? tab.dir : '';
}

async function onItemClick(action) {
    const c = ctx.value;
    if (!c) return;
    ui.closeContextMenu();
    // 激活菜单所在面板
    panes.activatePane(c.pane);

    const paths = c.paths;
    const entries = selectedEntries();

    switch (action) {
        case 'open': {
            if (c.entry) {
                await listings.open(c.pane, c.tabId, c.entry);
            }
            break;
        }
        case 'openInNewTab': {
            if (c.entry && isDirEntry(c.entry)) {
                const tab = panes.addTab(c.pane);
                if (tab) listings.ensureLoaded(c.pane, tab.id, c.entry.path);
            }
            break;
        }
        case 'copy': {
            clipboard.set('copy', paths, c.pane);
            clipboard.writePathsText(paths);
            ui.showToast(t('clipboard.copied', { count: paths.length }), 'info');
            break;
        }
        case 'cut': {
            clipboard.set('cut', paths, c.pane);
            clipboard.writePathsText(paths);
            ui.showToast(t('clipboard.cut', { count: paths.length }), 'info');
            break;
        }
        case 'paste': {
            await doPaste(c.pane);
            break;
        }
        case 'copyTo':
        case 'moveTo': {
            const op = action === 'copyTo' ? 'copy' : 'move';
            const targetPane = c.pane === 'left' ? 'right' : 'left';
            const targetTab = panes.activeTab(targetPane);
            if (!targetTab) break;
            const res = await transfers.start(op, paths, targetTab.dir);
            if (!res || !res.ok) ui.showToast(errorText(res && res.error, t, te), 'danger');
            break;
        }
        case 'rename': {
            if (c.entry) ui.startRename(c.tabId, c.entry.path);
            break;
        }
        case 'copyPath': {
            await clipboard.writePathsText(paths);
            ui.showToast(t('clipboard.pathCopied', { count: paths.length }), 'info');
            break;
        }
        case 'showInFolder': {
            if (c.entry) await api.showInFolder({ path: c.entry.path });
            break;
        }
        case 'properties': {
            ui.openProperties(paths);
            break;
        }
        case 'newFile': {
            ui.openNamePrompt({ kind: 'file', pane: c.pane, tabId: c.tabId, dir: activePaneDir() });
            break;
        }
        case 'newFolder': {
            ui.openNamePrompt({ kind: 'dir', pane: c.pane, tabId: c.tabId, dir: activePaneDir() });
            break;
        }
        case 'refresh': {
            listings.refresh(c.pane, c.tabId);
            break;
        }
        default:
            break;
    }
}

async function doPaste(pane) {
    const tab = panes.activeTab(pane);
    if (!tab || !tab.dir) return;
    const targetDir = tab.dir;
    if (clipboard.mode !== 'none' && clipboard.paths.length) {
        const op = clipboard.mode;
        const res = await transfers.start(op, clipboard.paths, targetDir);
        if (res && res.ok) {
            if (op === 'cut') clipboard.clear();
        } else {
            ui.showToast(errorText(res && res.error, t, te), 'danger');
        }
        return;
    }
    const systemPaths = await clipboard.readPathsFromSystem();
    if (!systemPaths.length) {
        ui.showToast(t('clipboard.empty'), 'warning');
        return;
    }
    const res = await transfers.start('copy', systemPaths, targetDir);
    if (!res || !res.ok) ui.showToast(errorText(res && res.error, t, te), 'danger');
}

function onMaskClick(event) {
    // 点击遮罩关闭
    if (event.target.classList.contains('ctx-mask')) ui.closeContextMenu();
}

function onKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        ui.closeContextMenu();
    }
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.ctx-mask {
    position: fixed;
    inset: 0;
    z-index: 300;
}

.ctx-menu {
    position: fixed;
    min-width: 200px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-bg);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
}

.ctx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-size: var(--tab-font-size);
    text-align: left;
    cursor: pointer;
}

.ctx-item:hover:not(:disabled) {
    background: var(--selected);
    color: var(--accent);
}

.ctx-item:disabled,
.ctx-item.disabled {
    opacity: 0.4;
    cursor: default;
}

.ctx-label {
    flex: 1 1 auto;
    min-width: 0;
}

.ctx-shortcut {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: 0.92em;
}

.ctx-sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
}
</style>
