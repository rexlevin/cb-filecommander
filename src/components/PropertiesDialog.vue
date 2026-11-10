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
                    <span class="prop-value">{{ formatSize(totalSize) }}</span>
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
import { computed, ref, watch } from 'vue';
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
const totalSize = ref(0);
const commonParent = ref('');
let loadSeq = 0;

const paths = computed(() => (ui.properties && ui.properties.paths) || []);

function sizeText(item) {
    if (item.kind === 'dir') return t('props.dirSize');
    return `${formatSize(item.size)} (${item.size} ${t('props.bytes')})`;
}

function close() {
    ui.closeProperties();
}

async function load() {
    const seq = ++loadSeq;
    loading.value = true;
    errorCode.value = null;
    const res = await api.properties({ paths: paths.value });
    if (seq !== loadSeq) return;
    loading.value = false;
    if (!res || !res.ok) {
        errorCode.value = (res && res.error) || 'UNKNOWN';
        return;
    }
    items.value = res.items || [];
    totalSize.value = res.totalSize || 0;
    commonParent.value = res.commonParent || '';
}

watch(paths, load, { immediate: true });
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
