import { defineStore } from 'pinia';

const api = window.filecommander;

/**
 * 会话保存：渲染层生成快照，500ms 去抖后交给主进程落盘。
 */
export const useSessionStore = defineStore('session', () => {
    let timer = null;

    function persist(snapshot) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            api.sessionSet(snapshot);
        }, 500);
    }

    function persistNow(snapshot) {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        api.sessionSet(snapshot);
    }

    return { persist, persistNow };
});
