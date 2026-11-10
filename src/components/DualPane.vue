<template>
    <div ref="root" class="dual-pane">
        <PaneView
            pane="left"
            :style="{ flexBasis: `${panes.ratio * 100}%` }"
        />
        <div
            class="divider"
            @pointerdown="startDrag"
            @dblclick="resetRatio"
        ></div>
        <PaneView pane="right" />
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PaneView from './PaneView.vue';
import { usePanesStore } from '@/stores/panes';

const panes = usePanesStore();
const root = ref(null);

function startDrag(event) {
    if (event.button !== 0 || !root.value) return;
    event.preventDefault();
    const rect = root.value.getBoundingClientRect();
    document.body.classList.add('is-resizing');

    const onMove = (ev) => {
        if (!rect.width) return;
        panes.setRatio((ev.clientX - rect.left) / rect.width);
    };
    const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('is-resizing');
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
}

function resetRatio() {
    panes.setRatio(0.5);
}

function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function onKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    if (isEditable(event.target)) return;

    if (event.key === 'Tab') {
        event.preventDefault();
        panes.togglePane();
        return;
    }
    if (event.altKey && (event.key === '1' || event.key === '2')) {
        event.preventDefault();
        panes.activatePane(event.key === '1' ? 'left' : 'right');
    }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.dual-pane {
    display: flex;
    height: 100%;
    padding: 8px;
    gap: 0;
    background: var(--canvas-bg);
    overflow: hidden;
}

.dual-pane > :deep(.pane) {
    flex: 0 1 auto;
    min-width: 320px;
}

.dual-pane > :deep(.pane:last-child) {
    flex: 1 1 auto;
}

.divider {
    flex: 0 0 6px;
    position: relative;
    cursor: col-resize;
}

.divider::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 36px;
    transform: translate(-50%, -50%);
    border-radius: 1px;
    background: transparent;
    transition: background 120ms ease;
}

.divider:hover::after,
:global(body.is-resizing) .divider::after {
    background: var(--accent);
}
</style>
