import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';

// 首帧语言：优先使用设置镜像（避免闪烁），否则跟随系统
const mode = localStorage.getItem('filecommander-locale-mode') || 'system';
const startLocale = mode === 'zh-CN' || mode === 'en-US'
    ? mode
    : (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');

export default createI18n({
    legacy: false,
    locale: startLocale,
    fallbackLocale: 'en-US',
    messages: {
        'zh-CN': zhCN,
        'en-US': enUS
    }
});
