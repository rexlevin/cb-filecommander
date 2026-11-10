<template>
    <div class="file-list">
        <div class="list-header" :style="gridStyle">
            <span>{{ t('list.name') }}</span>
            <span class="align-right">{{ t('list.size') }}</span>
            <span>{{ t('list.mtime') }}</span>
            <span>{{ t('list.type') }}</span>
        </div>
        <div class="list-body">
            <div class="empty-state">{{ t('list.empty') }}</div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';

defineProps({
    dir: { type: String, default: '' }
});

const { t } = useI18n();
const settings = useSettingsStore();

const gridStyle = computed(() => ({
    gridTemplateColumns: `minmax(200px, 1fr) ${settings.columns.size}px ${settings.columns.mtime}px ${settings.columns.type}px`
}));
</script>

<style scoped>
.file-list {
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

.list-header > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.list-header > span:nth-child(2),
.list-header > span:nth-child(3) {
    padding-right: 12px;
}

.align-right {
    text-align: right;
}

.list-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}

.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-size: 12px;
}
</style>
