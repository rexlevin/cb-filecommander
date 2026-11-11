/

# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.1.1] - 2026-11-11

### feat | 新功能 / Features

文件列表支持 doubleCommander 风格快速搜索：输入时底部弹出悬浮输入框，显示搜索内容和匹配计数；列表保持全量可见，上下键仅在匹配条目前缀范围内轮换；Enter / 双击 / Esc 均可关闭搜索框；支持退格修改、输入错误即时修正

File list now supports doubleCommander-style quick search: typing triggers a floating input bar at the bottom showing the query and match count; the full list remains visible while arrow keys navigate only among prefix-matched entries; Enter / double-click / Esc all close the search bar; backspace supports incremental correction

### build | 构建 / Build

更新 package.json 版本号至 0.1.1

Bump package.json version to 0.1.1

## [0.1.0] - 2026-11-10

### feat | 新功能 / Features

新增双面板文件浏览：左右面板独立、每侧最多 7 个标签、标签拖动排序、路径栏面包屑、位置下拉与驱动器/挂载点入口
新增高性能目录列表：两阶段加载、虚拟滚动、四列排序、多选模型与完整键盘导航，支持 10 万级条目目录
新增复制/移动任务队列：扫描、进度、速度、剩余时间、取消、冲突覆盖 / 跳过 / 重命名 / 全部应用、失败汇总，临时文件 + 原子重命名保证写入安全
新增新建文件夹、新建文件、重命名、删除到回收站与属性查看，包含平台文件名校验
新增内部剪贴板与系统文本路径互操作（含 `Ctrl+Shift+C` 复制绝对路径），支持面板间拖拽、拖出到系统文件管理器、从系统拖入
新增快速筛选、类型定位、右键菜单，以及 Enter / 双击调用系统默认程序打开文件（可执行文件二次确认、失败提示）
新增设置页（外观 / 字体 / 行为 / 列 / 会话 / 快捷键 / 关于）、`F1` 快捷键帮助、主题切换、界面缩放与字体调整
新增中英双语界面，默认跟随系统语言，可在「工具 → 语言」中切换

Add dual-pane browsing: independent panes, up to 7 tabs per pane, tab drag reordering, breadcrumb path bar, places menu and drives/mounts
Add a high-performance listing: two-phase loading, virtual scrolling, four sortable columns, multi-selection and full keyboard navigation for folders with 100k+ entries
Add a copy/move task queue: scanning, progress, speed, ETA, cancel, overwrite / skip / rename / apply-to-all conflict handling, failure summary, and temp-file + atomic rename for safe writes
Add new folder, new file, rename, move to trash and properties, including platform-specific name validation
Add internal clipboard with system path-text interop (`Ctrl+Shift+C` to copy absolute paths), drag between panes, drag out to the system file manager, and drag in from the system
Add quick filter, type-ahead, context menu, and open-with-system-default via Enter / double-click (with executable confirmation and clear failure messages)
Add a settings dialog (Appearance / Fonts / Behavior / Columns / Session / Shortcuts / About), `F1` shortcut help, theme switching, interface zoom and font controls
Add English and Simplified Chinese UI, following the system language by default and switchable via Tools → Language

### build | 构建 / Build

新增 GitHub Actions Release 工作流：推送 `v*` 标签时自动构建 `app.asar`、打包 CanBox zip 并发布到 GitHub Release

Add a GitHub Actions Release workflow: pushing a `v*` tag builds `app.asar`, packs the CanBox zip and publishes it to GitHub Releases

### docs | 文档 / Documentation

新增中英双语 README 与界面截图

Add a bilingual README with screenshots
