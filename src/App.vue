<template>
    <DualPane />
    <SettingsDialog v-if="ui.settingsOpen" />
    <HelpDialog v-if="ui.helpOpen" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue';
import DualPane from '@/components/DualPane.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import HelpDialog from '@/components/HelpDialog.vue';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';

const api = window.filecommander;
const panes = usePanesStore();
const listings = useListingsStore();
const session = useSessionStore();
const settings = useSettingsStore();
const ui = useUiStore();

let offMenuAction = null;
let offDirChanged = null;

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
    if (ui.settingsOpen || ui.helpOpen) return;
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
        case 'view.refresh':
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
    if (ui.settingsOpen || ui.helpOpen) return;
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'F1') {
        event.preventDefault();
        ui.openHelp();
        return;
    }
    const editable = isEditable(event.target);
    const ctrl = event.ctrlKey || event.metaKey;
    const { pane, tab } = activeContext();
    if (!tab) return;

    if (ctrl && !event.altKey) {
        const key = event.key;
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
                if (!event.repeat) listings.refresh(pane, tab.id);
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
            default:
                return;
        }
    }

    if (editable) return;

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
    window.addEventListener('beforeunload', flushSession);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('keydown', onKeydown);
    // Ctrl+滚轮缩放：passive 必须 false 才能 preventDefault，用 capture 优先于其它 wheel 监听
    window.addEventListener('wheel', onWheelZoom, { capture: true, passive: false });
});

onBeforeUnmount(() => {
    if (offMenuAction) offMenuAction();
    if (offDirChanged) offDirChanged();
    window.removeEventListener('beforeunload', flushSession);
    window.removeEventListener('focus', onWindowFocus);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('wheel', onWheelZoom, { capture: true });
});
</script>
