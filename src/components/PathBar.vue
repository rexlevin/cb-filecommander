<template>
    <div class="path-bar">
        <div class="nav-buttons">
            <button class="nav-button" disabled :title="t('path.back')">◀</button>
            <button class="nav-button" disabled :title="t('path.forward')">▶</button>
            <button class="nav-button" disabled :title="t('path.up')">▲</button>
            <button class="nav-button" disabled :title="t('path.home')">⌂</button>
        </div>
        <div class="path-text" :title="dir">{{ dir }}</div>
    </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

defineProps({
    dir: { type: String, default: '' }
});

const { t } = useI18n();
</script>

<style scoped>
.path-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--path-height);
    flex: 0 0 var(--path-height);
    padding: 0 8px;
    background: var(--panel-bg);
    border-bottom: 1px solid var(--border);
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
    font-size: 11px;
    cursor: default;
    opacity: 0.4;
}

.path-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: 12px;
}
</style>
