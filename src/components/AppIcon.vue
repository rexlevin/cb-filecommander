<template>
    <svg
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
    size: { type: [Number, String], default: 16 }
});

const markup = computed(() => ICONS[props.name] || ICONS.file);
</script>

<style scoped>
.app-icon {
    display: block;
    flex: 0 0 auto;
    overflow: visible;
}
</style>
