import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import i18n from './i18n';
import { boot } from './bootstrap';
import { useSettingsStore } from './stores/settings';
import { usePanesStore } from './stores/panes';
import './style.css';

i18n.global.locale.value = boot.locale;

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(i18n);

const settings = useSettingsStore();
settings.hydrate(boot);

const panes = usePanesStore();
panes.hydrate(boot.session);

settings.bindEvents();
app.mount('#app');
