<template>
    <AppModal :title="t('openWith.title')" :close-label="t('common.cancel')" compact @close="close">
        <div class="openwith-body">
            <div class="openwith-file" :title="path">{{ name }}</div>

            <div class="openwith-quick" role="listbox" :aria-label="t('openWith.title')">
                <button
                    v-for="option in quickOptions"
                    :key="option.key"
                    class="openwith-item"
                    :class="{ 'is-active': selectedKey === option.key }"
                    role="option"
                    :aria-selected="selectedKey === option.key"
                    @click="selectedKey = option.key"
                    @dblclick="confirm"
                >
                    <span class="openwith-name">{{ option.label }}</span>
                    <span v-if="option.badge" class="openwith-badge">{{ option.badge }}</span>
                    <span v-if="option.detail" class="openwith-path">{{ option.detail }}</span>
                </button>
            </div>

            <template v-if="showApps">
                <input
                    v-model="query"
                    class="openwith-search"
                    type="text"
                    spellcheck="false"
                    :placeholder="t('openWith.searchPlaceholder')"
                />
                <div ref="appListRef" class="openwith-apps" role="listbox" :aria-label="t('openWith.installed')">
                    <div v-if="appsLoading" class="openwith-note">{{ t('openWith.loadingApps') }}</div>
                    <div v-else-if="!appOptions.length" class="openwith-note">{{ t('openWith.noMatch') }}</div>
                    <button
                        v-for="app in appOptions"
                        :key="app.id"
                        class="openwith-item"
                        :class="{ 'is-active': selectedKey === `app:${app.id}` }"
                        role="option"
                        :aria-selected="selectedKey === `app:${app.id}`"
                        @click="selectedKey = `app:${app.id}`"
                        @dblclick="confirm"
                    >
                        <span class="openwith-name">{{ app.name }}</span>
                    </button>
                </div>
            </template>

            <label v-if="ext" class="openwith-remember">
                <input v-model="remember" type="checkbox" />
                <span>{{ t('openWith.remember', { ext }) }}</span>
            </label>
        </div>
        <template #footer>
            <button class="btn" @click="browse">{{ t('openWith.browse') }}</button>
            <span class="spacer"></span>
            <button class="btn" @click="close">{{ t('common.cancel') }}</button>
            <button class="btn is-primary" :disabled="!selectedKey" @click="confirm">
                {{ t('openWith.open') }}
            </button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useUiStore } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import { errorText, extensionOf } from '@/utils/format';
import { openFileWith } from '@/utils/openwith';

const api = window.filecommander;
const { t, te } = useI18n();
const ui = useUiStore();
const settings = useSettingsStore();

const payload = computed(() => ui.openWithPrompt);
const path = computed(() => (payload.value && payload.value.path) || '');
const name = computed(() => (payload.value && payload.value.name) || '');
const ext = computed(() => extensionOf(name.value));

const selectedKey = ref(null);
const browsed = ref('');
const remember = ref(false);
const opening = ref(false);
const query = ref('');
const appListRef = ref(null);
const installed = ref([]);
const appsLoading = ref(false);

function programName(program) {
    const parts = String(program).split(/[\\/]/);
    return parts[parts.length - 1] || program;
}

/** 设置中的规格 → 选择键：桌面入口用 app: 前缀，程序路径用 prog: 前缀 */
function specKey(spec) {
    return spec.startsWith('app:') ? spec : `prog:${spec}`;
}

/** 选择键 → 设置中的规格（系统默认返回空串） */
function keySpec(key) {
    if (key === 'system' || !key) return '';
    return key.startsWith('app:') ? key : key.slice(5);
}

function appName(appId) {
    const found = installed.value.find((app) => app.id === appId);
    if (found) return found.name;
    return programName(appId).replace(/\.desktop$/i, '');
}

function specLabel(spec) {
    return spec.startsWith('app:') ? appName(spec.slice(4)) : programName(spec);
}

const quickOptions = computed(() => {
    const list = [];
    const seen = new Set();
    const add = (spec, badge) => {
        if (!spec) return;
        const key = specKey(spec);
        if (seen.has(key)) return;
        seen.add(key);
        list.push({
            key,
            label: specLabel(spec),
            badge,
            detail: spec.startsWith('app:') ? '' : spec
        });
    };
    const saved = settings.programForExt(ext.value);
    // 显式选择了系统默认时不作为程序项展示，而是标记在系统默认行上
    if (saved && saved !== 'system') {
        add(saved, ext.value ? t('openWith.defaultForExt', { ext: ext.value }) : '');
    }
    add(browsed.value, t('openWith.browsed'));
    add(settings.externalEditor, t('openWith.editor'));
    for (const spec of settings.openWithRecent) add(spec, '');
    list.push({
        key: 'system',
        label: t('openWith.system'),
        badge: saved === 'system' ? t('openWith.defaultForExt', { ext: ext.value }) : '',
        detail: ''
    });
    return list;
});

const showApps = computed(() => appsLoading.value || installed.value.length > 0);

/** 模糊匹配：优先连续子串，其次按顺序命中的子序列；返回 0 表示不匹配 */
function fuzzyScore(text, keyword) {
    if (!keyword) return 1;
    const haystack = String(text).toLowerCase();
    const needle = keyword.toLowerCase();
    const index = haystack.indexOf(needle);
    if (index >= 0) return 100000 - index;
    let score = 0;
    let last = -1;
    let streak = 0;
    for (const ch of needle) {
        if (ch === ' ') continue;
        let found = -1;
        for (let i = last + 1; i < haystack.length; i += 1) {
            if (haystack[i] === ch) {
                found = i;
                break;
            }
        }
        if (found === -1) return 0;
        streak = found === last + 1 ? streak + 1 : 0;
        score += 10 + streak * 5;
        last = found;
    }
    return score;
}

const appOptions = computed(() => {
    const keyword = query.value.trim();
    if (!keyword) return installed.value;
    return installed.value
        .map((app) => ({ app, score: fuzzyScore(app.name, keyword) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name))
        .map((item) => item.app);
});

// 搜索时默认选中第一个结果，回车即可直接打开
watch(appOptions, (list) => {
    if (!query.value.trim()) return;
    selectedKey.value = list.length ? `app:${list[0].id}` : null;
});

watch(query, () => {
    if (appListRef.value) appListRef.value.scrollTop = 0;
});

async function loadApps() {
    if (typeof api.listApps !== 'function') return;
    appsLoading.value = true;
    try {
        const res = await api.listApps();
        installed.value = res && res.ok && Array.isArray(res.apps) ? res.apps : [];
    } catch (error) {
        installed.value = [];
    } finally {
        appsLoading.value = false;
    }
}

async function browse() {
    const res = await api.chooseProgram({ title: t('openWith.chooseTitle') });
    if (!res || !res.ok) {
        // 用户取消不做提示
        if (res && res.error === 'CANCELLED') return;
        ui.showToast(errorText(res && res.error, t, te), 'danger');
        return;
    }
    browsed.value = res.path;
    selectedKey.value = `prog:${res.path}`;
}

async function confirm() {
    if (!selectedKey.value || opening.value) return;
    const spec = keySpec(selectedKey.value);
    // 关闭弹层会清空 store 中的路径，先缓存目标文件
    const target = path.value;
    opening.value = true;

    // 先落库并关闭弹层，避免系统打开方式响应慢或异常时弹层卡住
    if (remember.value) {
        // 勾选后：记住所选程序；选系统默认则显式恢复系统默认
        if (spec) settings.rememberProgram(spec, ext.value);
        else if (ext.value) settings.useSystemForExt(ext.value);
    } else if (spec) {
        settings.rememberProgram(spec, '');
    }
    ui.closeOpenWith();

    try {
        const res = await openFileWith(api, target, spec);
        if (!res || !res.ok) {
            if (res && res.error === 'CANCELLED') return;
            ui.showToast(errorText(res && res.error, t, te), 'danger');
        }
    } catch (error) {
        ui.showToast(errorText('OPEN_FAILED', t, te), 'danger');
    } finally {
        opening.value = false;
    }
}

function close() {
    ui.closeOpenWith();
}

function onKeydown(event) {
    if (event.key !== 'Enter') return;
    // 复选框回车交给原生行为，其余场景（含搜索框）直接确认打开
    if (event.target && event.target.type === 'checkbox') return;
    event.preventDefault();
    confirm();
}

onMounted(() => {
    const remembered = settings.programForExt(ext.value);
    const recent = settings.openWithRecent[0];
    if (remembered === 'system') selectedKey.value = 'system';
    else selectedKey.value = remembered ? specKey(remembered) : (recent ? specKey(recent) : 'system');
    window.addEventListener('keydown', onKeydown, true);
    loadApps();
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.openwith-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
}

.openwith-file {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 0.94em;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.openwith-quick {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.openwith-search {
    width: 100%;
    padding: 5px 9px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel-bg);
    color: var(--text);
    font-size: var(--dialog-font-size);
    outline: none;
}

.openwith-search:focus {
    border-color: var(--accent);
}

.openwith-apps {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    padding: 4px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-head);
}

.openwith-note {
    padding: 8px 10px;
    color: var(--text-secondary);
    font-size: 0.92em;
}

.openwith-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font-size: var(--dialog-font-size);
    text-align: left;
    cursor: pointer;
}

.openwith-item:hover,
.openwith-item.is-active {
    background: var(--selected);
    color: var(--accent);
}

.openwith-name {
    flex: 0 0 auto;
}

.openwith-badge {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 0.82em;
}

.openwith-path {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 0.86em;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.openwith-remember {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 0.94em;
    cursor: pointer;
}

.openwith-remember input:disabled + span {
    opacity: 0.5;
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

.btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
}

.btn.is-primary {
    border-color: var(--accent);
    color: var(--accent);
}

.btn:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>
