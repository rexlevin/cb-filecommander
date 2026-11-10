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
            <button class="btn" @click="choose('cancel')">{{ t('conflict.cancel') }}</button>
            <button class="btn" @click="choose('rename')">{{ t('conflict.rename') }}</button>
            <button class="btn" @click="choose('skip')">{{ t('conflict.skip') }}</button>
            <button class="btn is-danger" @click="choose('overwrite')">{{ t('conflict.overwrite') }}</button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useTransfersStore } from '@/stores/transfers';
import { baseName } from '@/utils/path';

const { t } = useI18n();
const transfers = useTransfersStore();
const applyToAll = ref(false);

const conflict = computed(() => transfers.conflict || {});
const sourceName = computed(() => baseName(conflict.value.source || ''));
const kindText = computed(() => {
    const targetKind = conflict.value.targetKind === 'dir' ? t('conflict.kindDir') : t('conflict.kindFile');
    return t('conflict.existAs', { kind: targetKind });
});

function choose(decision) {
    transfers.respond(decision, applyToAll.value);
}

function cancel() {
    transfers.respond('cancel', false);
}
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

.btn.is-danger:hover {
    border-color: var(--danger);
    color: var(--danger);
}
</style>
