<template>
    <teleport to="body">
        <div class="modal-mask" @pointerdown.self="emit('close')">
            <div
                ref="panelRef"
                class="modal"
                :class="{ wide }"
                role="dialog"
                aria-modal="true"
                tabindex="-1"
            >
                <header class="modal-head">
                    <span class="modal-title">{{ title }}</span>
                    <button class="modal-close" :title="closeLabel" @click="emit('close')">×</button>
                </header>
                <div class="modal-body">
                    <slot />
                </div>
                <footer v-if="$slots.footer" class="modal-foot">
                    <slot name="footer" />
                </footer>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
    title: { type: String, default: '' },
    closeLabel: { type: String, default: 'Close' },
    wide: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);
const panelRef = ref(null);

function onKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    emit('close');
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown, true);
    if (panelRef.value) panelRef.value.focus();
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.modal-mask {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--overlay);
}

.modal {
    display: flex;
    flex-direction: column;
    width: 640px;
    max-width: 100%;
    height: min(680px, 86vh);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel-bg);
    color: var(--text);
    font-family: var(--dialog-font-family);
    font-size: var(--dialog-font-size);
    box-shadow: var(--dialog-shadow);
    outline: none;
    overflow: hidden;
}

.modal.wide {
    width: 872px;
}

.modal-head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    height: 44px;
    padding: 0 8px 0 16px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-head);
}

.modal-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.08em;
    font-weight: 600;
}

.modal-close {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.38em;
    line-height: 1.4;
    cursor: pointer;
}

.modal-close:hover {
    background: var(--hover-bg);
    color: var(--text);
}

.modal-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}

.modal-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex: 0 0 auto;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    background: var(--panel-head);
    color: var(--text-secondary);
    font-size: 0.92em;
}
</style>
