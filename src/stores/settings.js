import { defineStore } from 'pinia';
import { ref } from 'vue';
import i18n from '@/i18n';

const api = window.filecommander;

/**
 * 设置与主题
 *
 * 主题/语言的最终状态以主进程为准：菜单或其它来源修改后，
 * 主进程广播 settingApplied，渲染层据此同步。
 */
export const useSettingsStore = defineStore('settings', () => {
    const theme = ref('system');
    const locale = ref('system');
    const fontSize = ref(13);
    const rowHeight = ref(26);
    const showHidden = ref(false);
    const dirsFirst = ref(true);
    const showIcons = ref(true);
    const confirmOverwrite = ref(true);
    const restoreSession = ref(true);
    const restoreWindow = ref(true);
    const zoom = ref(1);
    const columns = ref({ size: 96, mtime: 150, type: 100 });

    const platform = ref('linux');
    const home = ref('/');
    const version = ref('');
    const isDark = ref(false);

    function applyTheme() {
        document.documentElement.classList.toggle('dark', isDark.value);
    }

    function applyTypography() {
        const root = document.documentElement;
        root.style.setProperty('--ui-font-size', `${fontSize.value}px`);
        root.style.setProperty('--row-height', `${rowHeight.value}px`);
    }

    function applyLocale(resolved) {
        if (resolved) i18n.global.locale.value = resolved;
        localStorage.setItem('filecommander-locale-mode', locale.value);
    }

    function hydrate(boot) {
        const s = boot.settings || {};
        theme.value = s.theme || 'system';
        locale.value = s.locale || 'system';
        fontSize.value = s.fontSize || 13;
        rowHeight.value = s.rowHeight || 26;
        showHidden.value = !!s.showHidden;
        dirsFirst.value = s.dirsFirst !== false;
        showIcons.value = s.showIcons !== false;
        confirmOverwrite.value = s.confirmOverwrite !== false;
        restoreSession.value = s.restoreSession !== false;
        restoreWindow.value = s.restoreWindow !== false;
        zoom.value = Number(s.zoom) || 1;
        columns.value = { size: 96, mtime: 150, type: 100, ...(s.columns || {}) };

        platform.value = boot.platform || 'linux';
        home.value = boot.home || '/';
        version.value = boot.version || '';
        isDark.value = !!boot.dark;

        applyTheme();
        applyTypography();
        applyLocale(boot.locale);
    }

    // 主进程广播的变更（菜单、其它窗口）
    function applyRemote(key, value) {
        switch (key) {
            case 'theme': theme.value = value; break;
            case 'locale': locale.value = value; break;
            case 'fontSize': fontSize.value = value; break;
            case 'rowHeight': rowHeight.value = value; break;
            case 'showHidden': showHidden.value = !!value; break;
            case 'dirsFirst': dirsFirst.value = !!value; break;
            case 'showIcons': showIcons.value = !!value; break;
            case 'confirmOverwrite': confirmOverwrite.value = !!value; break;
            case 'restoreSession': restoreSession.value = !!value; break;
            case 'restoreWindow': restoreWindow.value = !!value; break;
            case 'zoom': zoom.value = Number(value) || 1; break;
            case 'columns': columns.value = { ...columns.value, ...(value || {}) }; break;
            default: return;
        }
        if (key === 'fontSize' || key === 'rowHeight') applyTypography();
    }

    function set(key, value) {
        applyRemote(key, value);
        api.settingsSet(key, value);
    }

    function bindEvents() {
        const offSetting = api.onSettingApplied((payload) => {
            if (!payload || !payload.key) return;
            applyRemote(payload.key, payload.value);
            if (typeof payload.dark === 'boolean') {
                isDark.value = payload.dark;
                applyTheme();
            }
            if (payload.locale) applyLocale(payload.locale);
        });
        const offTheme = api.onThemeApplied((payload) => {
            isDark.value = !!payload.dark;
            applyTheme();
        });
        return () => {
            offSetting();
            offTheme();
        };
    }

    return {
        theme, locale, fontSize, rowHeight, showHidden, dirsFirst, showIcons,
        confirmOverwrite, restoreSession, restoreWindow, zoom, columns,
        platform, home, version, isDark,
        hydrate, set, bindEvents
    };
});
