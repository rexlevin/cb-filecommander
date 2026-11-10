<template>
    <div class="tab-bar" :class="{ 'is-active-pane': panes.activePane === pane }">
        <div class="tabs">
            <div
                v-for="item in tabs"
                :key="item.id"
                class="tab"
                :class="{ active: item.id === activeTabId }"
                :title="item.dir"
                @click="panes.activateTab(pane, item.id)"
            >
                <span class="tab-title">{{ baseName(item.dir) }}</span>
                <button
                    v-if="tabs.length > 1"
                    class="tab-close"
                    :title="t('tab.close')"
                    @click.stop="panes.closeTab(pane, item.id)"
                >×</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanesStore } from '@/stores/panes';
import { baseName } from '@/utils/path';

const props = defineProps({
    pane: { type: String, required: true }
});

const panes = usePanesStore();
const { t } = useI18n();

const tabs = computed(() => panes.state[props.pane].tabs);
const activeTabId = computed(() => panes.state[props.pane].activeTabId);
</script>

<style scoped>
.tab-bar {
    display: flex;
    align-items: stretch;
    height: var(--tab-height);
    flex: 0 0 var(--tab-height);
    background: var(--panel-head);
    border-bottom: 1px solid var(--border);
}

.tabs {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
}

/* 标签宽度平均分配所在面板宽度（与 Total Commander 一致） */
.tab {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    border-right: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: default;
}

.tab.active {
    background: var(--panel-bg);
    color: var(--text);
}

/* 活动面板的当前标签顶部显示强调色上边线 */
.tab-bar.is-active-pane .tab.active {
    box-shadow: inset 0 2px 0 var(--accent);
}

.tab-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tab-close {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 14px;
    opacity: 0;
    cursor: pointer;
    transition: opacity 120ms ease;
}

.tab:hover .tab-close {
    opacity: 1;
}

.tab-close:hover {
    background: var(--hover-bg);
    color: var(--text);
}
</style>
