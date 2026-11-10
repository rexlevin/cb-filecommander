import { defineStore } from 'pinia';
import { markRaw, reactive } from 'vue';
import { usePanesStore } from './panes';
import { useSettingsStore } from './settings';
import { isDirEntry } from '@/utils/sort';
import { parentDir } from '@/utils/path';

const api = window.filecommander;

/** 渲染层图标缓存：path → dataUrl，跨标签页/会话共享 */
const ICON_DATAURL_CACHE = new Map();

/**
 * 向主进程批量请求系统原生图标，按 kind+ext 去重后写入 entry.icon。
 * 渲染层先以自绘 SVG 占位（entry.icon = null），拿到后异步替换。
 */
async function requestIcons(state) {
    if (!state || !state.entries.length) return;
    const toFetch = [];
    for (const entry of state.entries) {
        if (entry.icon) continue;                              // 已有（从主进程缓存命中后写回的）
        if (ICON_DATAURL_CACHE.has(entry.path)) {
            entry.icon = ICON_DATAURL_CACHE.get(entry.path);   // 渲染层本地缓存命中
            continue;
        }
        toFetch.push({ path: entry.path, kind: entry.kind });
    }
    if (!toFetch.length) return;

    try {
        const map = await api.getFileIcons(toFetch);
        if (!map) return;
        for (const entry of state.entries) {
            if (map[entry.path] !== undefined) {
                entry.icon = map[entry.path];
                ICON_DATAURL_CACHE.set(entry.path, map[entry.path]);
            }
        }
    } catch (err) {
        // 主进程不支持或失败——保持 null，渲染层 fallback 自绘 SVG
    }
}

/**
 * 每个标签的运行时列表状态。
 * 只持久化标签目录（panes/session），排序、选择、历史均留在内存。
 */
function createState() {
    return {
        dir: '',
        entries: [],
        index: markRaw(new Map()),
        loading: false,
        loaded: false,
        error: null,
        token: 0,
        seq: 0,
        selected: new Set(),
        focusedPath: null,
        anchorPath: null,
        sort: { by: 'name', desc: false },
        history: [],
        historyIndex: -1,
        freeSpace: null,
        lastLoadedAt: 0
    };
}

function pushHistory(state, dir) {
    if (state.history[state.historyIndex] === dir) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(dir);
    state.historyIndex = state.history.length - 1;
}

export const useListingsStore = defineStore('listings', () => {
    const tabs = reactive({});

    function ensure(tabId) {
        if (!tabs[tabId]) tabs[tabId] = createState();
        return tabs[tabId];
    }

    function applyStats(payload) {
        if (!payload || !Array.isArray(payload.entries) || !payload.entries.length) return;
        for (const state of Object.values(tabs)) {
            if (state.dir !== payload.dir) continue;
            if (state.token && payload.token && state.token !== payload.token) continue;
            if (!state.token && payload.token) state.token = payload.token;
            for (const stat of payload.entries) {
                const index = state.index.get(stat.name);
                if (index === undefined) continue;
                Object.assign(state.entries[index], stat);
            }
        }
    }

    api.onDirStats(applyStats);

    async function loadFreeSpace(state, dir) {
        const res = await api.freeSpace(dir);
        if (state.dir === dir && res && res.ok) {
            state.freeSpace = { free: res.free, total: res.total };
        }
    }

    /**
     * @param {'push'|'history'|'refresh'|'init'} mode
     */
    async function openDir(pane, tabId, dir, { mode = 'push' } = {}) {
        if (!dir) return;
        const state = ensure(tabId);
        if (mode === 'refresh' && state.loading) return;

        const previousSelection = mode === 'refresh' ? state.selected : null;
        const previousFocus = mode === 'refresh' ? state.focusedPath : null;

        if (state.token) api.listCancel({ token: state.token });

        state.seq += 1;
        const seq = state.seq;
        state.dir = dir;
        state.loading = true;
        state.loaded = false;
        state.error = null;
        state.token = 0;

        if (mode !== 'refresh') {
            state.entries = [];
            state.index = markRaw(new Map());
            state.selected = new Set();
            state.focusedPath = null;
            state.anchorPath = null;
        }

        let res;
        try {
            res = await api.listDir({ dir, showHidden: useSettingsStore().showHidden });
        } catch (error) {
            res = { ok: false, error: 'UNKNOWN' };
        }

        if (seq !== state.seq) return;
        state.loading = false;

        if (!res || !res.ok) {
            state.error = (res && res.error) || 'UNKNOWN';
            return;
        }

        state.token = res.token;
        state.entries = res.entries || [];
        const index = new Map();
        state.entries.forEach((entry, i) => {
            entry.icon = null;   // 先占位，图标拿到后异步更新
            index.set(entry.name, i);
        });
        state.index = markRaw(index);
        state.loaded = true;
        state.lastLoadedAt = Date.now();

        // 异步拉取系统原生文件图标
        requestIcons(state);

        if (mode === 'refresh') {
            const paths = new Set(state.entries.map((entry) => entry.path));
            state.selected = new Set([...previousSelection].filter((path) => paths.has(path)));
            state.focusedPath = previousFocus && paths.has(previousFocus)
                ? previousFocus
                : (state.selected.values().next().value || null);
            state.anchorPath = state.focusedPath;
        } else {
            if (mode === 'push') pushHistory(state, dir);
            else if (mode === 'init' && !state.history.length) {
                state.history = [dir];
                state.historyIndex = 0;
            }
            usePanesStore().setTabDir(pane, tabId, dir);
        }

        loadFreeSpace(state, dir);
    }

    function ensureLoaded(pane, tabId, dir) {
        const state = ensure(tabId);
        if (!dir) return;
        if (state.dir === dir && (state.loading || state.loaded || state.error)) return;
        if (!state.history.length) openDir(pane, tabId, dir, { mode: 'init' });
        else openDir(pane, tabId, dir, { mode: state.dir === dir ? 'refresh' : 'push' });
    }

    function refresh(pane, tabId) {
        const state = ensure(tabId);
        if (state.dir) openDir(pane, tabId, state.dir, { mode: 'refresh' });
    }

    function navigate(pane, tabId, dir) {
        openDir(pane, tabId, dir, { mode: 'push' });
    }

    function up(pane, tabId) {
        const state = ensure(tabId);
        if (!state.dir) return;
        const parent = parentDir(state.dir);
        if (parent && parent !== state.dir) openDir(pane, tabId, parent, { mode: 'push' });
    }

    function back(pane, tabId) {
        const state = ensure(tabId);
        if (state.historyIndex <= 0) return;
        state.historyIndex -= 1;
        openDir(pane, tabId, state.history[state.historyIndex], { mode: 'history' });
    }

    function forward(pane, tabId) {
        const state = ensure(tabId);
        if (state.historyIndex >= state.history.length - 1) return;
        state.historyIndex += 1;
        openDir(pane, tabId, state.history[state.historyIndex], { mode: 'history' });
    }

    function setSort(tabId, by) {
        const state = ensure(tabId);
        if (state.sort.by === by) state.sort.desc = !state.sort.desc;
        else {
            state.sort.by = by;
            state.sort.desc = false;
        }
    }

    function setFocus(tabId, path) {
        const state = ensure(tabId);
        state.focusedPath = path;
    }

    function selectOnly(tabId, path) {
        const state = ensure(tabId);
        state.selected = new Set([path]);
        state.focusedPath = path;
        state.anchorPath = path;
    }

    function toggleSelection(tabId, path) {
        const state = ensure(tabId);
        const next = new Set(state.selected);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        state.selected = next;
        state.focusedPath = path;
        state.anchorPath = path;
    }

    function extendSelection(tabId, path, orderedEntries) {
        const state = ensure(tabId);
        const anchor = state.anchorPath || state.focusedPath;
        const from = orderedEntries.findIndex((entry) => entry.path === anchor);
        const to = orderedEntries.findIndex((entry) => entry.path === path);
        if (to === -1) return;
        if (from === -1) {
            selectOnly(tabId, path);
            return;
        }
        const [start, end] = from <= to ? [from, to] : [to, from];
        state.selected = new Set(orderedEntries.slice(start, end + 1).map((entry) => entry.path));
        state.focusedPath = path;
    }

    function selectAll(tabId) {
        const state = ensure(tabId);
        state.selected = new Set(state.entries.map((entry) => entry.path));
        state.anchorPath = state.focusedPath;
    }

    function clearSelection(tabId) {
        const state = ensure(tabId);
        state.selected = new Set();
        state.focusedPath = null;
        state.anchorPath = null;
    }

    async function open(pane, tabId, entry) {
        if (!entry) return { ok: false, error: 'EINVAL' };
        if (isDirEntry(entry)) {
            await openDir(pane, tabId, entry.path, { mode: 'push' });
            return { ok: true };
        }
        return api.openPath(entry.path);
    }

    async function openFocused(pane, tabId) {
        const state = ensure(tabId);
        // 多选时只允许刷新焦点项，不触发打开
        if (state.selected.size > 1) return { ok: false, error: 'MULTI_SELECTED' };
        const path = state.focusedPath || (state.selected.size === 1 ? state.selected.values().next().value : null);
        const entry = state.entries.find((item) => item.path === path);
        if (!entry) return { ok: false, error: 'EINVAL' };
        return open(pane, tabId, entry);
    }

    return {
        tabs, ensure, openDir, ensureLoaded, refresh, navigate, up, back, forward,
        setSort, setFocus, selectOnly, toggleSelection, extendSelection,
        selectAll, clearSelection, open, openFocused
    };
});
