<template>
    <AppModal :title="t('conflict.title')" :close-label="t('conflict.cancel')" compact @close="cancel">
        <div class="conflict-body">
            <div class="conflict-name" :title="conflict.source">{{ sourceName }}</div>
            <div class="conflict-desc">{{ kindText }}</div>
            <div class="conflict-target">
                <span class="label">{{ t('conflict.target') }}</span>
                <span class="path" :title="conflict.target">{{ conflict.target }}</span>
            </div>
        </div>
        <template #footer>
            <label class="apply-all">
                <input v-model="applyToAll" type="checkbox" />
                <span>{{ t('conflict.applyAll') }}</span>
            </label>
            <span class="spacer"></span>
            <button ref="cancelRef" class="btn" @click="choose('cancel')">{{ label('cancel', 'C') }}</button>
            <button ref="renameRef" class="btn" @click="choose('rename')">{{ label('rename', 'R') }}</button>
            <button ref="skipRef" class="btn" @click="choose('skip')">{{ label('skip', 'S') }}</button>
            <button ref="overwriteRef" class="btn is-danger" @click="choose('overwrite')">{{ label('overwrite', 'O') }}</button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useTransfersStore } from '@/stores/transfers';
import { baseName } from '@/utils/path';

const { t } = useI18n();
const transfers = useTransfersStore();
const applyToAll = ref(false);
const cancelRef = ref(null);
const renameRef = ref(null);
const skipRef = ref(null);
const overwriteRef = ref(null);

/** 按钮从左到右的顺序，供左右键切换焦点 */
const optionRefs = computed(() => [cancelRef, renameRef, skipRef, overwriteRef]
    .map(item => item.value)
    .filter(Boolean));

/** 按键 → 冲突处理方式（与按钮文字中的快捷键一致） */
const SHORTCUTS = { r: 'rename', s: 'skip', o: 'overwrite', c: 'cancel' };

const conflict = computed(() => transfers.conflict || {});
const sourceName = computed(() => baseName(conflict.value.source || ''));
const kindText = computed(() => {
    const targetKind = conflict.value.targetKind === 'dir' ? t('conflict.kindDir') : t('conflict.kindFile');
    return t('conflict.existAs', { kind: targetKind });
});

/** 按钮文字 + 快捷键提示，如“重命名（R）” */
function label(key, shortcut) {
    return t(`conflict.${key}`) + t('conflict.keyHint', { key: shortcut });
}

function choose(decision) {
    // 取消时不应套用“对后续冲突使用相同处理”
    transfers.respond(decision, decision === 'cancel' ? false : applyToAll.value);
}

function cancel() {
    choose('cancel');
}

/** 左右键在四个选项按钮间循环切换焦点 */
function focusStep(delta) {
    const refs = optionRefs.value;
    if (!refs.length) return;
    const current = refs.indexOf(document.activeElement);
    // 未聚焦任何按钮时以默认项“覆盖”（最后一个）为基准
    const base = current === -1 ? refs.length - 1 : current;
    refs[(base + delta + refs.length) % refs.length].focus();
}

function onKeydown(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusStep(event.key === 'ArrowRight' ? 1 : -1);
        return;
    }
    const decision = SHORTCUTS[event.key.toLowerCase()];
    if (!decision) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    choose(decision);
}

onMounted(() => {
    // 捕获阶段监听：优先于列表的快速搜索按键处理（它会把单字符按键吃掉）
    window.addEventListener('keydown', onKeydown, true);
    // 默认选中“覆盖”（AppModal 在挂载后会把焦点移到面板，这里在其之后抢回）
    nextTick(() => {
        if (overwriteRef.value) overwriteRef.value.focus();
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.conflict-body {
    padding: 18px 20px;
    font-size: var(--dialog-font-size);
}

.conflict-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
}

.conflict-desc {
    margin-top: 6px;
    color: var(--text-secondary);
}

.conflict-target {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-head);
    color: var(--text-secondary);
    font-size: var(--status-font-size);
}

.conflict-target .label {
    flex: 0 0 auto;
}

.conflict-target .path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
}

.apply-all {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
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

.btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}

.btn.is-danger:hover {
    border-color: var(--danger);
    color: var(--danger);
}

.btn.is-danger:focus {
    outline-color: var(--danger);
}
</style>
