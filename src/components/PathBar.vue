<template>
    <div class="path-bar" :class="{ 'is-active-pane': panes.activePane === pane }">
        <div class="nav-buttons">
            <button class="nav-button" :disabled="!canBack" :title="t('path.back')" @click="goBack">◀</button>
            <button class="nav-button" :disabled="!canForward" :title="t('path.forward')" @click="goForward">▶</button>
            <button class="nav-button" :disabled="!canUp" :title="t('path.up')" @click="goUp">▲</button>
            <button class="nav-button" :title="t('path.places')" @click.stop="togglePlaces">⌂</button>
        </div>

        <div v-if="editing" class="path-edit">
            <input
                ref="inputRef"
                v-model="draft"
                class="path-input"
                :class="{ 'has-error': !!error }"
                spellcheck="false"
                @keydown.enter.prevent="submit"
                @keydown.esc.prevent="cancel"
                @blur="onBlur"
            />
            <div v-if="error" class="path-error">{{ error }}</div>
        </div>

        <div v-else class="breadcrumbs" :title="st.dir" @click="onBreadcrumbClick">
            <template v-for="(seg, index) in crumbs" :key="seg.path">
                <span v-if="index > 0" class="crumb-sep">{{ separator }}</span>
                <button class="crumb" @click.stop="go(seg.path)">{{ seg.label }}</button>
            </template>
            <span class="crumb-fill"></span>
        </div>

        <div v-if="placesOpen" class="places-menu" @click.stop>
            <div v-for="group in groups" :key="group.title" class="places-group">
                <div class="places-title">{{ group.title }}</div>
                <button
                    v-for="item in group.items"
                    :key="item.path"
                    class="places-item"
                    :title="item.path"
                    @click="choosePlace(item.path)"
                >
                    <AppIcon class="places-icon" :name="item.icon" :size="15" />
                    <span class="places-label">{{ item.label }}</span>
                    <span class="places-path">{{ item.path }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';
import { useSettingsStore } from '@/stores/settings';
import AppIcon from './AppIcon.vue';
import { isRoot, segments } from '@/utils/path';
import { placeIcon } from '@/utils/icons';

const props = defineProps({
    pane: { type: String, required: true }
});

const api = window.filecommander;
const { t, te } = useI18n();
const panes = usePanesStore();
const listings = useListingsStore();
const settings = useSettingsStore();

const editing = ref(false);
const submitting = ref(false);
const draft = ref('');
const error = ref('');
const inputRef = ref(null);
const placesOpen = ref(false);
const placeData = ref({
    home: settings.home,
    places: [{ key: 'home', path: settings.home }],
    roots: [{ key: 'root', path: '/' }],
    mounts: []
});

const tab = computed(() => panes.activeTab(props.pane));
const tabId = computed(() => tab.value.id);
const st = computed(() => listings.ensure(tabId.value));
const crumbs = computed(() => segments(st.value.dir));
const separator = computed(() => settings.platform === 'win32' ? '\\' : '/');

const canBack = computed(() => st.value.historyIndex > 0);
const canForward = computed(() => st.value.historyIndex >= 0
    && st.value.historyIndex < st.value.history.length - 1);
const canUp = computed(() => !!st.value.dir && !isRoot(st.value.dir));

const groups = computed(() => {
    const result = [];
    if (placeData.value.places.length) {
        result.push({
            title: t('path.placesTitle'),
            items: placeData.value.places.map((place) => ({
                label: placeLabel(place.key),
                path: place.path,
                icon: placeIcon(place.key)
            }))
        });
    }
    if (placeData.value.roots.length) {
        result.push({
            title: t('path.rootsTitle'),
            items: placeData.value.roots.map((root) => ({
                label: root.label || root.path,
                path: root.path,
                icon: placeIcon(root.key || 'drive')
            }))
        });
    }
    if (placeData.value.mounts.length) {
        result.push({
            title: t('path.mountsTitle'),
            items: placeData.value.mounts.map((mount) => ({
                label: mount.label || mount.path,
                path: mount.path,
                icon: 'drive'
            }))
        });
    }
    return result;
});

function placeLabel(key) {
    const keys = {
        home: 'path.placeHome',
        desktop: 'path.placeDesktop',
        documents: 'path.placeDocuments',
        downloads: 'path.placeDownloads'
    };
    return t(keys[key] || 'path.placeHome');
}

function go(dir) {
    placesOpen.value = false;
    listings.navigate(props.pane, tabId.value, dir);
}

function goBack() {
    listings.back(props.pane, tabId.value);
}

function goForward() {
    listings.forward(props.pane, tabId.value);
}

function goUp() {
    listings.up(props.pane, tabId.value);
}

function startEdit() {
    if (editing.value) return;
    placesOpen.value = false;
    draft.value = st.value.dir;
    error.value = '';
    editing.value = true;
    nextTick(() => {
        if (!inputRef.value) return;
        inputRef.value.focus();
        inputRef.value.select();
    });
}

function cancel() {
    editing.value = false;
    error.value = '';
}

function onBlur() {
    if (!submitting.value) cancel();
}

async function submit() {
    const value = draft.value.trim();
    if (!value) return;
    submitting.value = true;
    const res = await api.pathExpand({ input: value, baseDir: st.value.dir });
    submitting.value = false;
    if (res && res.ok) {
        editing.value = false;
        error.value = '';
        listings.navigate(props.pane, tabId.value, res.path);
        return;
    }
    const key = `errors.${(res && res.error) || 'UNKNOWN'}`;
    error.value = te(key) ? t(key) : t('errors.UNKNOWN');
}

function onBreadcrumbClick(event) {
    if (event.target === event.currentTarget || event.target.classList.contains('crumb-fill')) {
        startEdit();
    }
}

function togglePlaces() {
    if (editing.value) return;
    placesOpen.value = !placesOpen.value;
}

function choosePlace(dir) {
    go(dir);
}

function closePlaces() {
    placesOpen.value = false;
}

watch(() => panes.pathFocusTick, () => {
    if (panes.pathFocusPane === props.pane) startEdit();
});

watch(() => st.value.dir, () => {
    if (placesOpen.value) placesOpen.value = false;
});

onMounted(async () => {
    document.addEventListener('click', closePlaces);
    const res = await api.placesList();
    if (res && res.ok) {
        placeData.value = res;
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('click', closePlaces);
});
</script>

<style scoped>
.path-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--path-height);
    flex: 0 0 var(--path-height);
    padding: 0 8px;
    background: var(--panel-bg);
    border-bottom: 1px solid var(--border);
}

/* 活动面板的地址栏使用强调色淡底，强化聚焦标识 */
.path-bar.is-active-pane {
    background: var(--selected);
}

.nav-buttons {
    display: flex;
    flex: 0 0 auto;
    gap: 2px;
}

.nav-button {
    width: 24px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--tab-font-size);
    cursor: pointer;
}

.nav-button:hover:not(:disabled) {
    background: var(--hover-bg);
    color: var(--text);
}

.nav-button:disabled {
    opacity: 0.35;
    cursor: default;
}

.breadcrumbs {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    height: 24px;
    overflow: hidden;
}

.crumb {
    flex: 0 0 auto;
    max-width: 40%;
    padding: 2px 6px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-size: var(--tab-font-size);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.crumb:hover {
    background: var(--hover-bg);
}

.crumb-sep {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: var(--tab-font-size);
}

.crumb-fill {
    flex: 1 1 auto;
    align-self: stretch;
    min-width: 12px;
    cursor: text;
}

.path-edit {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
}

.path-input {
    width: 100%;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    outline: none;
    background: var(--panel-bg);
    color: var(--text);
    font-family: inherit;
    font-size: var(--tab-font-size);
}

.path-input.has-error {
    border-color: var(--danger);
}

.path-error {
    position: absolute;
    top: 26px;
    left: 0;
    z-index: 20;
    padding: 4px 8px;
    border: 1px solid var(--danger);
    border-radius: 4px;
    background: var(--panel-bg);
    color: var(--danger);
    font-size: var(--tab-font-size);
    white-space: nowrap;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
}

.places-menu {
    position: absolute;
    top: calc(var(--path-height) + 2px);
    left: 8px;
    z-index: 30;
    width: 300px;
    max-height: 360px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-bg);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
}

.places-group + .places-group {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
}

.places-title {
    padding: 2px 6px 4px;
    color: var(--text-secondary);
    font-size: var(--tab-font-size);
}

.places-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-size: var(--tab-font-size);
    text-align: left;
    cursor: pointer;
}

.places-item:hover {
    background: var(--selected);
}

.places-icon {
    color: var(--icon-folder);
}

.places-label {
    flex: 0 0 auto;
}

.places-path {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
    font-size: var(--tab-font-size);
}
</style>
