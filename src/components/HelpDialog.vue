<template>
    <AppModal :title="t('help.title')" :close-label="t('help.close')" wide @close="ui.closeHelp()">
        <div class="help-body">
            <ShortcutList />
        </div>
        <template #footer>
            <span>{{ t('help.hint') }}</span>
        </template>
    </AppModal>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';
import ShortcutList from './ShortcutList.vue';
import { useUiStore } from '@/stores/ui';

const { t } = useI18n();
const ui = useUiStore();
</script>

<style scoped>
.help-body {
    padding: 8px 20px 12px;
}
</style>
