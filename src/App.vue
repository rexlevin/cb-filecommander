<template>
    <DualPane />
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue';
import DualPane from '@/components/DualPane.vue';
import { usePanesStore } from '@/stores/panes';
import { useSessionStore } from '@/stores/session';

const panes = usePanesStore();
const session = useSessionStore();

let offMenuAction = null;

function saveSession() {
    session.persist(panes.snapshot());
}

function flushSession() {
    session.persistNow(panes.snapshot());
}

function handleMenuAction(payload) {
    const action = payload && payload.action;
    switch (action) {
        case 'tab.new':
            panes.addTab(panes.activePane);
            break;
        case 'tab.close':
            panes.closeActiveTab(panes.activePane);
            break;
        case 'pane.switch':
            panes.togglePane();
            break;
        case 'pane.focusLeft':
            panes.activatePane('left');
            break;
        case 'pane.focusRight':
            panes.activatePane('right');
            break;
        default:
            break;
    }
}

watch(
    () => [panes.state, panes.ratio, panes.activePane],
    saveSession,
    { deep: true }
);

onMounted(() => {
    offMenuAction = window.filecommander.onMenuAction(handleMenuAction);
    window.addEventListener('beforeunload', flushSession);
});

onBeforeUnmount(() => {
    if (offMenuAction) offMenuAction();
    window.removeEventListener('beforeunload', flushSession);
});
</script>
