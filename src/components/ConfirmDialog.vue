<template>
    <AppModal
        :title="confirm?.title || ''"
        :close-label="t('common.cancel')"
        compact
        @close="cancel"
    >
        <div class="confirm-body">
            <div class="confirm-message" :class="{ 'is-danger': confirm?.danger }">
                {{ confirm?.message }}
            </div>
        </div>
        <template #footer>
            <span class="spacer"></span>
            <button class="btn" @click="cancel">{{ confirm?.cancelLabel || t('common.cancel') }}</button>
            <button
                ref="okButtonRef"
                class="btn"
                :class="{ 'is-danger': confirm?.danger }"
                @click="confirmAction"
            >
                {{ confirm?.confirmLabel || t('common.ok') }}
            </button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useUiStore } from '@/stores/ui';

const { t } = useI18n();
const ui = useUiStore();
const confirm = computed(() => ui.confirm);
const okButtonRef = ref(null);

function cancel() {
    ui.closeConfirm(false);
}

function confirmAction() {
    ui.closeConfirm(true);
}

function onKeydown(event) {
    // Esc 交给 AppModal 处理
    if (event.key !== 'Enter') return;
    // 不在输入框/可编辑区上触发
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA'
        || (event.target && event.target.isContentEditable)) return;
    event.preventDefault();
    confirmAction();
}

onMounted(() => {
    // capture 阶段先于 App.vue 的冒泡监听器触发
    window.addEventListener('keydown', onKeydown, true);
    // 确保确认按钮有焦点，保持视觉反馈
    requestAnimationFrame(() => {
        const btn = Array.isArray(okButtonRef.value)
            ? okButtonRef.value[0]
            : okButtonRef.value;
        if (btn && typeof btn.focus === 'function') btn.focus();
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.confirm-body {
    padding: 22px 24px;
    font-size: var(--dialog-font-size);
    line-height: 1.55;
}

.confirm-message {
    white-space: pre-wrap;
    word-break: break-word;
}

.confirm-message.is-danger {
    color: var(--danger);
}

.spacer {
    flex: 1 1 auto;
}

.btn {
    min-width: 72px;
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel-bg);
    color: var(--text);
    font-size: var(--dialog-font-size);
    cursor: pointer;
}

.btn:hover {
    border-color: var(--accent);
    color: var(--accent);
}

.btn.is-danger:hover {
    border-color: var(--danger);
    color: var(--danger);
}
</style>
