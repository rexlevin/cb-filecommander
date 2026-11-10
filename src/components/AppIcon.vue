<template>
    <img
        v-if="dataUrl"
        class="app-icon app-icon-img"
        :width="size"
        :height="size"
        :src="dataUrl"
        :alt="name"
        aria-hidden="true"
        draggable="false"
    />
    <svg
        v-else
        class="app-icon"
        :width="size"
        :height="size"
        viewBox="0 0 16 16"
        aria-hidden="true"
        v-html="markup"
    ></svg>
</template>

<script setup>
import { computed } from 'vue';
import { ICONS } from '@/utils/icons';

const props = defineProps({
    name: { type: String, default: 'file' },
    size: { type: [Number, String], default: 16 },
    /** 系统原生图标 dataURL（从主进程 getFileIcons 返回） */
    dataUrl: { type: String, default: null }
});

const markup = computed(() => ICONS[props.name] || ICONS.file);
</script>

<style scoped>
.app-icon {
    display: block;
    flex: 0 0 auto;
    overflow: visible;
}

.app-icon-img {
    /* 系统图标自带颜色，不受 currentColor 影响 */
    image-rendering: auto;
}
</style>
