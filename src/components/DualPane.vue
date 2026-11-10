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

const MIN_RATIO = 0.12;  // 单边至少占 12%，以防完全被挤压
const MAX_RATIO = 0.88;

const panes = usePanesStore();
const root = ref(null);

function clampRatio(r) {
    if (!Number.isFinite(r)) return 0.5;
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

function startDrag(event) {
    if (event.button !== 0 || !root.value) return;
    event.preventDefault();
    document.body.classList.add('is-resizing');

    let lastRatio = Number(panes.ratio) || 0.5;

    const onMove = (ev) => {
        const rect = root.value.getBoundingClientRect();
        if (!rect.width) return;
        const next = clampRatio((ev.clientX - rect.left) / rect.width);
        if (Math.abs(next - lastRatio) > 0.0008) {
            // 直接写 ratio ref：绕过 setRatio 里的 clamp 重算和 watch 持久化开销，
            // onMove 高频调用，session 持久化留到 onUp 一次性触发
            panes.ratio = next;
            lastRatio = next;
        }
    };
    const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('is-resizing');
        // 收尾：通过公共 setter 再 clamp 一次，并触发 session 持久化
        panes.setRatio(lastRatio);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
}

function resetRatio() {
    panes.setRatio(0.5);
}

onBeforeUnmount(() => {
    document.body.classList.remove('is-resizing');
});
onMounted(() => {
    // 比例初始化为 0.5，若之前已持久化（session.json）则读取
    if (!Number.isFinite(panes.ratio) || panes.ratio <= 0) {
        panes.setRatio(0.5);
    }
});
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
    /* 关键：width:0 + min-width:0 允许 flex 按比例压缩，
       不会被内部长文本撑宽 */
    width: 0;
    min-width: 0;
    box-sizing: border-box;
}

.dual-pane > :deep(.pane:first-child) {
    flex: 0 0 auto;  /* flex-basis 由内联 style 决定 */
}

.dual-pane > :deep(.pane:last-child) {
    flex: 1 1 0;     /* 填满剩余空间，basis=0 避免内容影响 */
}

.divider {
    flex: 0 0 6px;
    position: relative;
    cursor: col-resize;
    user-select: none;
    touch-action: none;
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

:global(body.is-resizing) {
    cursor: col-resize;
}
</style>
