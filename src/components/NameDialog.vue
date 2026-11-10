<template>
    <AppModal :title="title" :close-label="t('ops.cancel')" compact @close="close">
        <div class="name-body">
            <div class="name-label">{{ label }}</div>
            <input
                ref="inputRef"
                v-model="draft"
                class="name-input"
                :class="{ 'has-error': errorCode }"
                spellcheck="false"
                @input="onInput"
                @keydown.enter.prevent="submit"
                @keydown.esc.prevent="close"
            />
            <div class="name-hint" :class="{ 'is-error': errorCode }">
                {{ errorCode ? errorText(errorCode, t, te) : t('ops.nameHint') }}
            </div>
        </div>
        <template #footer>
            <button class="btn" @click="close">{{ t('ops.cancel') }}</button>
            <button class="btn is-primary" :disabled="busy || !canSubmit" @click="submit">
                {{ t('ops.create') }}
            </button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useUiStore } from '@/stores/ui';
import { useListingsStore } from '@/stores/listings';
import { errorText } from '@/utils/format';

const api = window.filecommander;
const { t, te } = useI18n();
const ui = useUiStore();
const listings = useListingsStore();

const prompt = computed(() => ui.namePrompt || {});
const kind = computed(() => (prompt.value.kind === 'dir' ? 'dir' : 'file'));
const title = computed(() => (kind.value === 'dir' ? t('ops.newFolderTitle') : t('ops.newFileTitle')));
const label = computed(() => (kind.value === 'dir' ? t('ops.folderName') : t('ops.fileName')));
const defaultName = computed(() => (kind.value === 'dir' ? t('ops.defaultFolder') : t('ops.defaultFile')));

const draft = ref('');
const errorCode = ref(null);
const busy = ref(false);
const inputRef = ref(null);
let validationSeq = 0;

const canSubmit = computed(() => !!draft.value.trim() && !errorCode.value);

function selectBody() {
    const el = inputRef.value;
    if (!el) return;
    el.focus();
    const value = el.value;
    const dot = value.lastIndexOf('.');
    if (kind.value === 'file' && dot > 0) el.setSelectionRange(0, dot);
    else el.select();
}

onMounted(() => {
    draft.value = defaultName.value;
    nextTick(selectBody);
});

async function validate() {
    const name = draft.value.trim();
    if (!name) {
        errorCode.value = null;
        return;
    }
    const seq = ++validationSeq;
    const res = await api.validateName({ parent: prompt.value.dir, name, kind: kind.value });
    if (seq !== validationSeq) return;
    errorCode.value = res && res.ok ? null : ((res && res.error) || 'UNKNOWN');
}

function onInput() {
    validate();
}

function close() {
    if (busy.value) return;
    validationSeq += 1;
    ui.closeNamePrompt();
}

async function submit() {
    if (busy.value) return;
    const name = draft.value.trim();
    if (!name) return;
    await validate();
    if (errorCode.value) return;

    busy.value = true;
    const target = prompt.value;
    const res = kind.value === 'dir'
        ? await api.mkdir({ parent: target.dir, name })
        : await api.createFile({ parent: target.dir, name });
    busy.value = false;

    if (!res || !res.ok) {
        errorCode.value = (res && res.error) || 'UNKNOWN';
        return;
    }

    ui.closeNamePrompt();
    await listings.openDir(target.pane, target.tabId, target.dir, { mode: 'refresh' });
    const state = listings.ensure(target.tabId);
    if (state.entries.some((entry) => entry.path === res.path)) {
        listings.selectOnly(target.tabId, res.path);
    }
}
</script>

<style scoped>
.name-body {
    padding: 18px 20px;
    font-size: var(--dialog-font-size);
}

.name-label {
    margin-bottom: 8px;
    color: var(--text-secondary);
}

.name-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text);
    font-family: inherit;
    font-size: inherit;
    outline: none;
    box-sizing: border-box;
}

.name-input:focus {
    border-color: var(--accent);
}

.name-input.has-error {
    border-color: var(--danger);
}

.name-hint {
    min-height: 18px;
    margin-top: 6px;
    color: var(--text-secondary);
    font-size: var(--status-font-size);
}

.name-hint.is-error {
    color: var(--danger);
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

.btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
}

.btn.is-primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
}

.btn.is-primary:hover:not(:disabled) {
    color: var(--accent-contrast);
    opacity: 0.9;
}

.btn:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>
