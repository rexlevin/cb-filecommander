/

# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.1.5] - 2026-11-13

### feat | 新功能 / Features

同一 tab 内复制粘贴时直接生成 copy1_原文件名、copy2_原文件名 副本，不再弹出信息拥挤的冲突选择框

Copy-paste within the same tab now creates copy1_name, copy2_name copies directly instead of showing a crowded conflict dialog

返回上一级后自动将刚离开的目录设为选中状态，Delete、F5、F6、Alt+Enter、Ctrl+C 等操作可直接生效

The directory you just left is now actually selected after going up, so Delete, F5, F6, Alt+Enter and Ctrl+C work immediately

### fix | 问题修复 / Bug Fixes

修复 .asar 文件被当作目录展开、复制和移动异常的问题，文件操作改用 original-fs

Fix .asar archives being treated as directories and failing on copy/move by using original-fs for file operations

修复同一目录内移动会先删除源文件、存在丢失风险的问题，现在直接跳过

Fix in-directory move deleting the source file first and risking data loss; it is now a no-op

### style | 样式 / Styling

重做 logo 为接近满版的构图，四周仅保留约 2.3% 边距，参考 Double Commander 的图标风格

Rework the logo into a nearly full-bleed composition with only ~2.3% margin, following Double Commander's icon style

## [0.1.4] - 2026-11-11

### fix | 问题修复 / Bug Fixes

修复 Shift+F4 被误判为 F4（外部编辑器打开），导致无法新建文件并提示"请先选择文件或文件夹"的问题

Fix Shift+F4 being treated as plain F4 (open with external editor), which blocked new-file creation and showed "please select a file or folder"

### style | 样式 / Styling

活动面板的地址栏增加强调色淡底，强化聚焦标识

Add accent-tinted background to the active pane's path bar for a clearer focus indicator

快速搜索输入框由悬浮覆盖改为占用独立行，长文件列表时不再遮挡最后一行

Quick search bar now occupies its own row instead of overlaying the list, so the last row is no longer obscured in long file lists

## [0.1.3] - 2026-11-11

### feat | 新功能 / Features

新增 F9 快捷键打开当前激活 tab 所在目录的终端，可在设置中指定外部终端程序（未指定时自动检测系统默认终端）

Add F9 shortcut to open terminal in the active tab's directory, with configurable external terminal setting (auto-detects system default when unspecified)

新增行高自动跟随文件面板字号的设置项，字号变更时行高自适应调整

Add auto-follow row height option for file panel font size — row height adjusts automatically when font size changes

为 openDir 新增加载完成后自动聚焦指定 entry 的功能，goUp/goBack/goForward 导航时自动聚焦刚离开的目录

Add focusOnEntry option to openDir — goUp/goBack/goForward navigation auto-focuses the entry just navigated away from

新增跨平台系统级复制（cp -a / robocopy）和删除（rm -rf / rmdir /s）方法，替代 Node.js 逐文件流式操作，解决跨分区移动失败、权限丢失等问题

Add cross-platform system-level copy (cp -a / robocopy) and delete (rm -rf / rmdir /s) to replace Node.js streaming ops, fixing cross-device move failures and permission loss

### fix | 问题修复 / Bug Fixes

修复同分区复制文件时可执行权限丢失，copyFile 新增 chmod 保留源文件 mode

Fix executable permission loss on same-device copy — copyFile now preserves source mode via chmod

修复目录切换后快速搜索无法聚焦命中项的竞态问题

Fix quick search race condition after directory switch where matches couldn't be focused

修复粘贴无反应（IPC 结构化克隆拒绝 Pinia Proxy）、剪切粘贴报"路径无效"（cut→move 映射缺失）、刷新不恢复剪切变色等问题

Fix paste silently failing (IPC structured clone rejecting Pinia Proxy), cut-paste showing "invalid path" (missing cut→move mapping), and refresh not clearing cut visual markers

### perf | 性能优化 / Performance

优化文件目录变化监听防抖时间从 500ms 降至 200ms，文件变更后面板刷新更快

Reduce directory watch debounce from 500ms to 200ms for faster panel refresh after file changes

### chore | 维护 / Maintenance

更新版本号至 0.1.3

Bump version to 0.1.3

## [0.1.2] - 2026-11-11

### feat | 新功能 / Features

F4 快捷键使用外部编辑器打开文件，可在设置的"行为"分区配置编辑器路径（留空回退系统默认）
右键菜单新增"用外部编辑器打开"入口
剪贴板粘贴操作增加成功与失败提示，错误可见

F4 opens the focused file with an external editor, configurable in Settings > Behavior (falls back to system default when empty)
Context menu gains an "Open with External Editor" entry
Paste operations now show success/failure toasts with visible errors

### fix | 问题修复 / Bug Fixes

修复 Ctrl+V 与右键粘贴完全无反应的问题（IPC 响应式对象无法克隆导致静默失败）
修复剪切粘贴报"路径无效"的问题（剪贴板 cut 模式未映射为传输操作 move）
修复剪切后文件变色、Ctrl+R 或"刷新"后无法恢复原色的问题
修复属性对话框传参可能失败的问题

Fixed paste (Ctrl+V / context menu) doing nothing due to IPC structured-clone failure on reactive objects
Fixed "invalid path" error on cut-paste caused by clipboard cut mode not being mapped to the move operation
Fixed cut highlighting not being restored after Ctrl+R or menu refresh
Fixed a potential parameter passing failure in the properties dialog

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
