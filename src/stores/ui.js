import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 浮层状态：设置与快捷键帮助同时只存在一个。
 */
export const useUiStore = defineStore('ui', () => {
    const settingsOpen = ref(false);
    const settingsSection = ref('appearance');
    const helpOpen = ref(false);

    function openSettings(section = 'appearance') {
        settingsSection.value = section;
        helpOpen.value = false;
        settingsOpen.value = true;
    }

    function closeSettings() {
        settingsOpen.value = false;
    }

    function openHelp() {
        settingsOpen.value = false;
        helpOpen.value = true;
    }

    function closeHelp() {
        helpOpen.value = false;
    }

    return {
        settingsOpen, settingsSection, helpOpen,
        openSettings, closeSettings, openHelp, closeHelp
    };
});
