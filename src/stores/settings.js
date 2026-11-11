import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import i18n from '@/i18n';

const api = window.filecommander;

const BASE_FONT_STACK = "'Segoe UI', 'Noto Sans', 'DejaVu Sans', 'Microsoft YaHei', sans-serif";

const DEFAULT_FONTS = {
    file: { family: '', size: 13 },
    tab: { family: '', size: 12 },
    status: { family: '', size: 11 },
    dialog: { family: '', size: 13 }
};

const FONT_AREAS = Object.keys(DEFAULT_FONTS);

function normalizeFonts(raw) {
    const next = {};
    for (const area of FONT_AREAS) {
        const source = raw && typeof raw === 'object' && raw[area] ? raw[area] : {};
        const fallback = DEFAULT_FONTS[area];
        const size = Number(source.size);
        next[area] = {
            family: typeof source.family === 'string' ? source.family : fallback.family,
            size: Number.isFinite(size) && size > 0 ? size : fallback.size
        };
    }
    return next;
}

function fontStack(family) {
    return family ? `${family}, ${BASE_FONT_STACK}` : BASE_FONT_STACK;
}

/**
 * 设置与主题
 *
 * 主题/语言的最终状态以主进程为准：菜单或其它来源修改后，
 * 主进程广播 settingApplied，渲染层据此同步。
 */
export const useSettingsStore = defineStore('settings', () => {
    const theme = ref('system');
    const locale = ref('system');
    const fonts = ref(normalizeFonts(DEFAULT_FONTS));
    const rowHeight = ref(26);
    const rowHeightAuto = ref(true); // 自动跟随文件字号
    const showHidden = ref(false);
    const dirsFirst = ref(true);
    const showIcons = ref(true);
    const confirmOverwrite = ref(true);
    const restoreSession = ref(true);
    const restoreWindow = ref(true);
    const zoom = ref(1);
    const columns = ref({ size: 96, mtime: 150, type: 100 });
    const externalEditor = ref('');

    const platform = ref('linux');
    const home = ref('/');
    const version = ref('');
    const electron = ref('');
    const arch = ref('');
    const homepage = ref('');
    const appName = ref('FileCommander');
    const isDark = ref(false);

    function applyTheme() {
        document.documentElement.classList.toggle('dark', isDark.value);
    }

    // 推荐行高 = 文件字号 + 13（默认 13 + 13 = 26）
    const recommendedRowHeight = computed(() => Math.round((fonts.value.file?.size || 13) + 13));

    /** 自动模式下把 rowHeight 对齐到推荐值 */
    function syncRowHeight() {
        if (rowHeightAuto.value) rowHeight.value = recommendedRowHeight.value;
    }

    function applyTypography() {
        const root = document.documentElement;
        root.style.setProperty('--row-height', `${rowHeight.value}px`);
        for (const area of FONT_AREAS) {
            root.style.setProperty(`--${area}-font-family`, fontStack(fonts.value[area].family));
            root.style.setProperty(`--${area}-font-size`, `${fonts.value[area].size}px`);
        }
    }

    function applyLocale(resolved) {
        if (resolved) i18n.global.locale.value = resolved;
        localStorage.setItem('filecommander-locale-mode', locale.value);
    }

    function hydrate(boot) {
        const s = boot.settings || {};
        theme.value = s.theme || 'system';
        locale.value = s.locale || 'system';
        fonts.value = normalizeFonts(s.fonts);
        rowHeightAuto.value = s.rowHeightAuto !== false;
        rowHeight.value = rowHeightAuto.value ? recommendedRowHeight.value : (s.rowHeight || 26);
        showHidden.value = !!s.showHidden;
        dirsFirst.value = s.dirsFirst !== false;
        showIcons.value = s.showIcons !== false;
        confirmOverwrite.value = s.confirmOverwrite !== false;
        restoreSession.value = s.restoreSession !== false;
        restoreWindow.value = s.restoreWindow !== false;
        zoom.value = Number(s.zoom) || 1;
        columns.value = { size: 96, mtime: 150, type: 100, ...(s.columns || {}) };
        externalEditor.value = typeof s.externalEditor === 'string' ? s.externalEditor : '';

        platform.value = boot.platform || 'linux';
        home.value = boot.home || '/';
        version.value = boot.version || '';
        electron.value = boot.electron || '';
        arch.value = boot.arch || '';
        homepage.value = boot.homepage || '';
        appName.value = boot.appName || 'FileCommander';
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
            case 'fonts': fonts.value = normalizeFonts(value); syncRowHeight(); break;
            case 'rowHeight': rowHeight.value = value; rowHeightAuto.value = false; break;
            case 'rowHeightAuto': rowHeightAuto.value = !!value; syncRowHeight(); break;
            case 'showHidden': showHidden.value = !!value; break;
            case 'dirsFirst': dirsFirst.value = !!value; break;
            case 'showIcons': showIcons.value = !!value; break;
            case 'confirmOverwrite': confirmOverwrite.value = !!value; break;
            case 'restoreSession': restoreSession.value = !!value; break;
            case 'restoreWindow': restoreWindow.value = !!value; break;
            case 'zoom': zoom.value = Number(value) || 1; break;
            case 'columns': columns.value = { ...columns.value, ...(value || {}) }; break;
            case 'externalEditor': externalEditor.value = typeof value === 'string' ? value : ''; break;
            default: return;
        }
        if (key === 'fonts' || key === 'rowHeight' || key === 'rowHeightAuto') applyTypography();
    }

    // IPC 使用结构化克隆，先转为纯对象，避免 Vue 响应式代理无法序列化
    function toPlain(value) {
        return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
    }

    function set(key, value) {
        const plain = toPlain(value);
        applyRemote(key, plain);
        api.settingsSet(key, plain);
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
        theme, locale, fonts, rowHeight, rowHeightAuto, recommendedRowHeight, showHidden, dirsFirst, showIcons,
        confirmOverwrite, restoreSession, restoreWindow, zoom, columns, externalEditor,
        platform, home, version, electron, arch, homepage, appName, isDark,
        hydrate, set, bindEvents
    };
});
