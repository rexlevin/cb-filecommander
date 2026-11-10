/**
 * 快捷键帮助条目。
 *
 * F1 帮助与设置页共用，避免两处文案分叉。
 * keys 中的 ` / ` 表示同一行为的多个按键，渲染为多个 <kbd>。
 */
export const SHORTCUT_GROUPS = [
    {
        title: 'help.groupPanel',
        items: [
            { keys: 'Tab', label: 'help.panelSwitch' },
            { keys: 'Alt+1', label: 'help.panelLeft' },
            { keys: 'Alt+2', label: 'help.panelRight' }
        ]
    },
    {
        title: 'help.groupNav',
        items: [
            { keys: 'Enter', label: 'help.navEnter' },
            { keys: 'Backspace', label: 'help.navUp' },
            { keys: 'Alt+←', label: 'help.navBack' },
            { keys: 'Alt+→', label: 'help.navForward' },
            { keys: 'Ctrl+L', label: 'help.navPath' },
            { keys: 'Ctrl+R', label: 'help.navRefresh' },
            { keys: 'Ctrl+H', label: 'help.navHidden' }
        ]
    },
    {
        title: 'help.groupSelect',
        items: [
            { keys: '↑ / ↓', label: 'help.selFocus' },
            { keys: 'PageUp / PageDown', label: 'help.selPage' },
            { keys: 'Home / End', label: 'help.selHomeEnd' },
            { keys: 'Shift+↑ / Shift+↓', label: 'help.selExtend' },
            { keys: 'Ctrl+A', label: 'help.selAll' },
            { keys: 'Ctrl+Shift+A', label: 'help.selNone' },
            { keys: 'Space', label: 'help.selToggle' },
            { keys: 'Insert', label: 'help.selToggleNext' }
        ]
    },
    {
        title: 'help.groupTab',
        items: [
            { keys: 'Ctrl+T', label: 'help.tabNew' },
            { keys: 'Ctrl+W', label: 'help.tabClose' },
            { keys: 'Ctrl+Tab', label: 'help.tabNext' },
            { keys: 'Ctrl+Shift+Tab', label: 'help.tabPrev' },
            { keys: 'Ctrl+PgDn', label: 'help.tabNext' },
            { keys: 'Ctrl+PgUp', label: 'help.tabPrev' },
            { keys: 'Ctrl+Shift+PgUp', label: 'help.tabMoveLeft' },
            { keys: 'Ctrl+Shift+PgDn', label: 'help.tabMoveRight' }
        ]
    },
    {
        title: 'help.groupView',
        items: [
            { keys: 'Ctrl+=', label: 'help.viewIn' },
            { keys: 'Ctrl+-', label: 'help.viewOut' },
            { keys: 'Ctrl+0', label: 'help.viewReset' }
        ]
    },
    {
        title: 'help.groupApp',
        items: [
            { keys: 'Ctrl+,', label: 'help.appSettings' },
            { keys: 'F1', label: 'help.appHelp' },
            { keys: 'Ctrl+Q', label: 'help.appQuit' }
        ]
    }
];

/** 把 `Ctrl+Shift+PgUp / Ctrl+Shift+PgDn` 拆成按键数组 */
export function splitKeys(keys) {
    return String(keys).split(' / ').filter(Boolean);
}
