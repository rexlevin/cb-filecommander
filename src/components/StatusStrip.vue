<template>
    <div class="status-strip">
        <span>{{ t('status.items') }}</span>
        <span class="sep">·</span>
        <span>{{ t('status.selected') }}</span>
    </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
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
    font-size: 11px;
}

.sep {
    opacity: 0.6;
}
</style>
