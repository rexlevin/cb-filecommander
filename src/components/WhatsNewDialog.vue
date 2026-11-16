<template>
    <AppModal :title="t('whatsNew.title')" :close-label="t('whatsNew.dismiss')" compact @close="close">
        <div class="wn-body">
            <p class="wn-subtitle">{{ t('whatsNew.subtitle', { version: currentVersion }) }}</p>
            <section v-for="section in renderedSections" :key="section.version" class="wn-section">
                <h3 class="wn-version">
                    <span>v{{ section.version }}</span>
                    <span v-if="section.date" class="wn-date">{{ section.date }}</span>
                </h3>
                <template v-for="(block, index) in section.blocks" :key="index">
                    <h4 v-if="block.type === 'h'" class="wn-heading">{{ block.text }}</h4>
                    <p v-else class="wn-line">{{ block.text }}</p>
                </template>
            </section>
        </div>
        <template #footer>
            <span class="spacer"></span>
            <button class="btn" @click="close">{{ t('whatsNew.dismiss') }}</button>
        </template>
    </AppModal>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import { useUiStore } from '@/stores/ui';

// 升级后首次启动的“更新内容”弹窗。
// 版本判定与已读记录由 canbox-core 的 whatsNew 服务负责，
// 内容来自 APP 根目录的 CHANGELOG.md（与 package.json 同级）。

const api = window.filecommander;
const { t, locale } = useI18n();
const ui = useUiStore();

const currentVersion = computed(() => (ui.whatsNew && ui.whatsNew.currentVersion) || '');
const CJK_RE = /[\u4e00-\u9fa5]/;
const HEADING_RE = /^(#{1,6}\s*)(.*?)\s*\/\s*(.+)$/;

/**
 * CHANGELOG 每个条目“中文一行、英文一行”成对书写，按当前语言筛选。
 * 分类标题中英并存（如 "### feat | 新功能 / Features"），非中文时取斜杠后的英文。
 */
function localizeBody(body) {
    const isZh = String(locale.value || '').toLowerCase().startsWith('zh');
    const out = [];
    for (const line of String(body || '').split('\n')) {
        if (!line.trim()) {
            out.push('');
            continue;
        }
        if (CJK_RE.test(line) === isZh) {
            out.push(line);
        } else if (/^#{1,6}\s/.test(line)) {
            out.push(isZh ? line : line.replace(HEADING_RE, '$1$3'));
        }
    }
    return out.join('\n');
}

/** 极简 markdown 转块结构：只处理标题、列表项与普通段落，避免引入渲染依赖 */
function toBlocks(body) {
    const blocks = [];
    for (const raw of localizeBody(body).split('\n')) {
        const text = raw.trim();
        if (!text) continue;
        const heading = text.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            blocks.push({ type: 'h', text: heading[2] });
        } else {
            blocks.push({ type: 'p', text: text.replace(/^[-*]\s+/, '') });
        }
    }
    return blocks;
}

const renderedSections = computed(() => {
    const sections = (ui.whatsNew && ui.whatsNew.sections) || [];
    return sections.map(section => ({ ...section, blocks: toBlocks(section.body) }));
});

function close() {
    const version = currentVersion.value;
    ui.closeWhatsNew();
    // 记录已读；失败时下次启动再提示一次，不打扰用户
    if (api.whatsNew) api.whatsNew.ack(version).catch(() => {});
}
</script>

<style scoped>
.wn-body {
    padding: 12px 20px 16px;
}

.wn-subtitle {
    margin: 0 0 12px;
    color: var(--text-secondary);
    font-size: 0.95em;
}

.wn-section + .wn-section {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
}

.wn-version {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 6px;
    color: var(--accent);
    font-size: 1em;
    font-weight: 600;
}

.wn-date {
    color: var(--text-secondary);
    font-size: 0.86em;
    font-weight: 400;
}

.wn-heading {
    margin: 10px 0 4px;
    font-size: 0.95em;
    font-weight: 600;
}

.wn-line {
    margin: 4px 0;
    line-height: 1.65;
    word-break: break-word;
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
</style>
