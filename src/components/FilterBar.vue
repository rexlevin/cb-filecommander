<template>
    <div class="filter-bar" v-if="visible">
        <span class="filter-icon">⌕</span>
        <input
            ref="inputRef"
            v-model="draft"
            class="filter-input"
            :placeholder="t('filter.placeholder')"
            spellcheck="false"
            @input="onInput"
            @keydown.esc.prevent="close"
            @keydown.enter.prevent="close"
        />
        <button
            v-if="draft"
            class="filter-clear"
            :title="t('filter.clear')"
            @click="clear"
        >×</button>
        <span v-if="!draft" class="filter-hint">{{ t('filter.hint') }}</span>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';

const props = defineProps({
    pane: { type: String, required: true }
});

const { t } = useI18n();
const panes = usePanesStore();
const listings = useListingsStore();

const tab = computed(() => panes.activeTab(props.pane));
const tabId = computed(() => tab.value.id);
const st = computed(() => listings.ensure(tabId.value));

// 只在本面板被请求聚焦筛选时显示
const visible = ref(false);
const draft = ref('');
const inputRef = ref(null);
let debounceTimer = null;

watch(() => panes.filterFocusTick, () => {
    if (panes.filterFocusPane === props.pane) open();
});

watch(tabId, () => {
    // 切换标签时同步草稿
    draft.value = st.value.filter || '';
});

function open() {
    visible.value = true;
    draft.value = st.value.filter || '';
    nextTick(() => {
        const el = Array.isArray(inputRef.value) ? inputRef.value[0] : inputRef.value;
        if (el) {
            el.focus();
            el.select();
        }
    });
}

function close() {
    visible.value = false;
}

function clear() {
    draft.value = '';
    apply('');
}

function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    const value = draft.value;
    debounceTimer = setTimeout(() => apply(value), 100);
}

function apply(value) {
    listings.setFilter(tabId.value, value);
}

onBeforeUnmount(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style scoped>
.filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    flex: 0 0 30px;
    padding: 0 10px;
    background: var(--panel-head);
    border-bottom: 1px solid var(--border);
}

.filter-icon {
    color: var(--text-secondary);
    font-size: 14px;
}

.filter-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel-bg);
    color: var(--text);
    font-size: var(--tab-font-size);
    outline: none;
}

.filter-input:focus {
    border-color: var(--accent);
}

.filter-clear {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
}

.filter-clear:hover {
    background: var(--hover-bg);
    color: var(--text);
}

.filter-hint {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: var(--status-font-size);
}
</style>
