<template>
    <div class="status-strip">
        <span>{{ t('status.items', { count: st.entries.length }) }}</span>
        <template v-if="st.selected.size">
            <span class="sep">·</span>
            <span>{{ t('status.selected', { count: st.selected.size }) }}</span>
            <span>{{ formatSize(selectedSize) }}</span>
        </template>
        <span class="spacer"></span>
        <span v-if="st.freeSpace">{{ t('status.free', { size: formatSize(st.freeSpace.free) }) }}</span>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';
import { formatSize } from '@/utils/format';

const props = defineProps({
    pane: { type: String, required: true }
});

const { t } = useI18n();
const panes = usePanesStore();
const listings = useListingsStore();

const tab = computed(() => panes.activeTab(props.pane));
const st = computed(() => listings.ensure(tab.value.id));

const selectedSize = computed(() => {
    let total = 0;
    for (const entry of st.value.entries) {
        if (!st.value.selected.has(entry.path)) continue;
        if (entry.kind === 'dir' || (entry.kind === 'link' && entry.linkTarget === 'dir')) continue;
        total += entry.size || 0;
    }
    return total;
});
</script>

<style scoped>
.status-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 var(--status-height);
    height: var(--status-height);
    padding: 0 10px;
    border-top: 1px solid var(--border);
    background: var(--panel-head);
    color: var(--text-secondary);
    font-family: var(--status-font-family);
    font-size: var(--status-font-size);
    overflow: hidden;
    white-space: nowrap;
}

.sep {
    opacity: 0.6;
}

.spacer {
    flex: 1 1 auto;
}
</style>
