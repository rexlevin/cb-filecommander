<template>
    <div class="shortcut-list">
        <section v-for="group in groups" :key="group.title" class="shortcut-group">
            <h3 class="shortcut-title">{{ t(group.title) }}</h3>
            <div v-for="item in group.items" :key="`${item.keys}-${item.label}`" class="shortcut-row">
                <span class="shortcut-keys">
                    <template v-for="(key, index) in splitKeys(item.keys)" :key="key">
                        <span v-if="index > 0" class="shortcut-or">/</span>
                        <kbd>{{ key }}</kbd>
                    </template>
                </span>
                <span class="shortcut-label">{{ t(item.label) }}</span>
            </div>
        </section>
    </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { SHORTCUT_GROUPS, splitKeys } from '@/utils/shortcuts';

defineProps({
    groups: { type: Array, default: () => SHORTCUT_GROUPS }
});

const { t } = useI18n();
</script>

<style scoped>
.shortcut-list {
    column-count: 2;
    column-gap: 32px;
    padding: 4px 0 8px;
}

.shortcut-group {
    break-inside: avoid;
    padding-bottom: 10px;
}

.shortcut-title {
    margin: 8px 0 6px;
    color: var(--text-secondary);
    font-size: 0.85em;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.shortcut-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 0;
    font-size: 0.92em;
}

.shortcut-keys {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    flex-wrap: wrap;
    min-width: 130px;
}

.shortcut-or {
    color: var(--text-secondary);
    font-size: 0.85em;
}

kbd {
    display: inline-block;
    min-width: 18px;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--kbd-bg);
    color: var(--text);
    font-family: inherit;
    font-size: 0.85em;
    line-height: 1.45;
    text-align: center;
    white-space: nowrap;
}

.shortcut-label {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--text-secondary);
}
</style>
