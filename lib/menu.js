/**
 * 原生菜单
 *
 * 只有应用级命令（退出、设置）注册 accelerator；其余快捷键仅作为文案展示，
 * 按键由渲染层统一分发，避免输入框内的 Ctrl+C/Ctrl+A 被菜单劫持。
 */

const LABELS = {
    'zh-CN': {
        file: '文件', edit: '编辑', view: '查看', go: '转到', tools: '工具', help: '帮助',
        open: '打开', newTab: '新建标签', newFile: '新建文件', newFolder: '新建文件夹',
        rename: '重命名', closeTab: '关闭标签', exit: '退出',
        copy: '复制', cut: '剪切', paste: '粘贴', copyPath: '复制路径', selectAll: '全选',
        refresh: '刷新', showHidden: '显示隐藏文件', sort: '排序', sortName: '名称',
        sortSize: '大小', sortMtime: '修改时间', sortType: '类型', dirsFirst: '目录优先',
        columns: '显示列', theme: '主题', themeSystem: '跟随系统', themeLight: '浅色',
        themeDark: '深色', zoomIn: '放大', zoomOut: '缩小', zoomReset: '重置缩放',
        up: '上级', back: '后退', forward: '前进', pathBar: '路径栏',
        switchPane: '切换面板', focusLeft: '聚焦左面板', focusRight: '聚焦右面板',
        settings: '设置…', language: '语言', languageSystem: '跟随系统',
        languageZh: '简体中文', languageEn: 'English',
        shortcuts: '快捷键帮助', about: '关于 FileCommander'
    },
    'en-US': {
        file: 'File', edit: 'Edit', view: 'View', go: 'Go', tools: 'Tools', help: 'Help',
        open: 'Open', newTab: 'New Tab', newFile: 'New File', newFolder: 'New Folder',
        rename: 'Rename', closeTab: 'Close Tab', exit: 'Exit',
        copy: 'Copy', cut: 'Cut', paste: 'Paste', copyPath: 'Copy Path', selectAll: 'Select All',
        refresh: 'Refresh', showHidden: 'Show Hidden Files', sort: 'Sort By', sortName: 'Name',
        sortSize: 'Size', sortMtime: 'Modified', sortType: 'Type', dirsFirst: 'Directories First',
        columns: 'Columns', theme: 'Theme', themeSystem: 'Follow System', themeLight: 'Light',
        themeDark: 'Dark', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', zoomReset: 'Reset Zoom',
        up: 'Up', back: 'Back', forward: 'Forward', pathBar: 'Path Bar',
        switchPane: 'Switch Pane', focusLeft: 'Focus Left Pane', focusRight: 'Focus Right Pane',
        settings: 'Settings…', language: 'Language', languageSystem: 'Follow System',
        languageZh: '简体中文', languageEn: 'English',
        shortcuts: 'Keyboard Shortcuts', about: 'About FileCommander'
    }
};

// 菜单文案里的快捷键只是展示，不注册为 accelerator
function withShortcut(label, shortcut) {
    return `${label}    ${shortcut}`;
}

function buildMenu({ locale, settings, handlers }) {
    const M = LABELS[locale] || LABELS['en-US'];
    const command = (action) => () => handlers.command(action);

    const template = [
        {
            label: M.file,
            submenu: [
                { label: withShortcut(M.open, 'Enter'), click: command('file.open') },
                { label: withShortcut(M.newTab, 'Ctrl+T'), click: command('tab.new') },
                { label: withShortcut(M.newFile, 'Shift+F4'), enabled: false, click: command('file.newFile') },
                { label: withShortcut(M.newFolder, 'F7'), enabled: false, click: command('file.newFolder') },
                { label: withShortcut(M.rename, 'F2'), enabled: false, click: command('file.rename') },
                { type: 'separator' },
                { label: withShortcut(M.closeTab, 'Ctrl+W'), click: command('tab.close') },
                { type: 'separator' },
                { label: M.exit, accelerator: 'CmdOrCtrl+Q', click: () => handlers.quit() }
            ]
        },
        {
            label: M.edit,
            submenu: [
                { label: withShortcut(M.copy, 'Ctrl+C'), enabled: false, click: command('edit.copy') },
                { label: withShortcut(M.cut, 'Ctrl+X'), enabled: false, click: command('edit.cut') },
                { label: withShortcut(M.paste, 'Ctrl+V'), enabled: false, click: command('edit.paste') },
                { label: withShortcut(M.copyPath, 'Ctrl+Shift+C'), enabled: false, click: command('edit.copyPath') },
                { label: withShortcut(M.selectAll, 'Ctrl+A'), click: command('edit.selectAll') }
            ]
        },
        {
            label: M.view,
            submenu: [
                { label: withShortcut(M.refresh, 'Ctrl+R'), click: command('view.refresh') },
                {
                    label: M.showHidden,
                    type: 'checkbox',
                    checked: !!settings.showHidden,
                    click: (item) => handlers.setSetting('showHidden', item.checked)
                },
                {
                    label: M.sort,
                    submenu: [
                        { label: M.sortName, click: command('view.sort.name') },
                        { label: M.sortSize, click: command('view.sort.size') },
                        { label: M.sortMtime, click: command('view.sort.mtime') },
                        { label: M.sortType, click: command('view.sort.type') },
                        { type: 'separator' },
                        {
                            label: M.dirsFirst, type: 'checkbox', checked: !!settings.dirsFirst,
                            click: (item) => handlers.setSetting('dirsFirst', item.checked)
                        }
                    ]
                },
                { label: M.columns, enabled: false, submenu: [] },
                {
                    label: M.theme,
                    submenu: [
                        {
                            label: M.themeSystem, type: 'radio', checked: settings.theme === 'system',
                            click: () => handlers.setSetting('theme', 'system')
                        },
                        {
                            label: M.themeLight, type: 'radio', checked: settings.theme === 'light',
                            click: () => handlers.setSetting('theme', 'light')
                        },
                        {
                            label: M.themeDark, type: 'radio', checked: settings.theme === 'dark',
                            click: () => handlers.setSetting('theme', 'dark')
                        }
                    ]
                },
                { type: 'separator' },
                { label: withShortcut(M.zoomIn, 'Ctrl+='), click: () => handlers.zoom('in') },
                { label: withShortcut(M.zoomOut, 'Ctrl+-'), click: () => handlers.zoom('out') },
                { label: withShortcut(M.zoomReset, 'Ctrl+0'), click: () => handlers.zoom('reset') }
            ]
        },
        {
            label: M.go,
            submenu: [
                { label: withShortcut(M.up, 'Backspace'), click: command('go.up') },
                { label: withShortcut(M.back, 'Alt+←'), click: command('go.back') },
                { label: withShortcut(M.forward, 'Alt+→'), click: command('go.forward') },
                { label: withShortcut(M.pathBar, 'Ctrl+L'), click: command('go.pathBar') },
                { type: 'separator' },
                { label: withShortcut(M.switchPane, 'Tab'), click: command('pane.switch') },
                { label: withShortcut(M.focusLeft, 'Alt+1'), click: command('pane.focusLeft') },
                { label: withShortcut(M.focusRight, 'Alt+2'), click: command('pane.focusRight') }
            ]
        },
        {
            label: M.tools,
            submenu: [
                { label: M.settings, accelerator: 'CmdOrCtrl+,', click: command('app.settings') },
                {
                    label: M.language,
                    submenu: [
                        {
                            label: M.languageSystem, type: 'radio', checked: settings.locale === 'system',
                            click: () => handlers.setSetting('locale', 'system')
                        },
                        {
                            label: M.languageZh, type: 'radio', checked: settings.locale === 'zh-CN',
                            click: () => handlers.setSetting('locale', 'zh-CN')
                        },
                        {
                            label: M.languageEn, type: 'radio', checked: settings.locale === 'en-US',
                            click: () => handlers.setSetting('locale', 'en-US')
                        }
                    ]
                }
            ]
        },
        {
            label: M.help,
            submenu: [
                { label: withShortcut(M.shortcuts, 'F1'), click: command('help.shortcuts') },
                { type: 'separator' },
                { label: M.about, click: command('app.about') }
            ]
        }
    ];

    const { Menu } = require('electron');
    return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
