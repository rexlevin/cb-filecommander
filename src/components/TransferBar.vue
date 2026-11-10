<template>
    <transition name="transfer">
        <div v-if="current || finished" class="transfer-bar">
            <template v-if="current">
                <div class="row head">
                    <span class="title">{{ titleText }}</span>
                    <span v-if="current.pending" class="queued">
                        {{ t('transfer.queued', { count: current.pending }) }}
                    </span>
                    <span class="spacer"></span>
                    <button class="action" @click="transfers.cancel(current.taskId)">
                        {{ t('transfer.cancel') }}
                    </button>
                </div>
                <div class="progress" :class="{ 'is-scan': isScanning }">
                    <div class="progress-fill" :style="{ width: `${percent}%` }"></div>
                </div>
                <div class="row foot">
                    <span class="file" :title="current.file || ''">{{ fileLabel }}</span>
                    <span class="spacer"></span>
                    <span v-if="speedText" class="meta">{{ speedText }}</span>
                    <span v-if="etaText" class="meta">{{ etaText }}</span>
                </div>
            </template>

            <template v-else>
                <div class="row head">
                    <span class="title" :class="finishedTone">{{ finishedText }}</span>
                    <span class="spacer"></span>
                    <button class="action" @click="transfers.dismissFinished()">
                        {{ t('transfer.close') }}
                    </button>
                </div>
                <div v-if="finished.errors && finished.errors.length" class="errors">
                    <div v-for="error in finished.errors.slice(0, 3)" :key="error.path" class="error-line">
                        <span class="error-path" :title="error.path">{{ baseName(error.path) }}</span>
                        <span class="error-code">{{ errorText(error.code, t, te) }}</span>
                    </div>
                    <button
                        v-if="finished.errors.length > 3"
                        class="more"
                        @click="showAllErrors = !showAllErrors"
                    >
                        {{ showAllErrors ? t('transfer.hideErrors') : t('transfer.moreErrors', { count: finished.errors.length - 3 }) }}
                    </button>
                    <template v-if="showAllErrors">
                        <div v-for="error in finished.errors.slice(3)" :key="error.path" class="error-line">
                            <span class="error-path" :title="error.path">{{ error.path }}</span>
                            <span class="error-code">{{ errorText(error.code, t, te) }}</span>
                        </div>
                    </template>
                </div>
            </template>
        </div>
    </transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTransfersStore } from '@/stores/transfers';
import { formatSize, errorText } from '@/utils/format';
import { baseName } from '@/utils/path';

const { t, te } = useI18n();
const transfers = useTransfersStore();
const showAllErrors = ref(false);

const current = computed(() => transfers.current);
const finished = computed(() => transfers.finished);

const isScanning = computed(() => !!current.value && current.value.phase === 'scan'
    && current.value.status !== 'running' && current.value.status !== 'waiting');

const opLabel = computed(() => t(current.value && current.value.op === 'move' ? 'transfer.move' : 'transfer.copy'));

const titleText = computed(() => {
    const task = current.value;
    if (!task) return '';
    if (task.status === 'queued') return `${opLabel.value} · ${t('transfer.queuedOne')}`;
    if (task.status === 'waiting') return `${opLabel.value} · ${t('transfer.waiting')}`;
    if (isScanning.value) return `${opLabel.value} · ${t('transfer.scanning')}`;
    return `${opLabel.value} · ${t('transfer.progress', { index: task.index, total: task.total })}`;
});

const percent = computed(() => {
    const task = current.value;
    if (!task || isScanning.value) return 0;
    if (task.bytesTotal > 0) return Math.min(100, (task.bytesDone / task.bytesTotal) * 100);
    if (task.total > 0) return Math.min(100, (task.index / task.total) * 100);
    return 0;
});

const fileLabel = computed(() => {
    const file = current.value && current.value.file;
    return file ? baseName(file) : '';
});

const speedText = computed(() => {
    const speed = current.value && current.value.speed;
    return speed > 0 ? t('transfer.speed', { size: formatSize(speed) }) : '';
});

function duration(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

const etaText = computed(() => {
    const eta = current.value && current.value.eta;
    return eta ? t('transfer.eta', { time: duration(eta) }) : '';
});

const finishedTone = computed(() => {
    if (!finished.value) return '';
    if (finished.value.status === 'failed' || finished.value.failed) return 'is-danger';
    if (finished.value.status === 'cancelled') return 'is-muted';
    return '';
});

const finishedText = computed(() => {
    const summary = finished.value;
    if (!summary) return '';
    const isDelete = summary.op === 'delete';
    if (summary.status === 'cancelled') {
        return isDelete
            ? t('transfer.cancelledDelete', { deleted: summary.deleted, skipped: summary.skipped })
            : t('transfer.cancelled', { copied: summary.copied, skipped: summary.skipped });
    }
    if (summary.status === 'failed') {
        return t('transfer.failed', { failed: summary.failed });
    }
    if (summary.failed) {
        return isDelete
            ? t('transfer.doneDeleteWithFailures', {
                deleted: summary.deleted,
                skipped: summary.skipped,
                failed: summary.failed
            })
            : t('transfer.doneWithFailures', {
                copied: summary.copied,
                skipped: summary.skipped,
                failed: summary.failed
            });
    }
    return isDelete
        ? t('transfer.doneDelete', { deleted: summary.deleted, skipped: summary.skipped })
        : t('transfer.done', { copied: summary.copied, skipped: summary.skipped });
});

watch(finished, () => {
    showAllErrors.value = false;
});
</script>

<style scoped>
.transfer-bar {
    position: fixed;
    left: 50%;
    bottom: 18px;
    z-index: 120;
    width: min(560px, calc(100vw - 32px));
    padding: 10px 12px;
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel-bg);
    color: var(--text);
    font-size: var(--tab-font-size);
    box-shadow: var(--dialog-shadow);
}

.row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.head .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.title.is-danger {
    color: var(--danger);
}

.title.is-muted {
    color: var(--text-secondary);
}

.queued {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.spacer {
    flex: 1 1 auto;
    min-width: 8px;
}

.action {
    flex: 0 0 auto;
    padding: 2px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-size: var(--tab-font-size);
    cursor: pointer;
}

.action:hover {
    border-color: var(--accent);
    color: var(--accent);
}

.progress {
    position: relative;
    height: 6px;
    margin: 8px 0 6px;
    border-radius: 3px;
    background: var(--hover-bg);
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 120ms linear;
}

.progress.is-scan .progress-fill {
    width: 30% !important;
    animation: transfer-scan 1.1s ease-in-out infinite;
}

@keyframes transfer-scan {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(340%); }
}

.foot {
    color: var(--text-secondary);
    font-size: var(--status-font-size);
}

.file {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.meta {
    flex: 0 0 auto;
}

.errors {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    color: var(--text-secondary);
}

.error-line {
    display: flex;
    gap: 8px;
    min-width: 0;
    padding: 1px 0;
}

.error-path {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.error-code {
    flex: 0 0 auto;
    color: var(--danger);
}

.more {
    margin-top: 4px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: var(--status-font-size);
    cursor: pointer;
}

.transfer-enter-active,
.transfer-leave-active {
    transition: opacity 160ms ease, transform 160ms ease;
}

.transfer-enter-from,
.transfer-leave-to {
    opacity: 0;
    transform: translate(-50%, 12px);
}
</style>
