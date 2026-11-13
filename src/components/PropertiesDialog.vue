<template>
    <AppModal :title="t('props.title')" :close-label="t('props.close')" compact @close="close">
        <div class="props-body">
            <div v-if="loading" class="props-loading">{{ t('props.loading') }}</div>
            <div v-else-if="errorCode" class="props-error">{{ errorText(errorCode, t, te) }}</div>

            <template v-else-if="items.length === 1">
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.name') }}</span>
                    <span class="prop-value">{{ items[0].name }}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.path') }}</span>
                    <span class="prop-value is-path">{{ items[0].path }}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.type') }}</span>
                    <span class="prop-value">{{ typeText(items[0], t) }}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.size') }}</span>
                    <span class="prop-value">{{ sizeText(items[0]) }}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.mtime') }}</span>
                    <span class="prop-value">{{ formatTime(items[0].mtime) }}</span>
                </div>
                <div v-if="items[0].mode" class="prop-row">
                    <span class="prop-label">{{ t('props.mode') }}</span>
                    <span class="prop-value is-mono">{{ items[0].mode }}</span>
                </div>
                <div v-if="items[0].linkTarget" class="prop-row">
                    <span class="prop-label">{{ t('props.linkTarget') }}</span>
                    <span class="prop-value">{{ items[0].linkTarget }}</span>
                </div>
            </template>

            <template v-else>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.count') }}</span>
                    <span class="prop-value">{{ t('props.countValue', { count: items.length }) }}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.totalSize') }}</span>
                    <span class="prop-value">{{ totalSizeText }}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">{{ t('props.commonParent') }}</span>
                    <span class="prop-value is-path">{{ commonParent }}</span>
                </div>
            </template>
        </div>
        <template #footer>
            <button class="btn" @click="close">{{ t('props.close') }}</button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useUiStore } from '@/stores/ui';
import { formatSize, formatTime, typeText, errorText } from '@/utils/format';

const api = window.filecommander;
const { t, te } = useI18n();
const ui = useUiStore();

const loading = ref(true);
const errorCode = ref(null);
const items = ref([]);
const baseTotal = ref(0);
const commonParent = ref('');
// 目录大小异步统计：path -> { size, done }
const dirStats = reactive({});
const computing = computed(() => Object.values(dirStats).some((stats) => !stats.done));
const displayTotal = computed(() => {
    let total = baseTotal.value;
    for (const stats of Object.values(dirStats)) total += stats.size || 0;
    return total;
});
const totalSizeText = computed(() => {
    if (!computing.value) return `${formatSize(displayTotal.value)} (${displayTotal.value} ${t('props.bytes')})`;
    return `${t('props.calculating')} ${formatSize(displayTotal.value)}`;
});
let loadSeq = 0;
let jobSeq = 0;
let jobId = '';
let unsubscribe = null;

const paths = computed(() => (ui.properties && ui.properties.paths) || []);

function sizeText(item) {
    if (typeof item.size === 'number') return `${formatSize(item.size)} (${item.size} ${t('props.bytes')})`;
    const stats = dirStats[item.path];
    if (stats) return `${t('props.calculating')} ${formatSize(stats.size)}`;
    return t('props.dirSize');
}

function stopSize() {
    if (jobId) {
        api.propsSizeCancel({ jobId });
        jobId = '';
    }
    for (const key of Object.keys(dirStats)) delete dirStats[key];
}

function onPropsSize(payload) {
    if (!payload || payload.jobId !== jobId || !payload.path) return;
    if (payload.cancelled) {
        delete dirStats[payload.path];
        return;
    }
    const size = typeof payload.size === 'number' ? payload.size : 0;
    dirStats[payload.path] = { size, done: !!payload.done };
    if (payload.done) {
        const item = items.value.find((entry) => entry.path === payload.path);
        if (item) item.size = size;
    }
}

async function requestDirSizes() {
    const dirPaths = items.value
        .filter((entry) => entry.kind === 'dir')
        .map((entry) => entry.path);
    if (!dirPaths.length) return;
    jobSeq += 1;
    const id = `props-${Date.now().toString(36)}-${jobSeq}`;
    jobId = id;
    try {
        const res = await api.propsSizeStart({ paths: dirPaths, jobId: id });
        if (!res || !res.ok) jobId = '';
    } catch (error) {
        jobId = '';
    }
}

function close() {
    ui.closeProperties();
}

async function load() {
    const seq = ++loadSeq;
    stopSize();
    loading.value = true;
    errorCode.value = null;
    let res = null;
    try {
        res = await api.properties({ paths: Array.from(paths.value || []).map(String) });
    } catch (error) {
        res = { ok: false, error: 'UNKNOWN' };
    }
    if (seq !== loadSeq) return;
    loading.value = false;
    if (!res || !res.ok) {
        errorCode.value = (res && res.error) || 'UNKNOWN';
        return;
    }
    items.value = res.items || [];
    baseTotal.value = res.totalSize || 0;
    commonParent.value = res.commonParent || '';
    requestDirSizes();
}

unsubscribe = api.onPropsSize(onPropsSize);
watch(paths, load, { immediate: true });
onBeforeUnmount(() => {
    if (unsubscribe) unsubscribe();
    stopSize();
});
</script>

<style scoped>
.props-body {
    padding: 14px 20px 18px;
    font-size: var(--dialog-font-size);
}

.props-loading,
.props-error {
    padding: 12px 0;
    color: var(--text-secondary);
}

.props-error {
    color: var(--danger);
}

.prop-row {
    display: flex;
    gap: 12px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
}

.prop-row:last-child {
    border-bottom: none;
}

.prop-label {
    flex: 0 0 78px;
    color: var(--text-secondary);
}

.prop-value {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
}

.prop-value.is-path {
    color: var(--text-secondary);
    word-break: break-all;
}

.prop-value.is-mono {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

.btn {
    min-width: 72px;
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel-bg);
    color: var(--text);
    font-size: var(--dialog-font-size);
    cursor: pointer;
}

.btn:hover {
    border-color: var(--accent);
    color: var(--accent);
}
</style>
