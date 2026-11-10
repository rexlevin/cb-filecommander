<template>
    <section
        class="pane"
        @pointerdown="panes.activatePane(pane)"
    >
        <TabBar :pane="pane" />
        <PathBar :pane="pane" />
        <FileList :pane="pane" />
        <StatusStrip :pane="pane" />
    </section>
</template>

<script setup>
import { computed, watch } from 'vue';
import TabBar from './TabBar.vue';
import PathBar from './PathBar.vue';
import FileList from './FileList.vue';
import StatusStrip from './StatusStrip.vue';
import { usePanesStore } from '@/stores/panes';
import { useListingsStore } from '@/stores/listings';

const props = defineProps({
    pane: { type: String, required: true }
});

const panes = usePanesStore();
const listings = useListingsStore();
const tab = computed(() => panes.activeTab(props.pane));

watch(
    () => [tab.value.id, tab.value.dir],
    ([id, dir]) => listings.ensureLoaded(props.pane, id, dir),
    { immediate: true }
);
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
