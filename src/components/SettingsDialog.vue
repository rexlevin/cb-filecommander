<template>
    <AppModal :title="t('settings.title')" :close-label="t('settings.close')" wide @close="ui.closeSettings()">
        <div class="settings">
            <nav class="settings-nav">
                <button
                    v-for="section in sections"
                    :key="section.key"
                    class="nav-item"
                    :class="{ active: ui.settingsSection === section.key }"
                    @click="ui.settingsSection = section.key"
                >
                    {{ t(section.label) }}
                </button>
            </nav>

            <div class="settings-content">
                <!-- 外观 -->
                <section v-if="ui.settingsSection === 'appearance'" class="pane">
                    <div class="field">
                        <span class="field-label">{{ t('settings.theme') }}</span>
                        <div class="segmented">
                            <button
                                v-for="option in themeOptions"
                                :key="option.value"
                                :class="{ active: settings.theme === option.value }"
                                @click="settings.set('theme', option.value)"
                            >
                                {{ t(option.label) }}
                            </button>
                        </div>
                    </div>

                    <div class="field">
                        <span class="field-label">{{ t('settings.zoom') }}</span>
                        <select class="select" v-model.number="zoomModel">
                            <option v-for="value in zoomOptions" :key="value" :value="value">
                                {{ Math.round(value * 100) }}%
                            </option>
                        </select>
                    </div>

                    <div class="field">
                        <span class="field-label">{{ t('settings.rowHeight') }}</span>
                        <span class="number-field">
                            <button
                                class="step-btn"
                                type="button"
                                :disabled="settings.rowHeight <= 20"
                                @click="stepRowHeight(-2)"
                            >−</button>
                            <input
                                class="num-input step-readonly"
                                type="number"
                                readonly
                                :value="settings.rowHeight"
                            />
                            <button
                                class="step-btn"
                                type="button"
                                :disabled="settings.rowHeight >= 45"
                                @click="stepRowHeight(2)"
                            >+</button>
                            <span class="unit">{{ t('settings.fontSizeUnit') }}</span>
                        </span>
                    </div>

                    <div class="field">
                        <span class="field-label">{{ t('settings.showIcons') }}</span>
                        <label class="switch">
                            <input
                                type="checkbox"
                                :checked="settings.showIcons"
                                @change="onToggle('showIcons', $event)"
                            />
                            <span class="switch-track"></span>
                        </label>
                    </div>
                </section>

                <!-- 字体 -->
                <section v-else-if="ui.settingsSection === 'fonts'" class="pane">
                    <div v-for="group in fontGroups" :key="group.area" class="font-group">
                        <h3 class="font-title">{{ t(group.label) }}</h3>
                        <div class="field">
                            <span class="field-label">{{ t('settings.fontFamily') }}</span>
                            <input
                                class="text-input"
                                type="text"
                                list="fc-font-presets"
                                spellcheck="false"
                                :placeholder="t('settings.fontFamilyDefault')"
                                :value="settings.fonts[group.area].family"
                                @change="onFontFamilyChange(group.area, $event)"
                            />
                        </div>
                        <div class="field">
                            <span class="field-label">{{ t('settings.fontSize') }}</span>
                            <span class="number-field">
                                <button
                                    class="step-btn"
                                    type="button"
                                    :disabled="settings.fonts[group.area].size <= group.min"
                                    @click="stepFontSize(group.area, -1, group.min, group.max)"
                                >−</button>
                                <input
                                    class="num-input step-readonly"
                                    type="number"
                                    readonly
                                    :value="settings.fonts[group.area].size"
                                />
                                <button
                                    class="step-btn"
                                    type="button"
                                    :disabled="settings.fonts[group.area].size >= group.max"
                                    @click="stepFontSize(group.area, 1, group.min, group.max)"
                                >+</button>
                                <span class="unit">{{ t('settings.fontSizeUnit') }}</span>
                            </span>
                        </div>
                    </div>

                    <p class="field-note">{{ t('settings.fontsNote') }}</p>

                    <datalist id="fc-font-presets">
                        <option v-for="name in fontPresets" :key="name" :value="name"></option>
                    </datalist>
                </section>

                <!-- 行为 -->
                <section v-else-if="ui.settingsSection === 'behavior'" class="pane">
                    <div class="field">
                        <span class="field-label">{{ t('settings.externalEditor') }}</span>
                        <input
                            class="text-input"
                            type="text"
                            spellcheck="false"
                            :placeholder="'code / vim / gedit'"
                            :value="settings.externalEditor"
                            @change="onExternalEditorChange($event)"
                        />
                    </div>
                    <p class="field-note">{{ t('settings.externalEditorHint') }}</p>

                    <div class="field">
                        <span class="field-label">{{ t('settings.showHidden') }}</span>
                        <label class="switch">
                            <input
                                type="checkbox"
                                :checked="settings.showHidden"
                                @change="onToggle('showHidden', $event)"
                            />
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <p class="field-note">{{ t('settings.showHiddenNote') }}</p>

                    <div class="field">
                        <span class="field-label">{{ t('settings.dirsFirst') }}</span>
                        <label class="switch">
                            <input
                                type="checkbox"
                                :checked="settings.dirsFirst"
                                @change="onToggle('dirsFirst', $event)"
                            />
                            <span class="switch-track"></span>
                        </label>
                    </div>

                    <div class="field">
                        <span class="field-label">{{ t('settings.confirmOverwrite') }}</span>
                        <label class="switch">
                            <input
                                type="checkbox"
                                :checked="settings.confirmOverwrite"
                                @change="onToggle('confirmOverwrite', $event)"
                            />
                            <span class="switch-track"></span>
                        </label>
                    </div>
                </section>

                <!-- 列 -->
                <section v-else-if="ui.settingsSection === 'columns'" class="pane">
                    <div v-for="column in columnOptions" :key="column.key" class="field">
                        <span class="field-label">{{ t(column.label) }}</span>
                        <span class="number-field">
                            <input
                                class="num-input"
                                type="number"
                                min="40"
                                max="600"
                                step="2"
                                :value="settings.columns[column.key]"
                                @change="onColumnChange(column.key, $event)"
                            />
                            <span class="unit">{{ t('settings.columnUnit') }}</span>
                        </span>
                    </div>
                    <div class="field">
                        <span class="field-label"></span>
                        <button class="btn" @click="resetColumns">{{ t('settings.resetColumns') }}</button>
                    </div>
                </section>

                <!-- 会话 -->
                <section v-else-if="ui.settingsSection === 'session'" class="pane">
                    <div class="field">
                        <span class="field-label">{{ t('settings.restoreSession') }}</span>
                        <label class="switch">
                            <input
                                type="checkbox"
                                :checked="settings.restoreSession"
                                @change="onToggle('restoreSession', $event)"
                            />
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <div class="field">
                        <span class="field-label">{{ t('settings.restoreWindow') }}</span>
                        <label class="switch">
                            <input
                                type="checkbox"
                                :checked="settings.restoreWindow"
                                @change="onToggle('restoreWindow', $event)"
                            />
                            <span class="switch-track"></span>
                        </label>
                    </div>
                </section>

                <!-- 快捷键 -->
                <section v-else-if="ui.settingsSection === 'shortcuts'" class="pane is-full">
                    <ShortcutList />
                    <p class="field-note">{{ t('settings.shortcutsNote') }}</p>
                </section>

                <!-- 关于 -->
                <section v-else-if="ui.settingsSection === 'about'" class="pane about">
                    <span class="about-logo" aria-hidden="true" v-html="logoMarkup"></span>
                    <h2 class="about-name">{{ settings.appName }}</h2>
                    <p class="about-tagline">{{ t('about.tagline') }}</p>

                    <dl class="about-meta">
                        <dt>{{ t('about.version') }}</dt>
                        <dd>{{ settings.version || '—' }}</dd>
                        <dt>{{ t('about.electron') }}</dt>
                        <dd>{{ settings.electron || '—' }}</dd>
                        <dt>{{ t('about.platform') }}</dt>
                        <dd>{{ settings.platform }} {{ settings.arch }}</dd>
                        <dt>{{ t('about.homepage') }}</dt>
                        <dd>
                            <button v-if="settings.homepage" class="link" @click="openHomepage">
                                {{ settings.homepage }}
                            </button>
                            <span v-else>—</span>
                        </dd>
                    </dl>
                </section>
            </div>
        </div>

        <template #footer>
            <button class="btn" @click="ui.closeSettings()">{{ t('settings.close') }}</button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import ShortcutList from './ShortcutList.vue';
import logoMarkup from '../../logo.svg?raw';
import { useSettingsStore } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';

const { t } = useI18n();
const settings = useSettingsStore();
const ui = useUiStore();

const api = window.filecommander;

const sections = [
    { key: 'appearance', label: 'settings.appearance' },
    { key: 'fonts', label: 'settings.fonts' },
    { key: 'behavior', label: 'settings.behavior' },
    { key: 'columns', label: 'settings.columns' },
    { key: 'session', label: 'settings.session' },
    { key: 'shortcuts', label: 'settings.shortcuts' },
    { key: 'about', label: 'settings.about' }
];

const themeOptions = [
    { value: 'system', label: 'settings.themeSystem' },
    { value: 'light', label: 'settings.themeLight' },
    { value: 'dark', label: 'settings.themeDark' }
];

const zoomOptions = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

const columnOptions = [
    { key: 'size', label: 'settings.columnSize' },
    { key: 'mtime', label: 'settings.columnMtime' },
    { key: 'type', label: 'settings.columnType' }
];

const fontGroups = [
    { area: 'file', label: 'settings.fontFile', min: 10, max: 25 },
    { area: 'tab', label: 'settings.fontTab', min: 9, max: 21 },
    { area: 'status', label: 'settings.fontStatus', min: 9, max: 21 },
    { area: 'dialog', label: 'settings.fontDialog', min: 10, max: 25 }
];

// 常见桌面字体预设，允许手动输入未列出的字体名
const fontPresets = [
    'Noto Sans CJK SC',
    'Noto Serif CJK SC',
    'Noto Sans Mono CJK SC',
    'DejaVu Sans',
    'DejaVu Sans Mono',
    'WenQuanYi Micro Hei',
    'Ubuntu',
    'Ubuntu Mono',
    'JetBrains Mono',
    'Fira Code',
    'Microsoft YaHei',
    'SimSun',
    'SimHei',
    'KaiTi',
    'Segoe UI',
    'Consolas',
    'Courier New',
    'PingFang SC',
    'Menlo',
    'Monaco'
];

const zoomModel = computed({
    get: () => Number(settings.zoom),
    set: (value) => settings.set('zoom', Number(value))
});

function onToggle(key, event) {
    settings.set(key, event.target.checked);
}

function onNumberChange(key, event, min, max, step) {
    const current = settings[key];
    const raw = Number(event.target.value);
    const value = Number.isFinite(raw)
        ? Math.min(max, Math.max(min, Math.round(raw / step) * step))
        : current;
    event.target.value = String(value);
    if (value !== current) settings.set(key, value);
}

function onColumnChange(key, event) {
    const current = settings.columns[key];
    const raw = Number(event.target.value);
    const value = Number.isFinite(raw) ? Math.min(600, Math.max(40, Math.round(raw))) : current;
    event.target.value = String(value);
    if (value !== current) settings.set('columns', { ...settings.columns, [key]: value });
}

function resetColumns() {
    settings.set('columns', { size: 96, mtime: 150, type: 100 });
}

function onFontFamilyChange(area, event) {
    const family = event.target.value.trim();
    if (family === settings.fonts[area].family) return;
    settings.set('fonts', {
        ...settings.fonts,
        [area]: { ...settings.fonts[area], family }
    });
}

function stepFontSize(area, delta, min, max) {
    const current = settings.fonts[area].size;
    const value = Math.min(max, Math.max(min, current + delta));
    if (value === current) return;
    settings.set('fonts', {
        ...settings.fonts,
        [area]: { ...settings.fonts[area], size: value }
    });
}

function stepRowHeight(delta) {
    const current = settings.rowHeight;
    const value = Math.min(45, Math.max(20, current + delta));
    if (value === current) return;
    settings.set('rowHeight', value);
}

function openHomepage() {
    api.openExternal(settings.homepage);
}

function onExternalEditorChange(event) {
    const value = event.target.value.trim();
    settings.set('externalEditor', value);
}
</script>

<style scoped>
.settings {
    display: flex;
    min-height: 420px;
}

.settings-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 0 0 168px;
    padding: 10px 8px;
    border-right: 1px solid var(--border);
    background: var(--panel-head);
}

.nav-item {
    position: relative;
    padding: 7px 12px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.92em;
    text-align: left;
    cursor: pointer;
}

.nav-item:hover {
    background: var(--hover-bg);
    color: var(--text);
}

.nav-item.active {
    background: var(--selected);
    color: var(--accent);
    font-weight: 600;
}

.settings-content {
    flex: 1 1 auto;
    min-width: 0;
    padding: 16px 22px 20px;
}

.pane {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.pane.is-full {
    gap: 8px;
}

.font-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.font-group + .font-group {
    padding-top: 10px;
    border-top: 1px solid var(--border);
}

.font-title {
    margin: 0;
    color: var(--text);
    font-size: 0.92em;
    font-weight: 600;
}

.field {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 26px;
}

.field-label {
    flex: 0 0 168px;
    color: var(--text);
    font-size: 0.92em;
}

.field-note {
    margin: -6px 0 2px 184px;
    color: var(--text-secondary);
    font-size: 0.85em;
    line-height: 1.5;
}

.unit {
    color: var(--text-secondary);
    font-size: 0.85em;
}

.number-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.num-input,
.select,
.text-input {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--input-bg);
    color: var(--text);
    font-family: inherit;
    font-size: 0.92em;
}

.num-input:not(.step-readonly) {
    width: 86px;
    text-align: left;
}

.num-input.step-readonly {
    width: 54px;
    text-align: center;
    cursor: default;
    color: var(--text);
    background: var(--input-bg);
}

.step-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--input-bg);
    color: var(--text);
    font-family: inherit;
    font-size: 0.96em;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    user-select: none;
}

.step-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
}

.step-btn:active:not(:disabled) {
    background: var(--selected);
}

.step-btn:disabled {
    color: var(--text-secondary);
    opacity: 0.45;
    cursor: default;
}

.select {
    min-width: 110px;
}

.text-input {
    width: 220px;
}

.num-input:focus,
.select:focus,
.text-input:focus {
    border-color: var(--accent);
    outline: none;
}

.segmented {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-head);
}

.segmented button {
    padding: 4px 14px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.92em;
    cursor: pointer;
}

.segmented button:hover {
    color: var(--text);
}

.segmented button.active {
    background: var(--selected);
    color: var(--accent);
    font-weight: 600;
}

.switch {
    position: relative;
    display: inline-flex;
    width: 36px;
    height: 20px;
    cursor: pointer;
}

.switch input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}

.switch-track {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--scroll-thumb);
    transition: background 140ms ease;
}

.switch-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
    transition: transform 140ms ease;
}

.switch input:checked + .switch-track {
    background: var(--accent);
}

.switch input:checked + .switch-track::after {
    transform: translateX(16px);
}

.switch input:focus-visible + .switch-track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

.about {
    align-items: center;
    padding-top: 6px;
    text-align: center;
}

.about-logo :deep(svg) {
    display: block;
    width: 76px;
    height: 76px;
    border-radius: 16px;
    box-shadow: 0 6px 18px rgba(59, 130, 246, 0.22);
}

.about-name {
    margin: 12px 0 0;
    font-size: 1.31em;
    font-weight: 600;
}

.about-tagline {
    margin: 4px 0 14px;
    color: var(--text-secondary);
    font-size: 0.92em;
}

.about-meta {
    display: grid;
    grid-template-columns: auto auto;
    gap: 6px 18px;
    margin: 0;
    font-size: 0.92em;
    text-align: left;
}

.about-meta dt {
    color: var(--text-secondary);
    text-align: right;
}

.about-meta dd {
    margin: 0;
}

.link {
    max-width: 300px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-family: inherit;
    font-size: 0.92em;
    text-decoration: underline;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btn {
    padding: 5px 14px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--input-bg);
    color: var(--text);
    font-size: 0.92em;
    cursor: pointer;
}

.btn:hover {
    border-color: var(--accent);
    color: var(--accent);
}
</style>
