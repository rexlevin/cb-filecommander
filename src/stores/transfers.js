import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useSettingsStore } from './settings';
import { useUiStore } from './ui';
import i18n from '@/i18n';

const api = window.filecommander;
const FINISHED_HIDE_MS = 4000;

/**
 * 复制 / 移动任务视图状态。
 * 主进程是唯一事实来源，这里只做事件汇聚与按需渲染。
 */
export const useTransfersStore = defineStore('transfers', () => {
    // 当前任务：{ taskId, op, status, phase, index, total, bytesDone, bytesTotal, speed, eta, file, pending }
    const current = ref(null);
    // 最近一次结束摘要：{ taskId, op, status, copied, skipped, failed, errors }
    const finished = ref(null);
    // 等待用户决策的冲突：{ taskId, source, target, sourceKind, targetKind }
    const conflict = ref(null);
    const warned = new Set();
    let hideTimer = null;

    function clearHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    api.onTransferProgress((payload) => {
        if (!payload) return;
        if (payload.warning === 'ENOSPC' && !warned.has(payload.taskId)) {
            warned.add(payload.taskId);
            useUiStore().showToast(i18n.global.t('transfer.noSpace'), 'warning', 5000);
        }
        if (!current.value || current.value.taskId !== payload.taskId) {
            current.value = { ...payload };
            finished.value = null;
        } else {
            current.value = { ...current.value, ...payload };
        }
    });

    api.onTransferConflict((payload) => {
        if (payload) conflict.value = payload;
    });

    /** 任务结束：更新摘要，成功时自动隐藏 */
    function handleDone(payload) {
        current.value = null;
        conflict.value = null;
        finished.value = payload || null;
        clearHideTimer();
        if (payload && payload.status === 'done' && !payload.failed
            && !payload.skipped && !(payload.errors && payload.errors.length)) {
            hideTimer = setTimeout(() => {
                finished.value = null;
                hideTimer = null;
            }, FINISHED_HIDE_MS);
        }
    }

    async function start(op, sources, targetDir) {
        const settings = useSettingsStore();
        const payload = {
            op,
            sources
        };
        if (op === 'copy' || op === 'move') {
            payload.targetDir = targetDir;
            payload.policy = settings.confirmOverwrite ? 'ask' : 'overwrite';
        }
        const res = await api.transferStart(payload);
        if (res && res.ok) {
            clearHideTimer();
            finished.value = null;
            if (current.value && current.value.taskId === res.taskId) {
                current.value = { ...current.value, op, targetDir: targetDir || null };
            } else {
                current.value = {
                    taskId: res.taskId,
                    op,
                    targetDir: targetDir || null,
                    status: 'queued',
                    phase: 'scan',
                    index: 0,
                    total: 0,
                    bytesDone: 0,
                    bytesTotal: 0,
                    speed: 0,
                    eta: null,
                    file: null,
                    pending: 0
                };
            }
        }
        return res;
    }

    function respond(decision, applyToAll) {
        const payload = conflict.value;
        conflict.value = null;
        if (!payload) return;
        api.transferRespond({ taskId: payload.taskId, decision, applyToAll: !!applyToAll });
    }

    function cancel(taskId) {
        if (taskId) api.transferCancel(taskId);
    }

    function dismissFinished() {
        clearHideTimer();
        finished.value = null;
    }

    return { current, finished, conflict, handleDone, start, respond, cancel, dismissFinished };
});
