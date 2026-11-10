import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import { useSettingsStore } from './settings';

export const MAX_TABS = 7;

let tabSeq = 0;

function newTabId() {
    tabSeq += 1;
    return `tab-${Date.now().toString(36)}-${tabSeq}`;
}

function makePane() {
    const id = newTabId();
    return { tabs: [{ id, dir: '/' }], activeTabId: id };
}

function clampRatio(value) {
    const ratio = Number(value);
    if (!Number.isFinite(ratio)) return 0.5;
    return Math.min(0.8, Math.max(0.2, ratio));
}

export const usePanesStore = defineStore('panes', () => {
    const state = reactive({ left: makePane(), right: makePane() });
    const activePane = ref('left');
    const ratio = ref(0.5);

    function hydrate(session) {
        const home = useSettingsStore().home;
        for (const key of ['left', 'right']) {
            const src = session && session.panes ? session.panes[key] : null;
            const tabs = [];
            const usedIds = new Set();
            if (src && Array.isArray(src.tabs)) {
                for (const tab of src.tabs.slice(0, MAX_TABS)) {
                    if (!tab || typeof tab.dir !== 'string' || !tab.dir) continue;
                    const id = typeof tab.id === 'string' && tab.id && !usedIds.has(tab.id)
                        ? tab.id
                        : newTabId();
                    usedIds.add(id);
                    tabs.push({ id, dir: tab.dir });
                }
            }
            if (tabs.length === 0) {
                const id = newTabId();
                tabs.push({ id, dir: home });
            }
            state[key].tabs = tabs;
            state[key].activeTabId = tabs.some(tab => tab.id === (src && src.activeTabId))
                ? src.activeTabId
                : tabs[0].id;
        }
        ratio.value = clampRatio(session && session.ratio);
        activePane.value = session && session.activePane === 'right' ? 'right' : 'left';
    }

    function activeTab(pane) {
        const tabs = state[pane].tabs;
        return tabs.find(tab => tab.id === state[pane].activeTabId) || tabs[0];
    }

    function addTab(pane) {
        const tabs = state[pane].tabs;
        if (tabs.length >= MAX_TABS) return false;
        const dir = activeTab(pane) ? activeTab(pane).dir : useSettingsStore().home;
        const tab = { id: newTabId(), dir };
        tabs.push(tab);
        state[pane].activeTabId = tab.id;
        return true;
    }

    function closeTab(pane, id) {
        const tabs = state[pane].tabs;
        // 最后一个标签不可关闭
        if (tabs.length <= 1) return false;
        const index = tabs.findIndex(tab => tab.id === id);
        if (index === -1) return false;
        tabs.splice(index, 1);
        if (state[pane].activeTabId === id) {
            state[pane].activeTabId = tabs[Math.min(index, tabs.length - 1)].id;
        }
        return true;
    }

    function closeActiveTab(pane) {
        return closeTab(pane, state[pane].activeTabId);
    }

    function activateTab(pane, id) {
        if (state[pane].tabs.some(tab => tab.id === id)) {
            state[pane].activeTabId = id;
        }
    }

    function activatePane(pane) {
        activePane.value = pane;
    }

    function togglePane() {
        activePane.value = activePane.value === 'left' ? 'right' : 'left';
    }

    function setRatio(value) {
        ratio.value = clampRatio(value);
    }

    function snapshot() {
        return {
            panes: {
                left: {
                    tabs: state.left.tabs.map(tab => ({ id: tab.id, dir: tab.dir })),
                    activeTabId: state.left.activeTabId
                },
                right: {
                    tabs: state.right.tabs.map(tab => ({ id: tab.id, dir: tab.dir })),
                    activeTabId: state.right.activeTabId
                }
            },
            activePane: activePane.value,
            ratio: ratio.value
        };
    }

    return {
        state, activePane, ratio,
        hydrate, activeTab, addTab, closeTab, closeActiveTab, activateTab,
        activatePane, togglePane, setRatio, snapshot
    };
});
