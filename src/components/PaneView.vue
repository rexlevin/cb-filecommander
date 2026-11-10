<template>
    <section
        class="pane"
        @pointerdown="panes.activatePane(pane)"
    >
        <TabBar :pane="pane" />
        <PathBar :dir="tab.dir" />
        <FileList :dir="tab.dir" />
        <StatusStrip />
    </section>
</template>

<script setup>
import { computed } from 'vue';
import TabBar from './TabBar.vue';
import PathBar from './PathBar.vue';
import FileList from './FileList.vue';
import StatusStrip from './StatusStrip.vue';
import { usePanesStore } from '@/stores/panes';

const props = defineProps({
    pane: { type: String, required: true }
});

const panes = usePanesStore();
const tab = computed(() => panes.activeTab(props.pane));
</script>

<style scoped>
.pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
}
</style>
