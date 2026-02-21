# Deco UI Vocabulary / UI 术语表

A bilingual (English-Chinese) glossary of all UI terms used in the Deco desktop app.
Intended for team communication between Jingxi and Metro.

> **How to use:** When discussing a UI element, use the **English Name** as the canonical term.
> The **Code ID/Class** column links directly to the implementation so either team member
> can locate the element in source code.

---

## 1. Pages / 页面

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Home Screen | 主页 / 首页 | Landing page shown when no project is open; displays logo, actions, and recent projects | `#home-screen` |
| Canvas View | 画布视图 | The main board workspace where cards are laid out on an infinite PixiJS canvas | `#main` (without `.home-view`) |
| Settings Page | 设置页 | Modal dialog for configuring AI providers, paths, compression, and web collection | `#settings-page` |

---

## 2. Top-Level Layout / 顶层布局

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| App Shell | 应用外壳 | Root container holding toolbar, sidebar, main area, and status bar | `#app` |
| App Content | 内容区 | Flex row containing app sidebar + main area | `#app-content` |
| Main Area | 主区域 | Houses either the Home Screen or the Canvas View with tool sidebar | `#main` |

---

## 3. Native Menu Bar / 原生菜单栏

Tauri native macOS menu bar, replacing the old HTML-based statusbar/toolbar file dropdowns. Built in `desktop/src-tauri/src/lib.rs` using `MenuBuilder` + `SubmenuBuilder`. Menu events are emitted to the frontend via `app.emit("menu-event", id)` and listened for in `desktop/src/main.js`.

| English Name | Chinese Name | Description | Code Reference |
|---|---|---|---|
| Deco Menu | Deco 菜单 | App menu with About, Services, Hide, Show All, Quit | `SubmenuBuilder::new(app, "Deco")` |
| File Menu | 文件菜单 | New Board, Open Folder, Close Window | `SubmenuBuilder::new(app, "File")` |
| New Board | 新建画板 | Creates a new empty board project | menu id `"new-board"` |
| Open Folder | 打开文件夹 | Opens a folder picker to load an image directory | menu id `"open-folder"` |
| Edit Menu | 编辑菜单 | Standard Undo, Redo, Cut, Copy, Paste, Select All | `SubmenuBuilder::new(app, "Edit")` |
| View Menu | 视图菜单 | Toggle Sidebar, Zoom In/Out, Actual Size | `SubmenuBuilder::new(app, "View")` |
| Toggle Sidebar (Menu) | 切换侧边栏(菜单) | Shows/hides the App Sidebar from the View menu | menu id `"toggle-sidebar"` |
| Zoom In (Menu) | 放大(菜单) | Increases canvas zoom from the View menu | menu id `"zoom-in"` |
| Zoom Out (Menu) | 缩小(菜单) | Decreases canvas zoom from the View menu | menu id `"zoom-out"` |
| Actual Size (Menu) | 实际大小(菜单) | Resets zoom to 100% from the View menu | menu id `"zoom-reset"` |
| Window Menu | 窗口菜单 | Standard Minimize, Maximize, Fullscreen | `SubmenuBuilder::new(app, "Window")` |

---

## 4. Toolbar / 工具栏 (Title Bar)

The macOS-style title bar at the top of the window. Supports window dragging. Contains only the Home button and Sidebar Toggle; file actions have moved to the native menu bar (see section 3).

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Toolbar | 标题工具栏 | Top bar (38px) with macOS drag region, home button, and sidebar toggle | `#toolbar` |
| Home Button | 主页按钮 | Returns to the Home Screen from Canvas View | `#toolbar-home-btn` / `.toolbar-icon-btn` |
| Sidebar Toggle | 侧边栏开关 | Shows/hides the App Sidebar (navigation panel) | `#toolbar-sidebar-toggle` / `.toolbar-icon-btn` |

---

## 5. App Sidebar / 应用侧边栏 (Navigation)

The left navigation panel (200px) with settings and help links.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| App Sidebar | 应用侧边栏 | Left navigation panel with preferences section; collapsible | `#app-sidebar` |
| Sidebar Nav | 侧边导航 | Navigation item container inside app sidebar | `.app-sidebar-nav` |
| Sidebar Nav Item | 侧边导航项 | Individual clickable navigation entry (e.g., Settings, Help) | `.app-sidebar-nav-item` |
| Sidebar Label | 侧边标签 | Section header text (e.g., "Preferences") | `.app-sidebar-label` |
| Settings Button | 设置按钮 | Opens the Settings Page modal | `#sidebar-settings-btn` |
| Help & Support Button | 帮助与支持按钮 | Opens the keyboard hints overlay (`#hints-overlay`); located in `.app-sidebar-bottom`. Wired in `main.js` | `#sidebar-help-btn` |
| Sidebar Bottom | 侧边底部 | Bottom section of sidebar separated by a border | `.app-sidebar-bottom` |

---

## 6. Tool Sidebar / 工具侧边栏 (Tool Palette)

The narrow left-side toolbar (40px) with drawing/selection tools. Only visible in Canvas View.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Tool Sidebar | 工具侧栏 | Vertical palette of canvas tools (select, hand, shapes, etc.) | `#sidebar` |
| Tool Button | 工具按钮 | Individual tool icon button in the palette | `.sidebar-btn` |
| Select Tool | 选择工具 | Default pointer tool for selecting and moving cards (V) | `.sidebar-btn[title="Select (V)"]` |
| Hand Tool | 抓手工具 | Pans the canvas without selecting (H) | `.sidebar-btn[title="Hand (H)"]` |
| Rect Tool | 矩形工具 | Draws a rectangle shape annotation (R) | `.sidebar-btn[title="Rect (R)"]` |
| Ellipse Tool | 椭圆工具 | Draws an ellipse shape annotation (O) | `.sidebar-btn[title="Ellipse (O)"]` |
| Line Tool | 线段工具 | Draws a straight line annotation (L) | `.sidebar-btn[title="Line (L)"]` |
| Text/Note Tool | 文字工具 | Creates a text note on canvas (T) | `.sidebar-btn[title="Note (T)"]` |
| Connect Tool | 连线工具 | Draws connections/arrows between cards (C) | `.sidebar-btn[title="Connect (C)"]` |
| Web Collection Button | 网页采集按钮 | Opens the Web Collection panel | `#web-sidebar-btn` |
| Tags Button | 标签按钮 | Opens the Tag Filter Sidebar | `#tag-sidebar-btn` |

---

## 7. Canvas / 画布

The infinite PixiJS WebGL canvas where all cards, shapes, and text are rendered.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Canvas Container | 画布容器 | DOM wrapper around the PixiJS `<canvas>` element | `#canvas-container` |
| World | 世界坐标 | PixiJS Container holding all canvas objects; transforms for pan/zoom | `state.world` |
| Viewport | 视口 | Current pan offset (x, y) and zoom scale of the canvas | `state.viewport` |
| Grid | 网格 | Background grid lines drawn on the canvas | `state.gridGfx` |
| Minimap | 小地图 | Thumbnail overview of the entire board shown in corner | `state.minimapGfx` |
| Selection Rectangle | 框选矩形 | Blue rectangle drawn while drag-selecting multiple items | `state.selectRectGfx` |
| Snap Guides | 对齐辅助线 | Pink alignment lines that appear when dragging near other cards | `state.guideGfx` |
| Loading Indicator | 加载指示器 | Centered message shown while scanning/loading images | `#loading-indicator` |

---

## 8. Canvas Elements / 画布元素

Objects placed on the infinite canvas.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Card | 卡片 | Generic term for any object on the canvas (image, text, or shape) | `state.allCards[]` |
| Image Card | 图片卡片 | A card displaying an imported image with thumbnail and metadata | Card where `!isText && !isShape` |
| Text Note | 文字标注 | An editable text block placed on the canvas | Card where `isText === true` |
| Shape | 图形 | A geometric annotation (rectangle, ellipse, or line) | Card where `isShape === true` |
| Rectangle | 矩形 | Rectangle shape annotation drawn with the Rect tool | `shapeType: 'rect'` |
| Ellipse | 椭圆 | Ellipse shape annotation drawn with the Ellipse tool | `shapeType: 'ellipse'` |
| Line | 线段 | Straight line annotation drawn with the Line tool | `shapeType: 'line'` |
| Connection | 连线 | An arrow/line linking two cards together | `state.allConnections[]` |
| Connection Port | 连接端口 | Hover targets on card edges for starting/ending connections | `state.connectionPortGfx` |
| Group | 编组 | A collection of cards grouped together; moves/selects as a unit | `state.allGroups[]` |
| Selection Border | 选中边框 | Blue outline shown around selected cards | `card.selectionBorder` |
| Resize Handle | 缩放手柄 | Small square handle for resizing cards/shapes | `state.resizeHandleGfx` |
| Frame (Mask) | 画框 (裁剪) | Image card resized with PixiJS mask to crop rather than stretch | PixiJS mask on sprite |

### Canvas Constants / 画布常量

| English Name | Chinese Name | Description | Code Constant |
|---|---|---|---|
| Card Max Width | 卡片最大宽度 | Maximum default width of an image card (220px) | `CARD_MAX_WIDTH = 220` |
| Card Padding | 卡片内边距 | Internal padding around card content (6px) | `CARD_PADDING = 6` |
| Card Radius | 卡片圆角 | Border radius of card containers (8px) | `CARD_RADIUS = 8` |
| Shape Default Color | 图形默认颜色 | Default annotation color (blue, `0x4a9eff`) | `SHAPE_DEFAULT_COLOR` |
| Snap Threshold | 吸附阈值 | Pixel distance for snap guides to activate (5px) | `SNAP_THRESHOLD = 5` |
| Minimap Size | 小地图尺寸 | Minimap dimensions (180x120px, 12px margin) | `MINIMAP` |
| Max Undo Steps | 最大撤销步数 | Maximum undo history length (100) | `MAX_UNDO = 100` |

---

## 9. Floating Toolbar / 浮动工具栏

Context-aware toolbar that appears above the current selection.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Floating Toolbar | 浮动工具栏 | Glassmorphism toolbar positioned above selected items | `#floating-toolbar` |
| Lock Button | 锁定按钮 | Locks/unlocks selected cards to prevent accidental moves | `#ftb-lock` |
| Dash Toggle | 虚线切换 | Switches shape/line between solid and dashed stroke | `#ftb-dash` |
| Fill Toggle | 填充切换 | Toggles fill on/off for shape annotations | `#ftb-fill-toggle` |
| Stroke Button | 线宽按钮 | Opens stroke width picker popup (1-8px) | `#ftb-stroke-btn` |
| Color Button | 颜色按钮 | Opens color swatch picker popup (10 colors) | `#ftb-color-btn` |
| Color Indicator | 颜色指示器 | Small circle showing current active color | `#ftb-color-indicator` / `.ftb-color-indicator` |
| Font Size Button | 字号按钮 | Opens font size picker popup (12-36pt) | `#ftb-font-size` |
| Bold Button | 加粗按钮 | Toggles bold on text annotations | `#ftb-bold` |
| Italic Button | 斜体按钮 | Toggles italic on text annotations | `#ftb-italic` |
| Align Button | 对齐按钮 | Opens alignment submenu (left/center/right/top/bottom/distribute) | `#ftb-align` |
| Copy Button | 复制按钮 | Duplicates selected cards | `#ftb-copy` |
| Delete Button | 删除按钮 | Removes selected cards from canvas | `#ftb-delete` |
| Analyze Button | 分析按钮 | Triggers batch AI analysis on selected images | `#ftb-analyze` |
| More Button | 更多按钮 | Opens additional actions for image cards | `#ftb-more` |
| Color Popup | 颜色弹窗 | Popup panel showing 10 color swatches | `#ftb-color-popup` |
| Color Swatch | 颜色色块 | Individual clickable color circle in the popup | `.ftb-swatch` |
| Stroke Popup | 线宽弹窗 | Popup panel with stroke width options (1-8px) | `#ftb-stroke-popup` |
| Font Size Popup | 字号弹窗 | Popup panel with font size options (12-36) | `#ftb-font-size-popup` |
| Alignment Submenu | 对齐子菜单 | Submenu with align left/center/right/top/bottom + distribute | `#ftb-align-submenu` |
| Separator | 分隔线 | Vertical divider between button groups | `.ftb-separator` |

---

## 10. Properties Bar / 属性栏

Secondary bar for detailed property editing (stroke width, font size, opacity).

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Properties Bar | 属性栏 | Floating bar below toolbar for stroke/font/opacity controls | `#props-bar` |
| Stroke Group | 线宽组 | Stroke width dropdown for shapes | `#props-stroke` |
| Font Group | 字体组 | Font size dropdown for text notes | `#props-font` |
| Opacity Group | 透明度组 | Opacity slider (10-100%) for any selected card | `#props-opacity` |
| Opacity Slider | 透明度滑块 | Range input controlling card transparency | `#props-opacity-slider` |

---

## 11. Home Screen / 主页

The landing page displayed when no project is open.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Home Hero | 主页头部 | Logo ("Deco") and tagline area at top of home screen | `.home-hero` |
| Home Logo | 主页标志 | App name displayed large | `.home-logo` |
| Home Tagline | 主页标语 | "Visual reference board for creative projects" | `.home-tagline` |
| Home Body | 主页内容 | Max-width container for actions and project grid | `.home-body` |
| Get Started | 快速开始 | Section header above the action buttons | `.home-section-title` |
| Open Folder | 打开文件夹 | Action button to browse and open an image directory | `#home-open-btn` / `.home-action-btn` |
| New Project | 新建项目 | Action button to create an empty project | `#home-new-btn` / `.home-action-btn` |
| Recent Projects | 最近项目 | Section listing recently opened projects | `.home-recent` |
| Project Grid | 项目网格 | Grid layout of project cards (supports grid/list toggle) | `#home-project-list` / `.home-project-grid` |
| Project Card | 项目卡片 | Clickable card showing a project's thumbnail and metadata | `.home-project-card` |
| Project Thumbnail | 项目缩略图 | Preview image area in a project card (mosaic or single) | `.home-project-thumb` |
| Thumbnail Mosaic | 缩略图拼图 | 2x2 image grid showing project preview | `.home-thumb-mosaic` |
| Project Name | 项目名称 | Project title text in a project card | `.home-project-name` |
| Project Meta | 项目信息 | Image count and last-modified date below project name | `.home-project-meta` |
| Grid View Button | 网格视图按钮 | Switches recent projects to grid layout | `#home-grid-btn` |
| List View Button | 列表视图按钮 | Switches recent projects to list layout | `#home-list-btn` |
| View Toggle | 视图切换 | Container for grid/list toggle buttons | `.home-view-toggle` |
| Empty State | 空状态 | Placeholder shown when no recent projects exist | `.home-empty` |
| Create Board Card | 新建画板卡片 | First item in the project grid; dashed-border card (`border-style: dashed`) with centered + icon. Text reads "Create Board" with no subtitle. No divider line between thumbnail and info areas. Opens the New Project dialog on click | `.home-new-project-card` / `#home-new-card` |
| Create Board Icon | 新建画板图标 | Centered + icon inside the Create Board Card thumbnail area | `.home-new-project-icon` |

---

## 12. Right Panel / 右侧面板

Slide-in panel (300px) on the right side, used for AI suggestions and image metadata.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Right Panel | 右侧面板 | Shared container for Suggestion View and Metadata View | `#right-panel` |
| Panel Header | 面板标题栏 | Top bar with title and close button | `.panel-header` |
| Panel Body | 面板内容 | Scrollable content area | `.panel-body` |
| Panel Footer | 面板底栏 | Action buttons at the bottom of the panel | `.panel-footer` |
| Panel Close Button | 面板关闭按钮 | X button to dismiss the panel | `.panel-close-btn` |
| Panel Thumbnail | 面板缩略图 | Image preview at top of panel body | `.panel-thumb` |
| Panel Section | 面板区域 | Labeled group of related information (tags, style, etc.) | `.panel-section` |
| Section Label | 区域标签 | Uppercase label for a panel section (e.g., "TAGS") | `.panel-section-label` |

### Suggestion View / 建议视图

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Suggestion View | AI 建议视图 | Displays AI analysis results for review before accepting | `#suggestion-view` |
| Suggestion Thumbnail | 建议缩略图 | Preview of the analyzed image | `#suggestion-thumb` |
| Suggestion Description | 建议描述 | AI-generated text description of the image | `#suggestion-desc` |
| Suggestion Tags | 建议标签 | AI-generated tags (editable chips) | `#suggestion-tags` |
| Suggestion Styles | 建议风格 | AI-detected style keywords | `#suggestion-styles` |
| Suggestion Moods | 建议情绪 | AI-detected mood keywords | `#suggestion-moods` |
| Suggestion Colors | 建议颜色 | AI-detected dominant color swatches | `#suggestion-colors` |
| Suggestion Era | 建议年代 | AI-detected historical era/period | `#suggestion-era` |
| Accept All Button | 全部接受按钮 | Saves all AI suggestions to the card's metadata | `#accept-all-btn` |
| Dismiss Button | 忽略按钮 | Closes suggestion panel without saving | `#dismiss-suggestions-btn` |

### Metadata View / 元数据视图

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Metadata View | 图片详情视图 | Shows and edits metadata for a selected image card | `#metadata-view` |
| Meta Thumbnail | 详情缩略图 | Preview of the selected image | `#meta-thumb` |
| Filename | 文件名 | Image file name display | `#meta-filename` / `.meta-filename` |
| File Size | 文件大小 | Image file size in KB | `#meta-filesize` / `.meta-filesize` |
| Description Input | 描述输入框 | Editable textarea for image description | `#meta-desc-input` / `.meta-input` |
| Meta Tags | 元数据标签 | Editable tag chips for the image | `#meta-tags` |
| Meta Styles | 元数据风格 | Style keyword chips (read-only) | `#meta-styles` |
| Meta Colors | 元数据颜色 | Dominant color swatches | `#meta-colors` |
| Meta Era | 元数据年代 | Historical era text | `#meta-era` |
| Connections Section | 连接区域 | List of connected cards (incoming/outgoing arrows) | `#meta-connections-section` |
| Connection Item | 连接项 | Single entry showing a connected card name and direction | `.meta-connection-item` |
| AI Tag Button | AI 标签按钮 | Triggers AI analysis for the selected image | `#meta-analyze-btn` |
| Similar Button | 相似搜索按钮 | Finds visually similar images in the project via CLIP | `#meta-similar-btn` |
| Search Web Button | 网络搜索按钮 | Finds similar images online via Brave Search | `#meta-web-btn` |

---

## 13. Tag Filter Sidebar / 标签筛选侧栏

Slide-in panel (200px) between tool sidebar and canvas for filtering by tags.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Tag Sidebar | 标签侧栏 | Slide-in sidebar listing all tags with counts for filtering | `#tag-sidebar` |
| Tag Sidebar Header | 标签栏头部 | Header with "Tags" title and cluster button | `.tag-sidebar-header` |
| Cluster Button | 聚类按钮 | Runs CLIP-based visual clustering on all project images | `#cluster-btn` |
| Color Search | 颜色搜索 | Color picker + search button for finding images by dominant color | `.tag-sidebar-color-search` |
| Color Picker | 颜色选择器 | Native color input for color search | `#color-search-picker` |
| Color Search Button | 颜色搜索按钮 | Triggers image search by selected color | `#color-search-btn` |
| Tag List | 标签列表 | Scrollable list of all tags in the project | `#tag-list` |
| Tag Item | 标签项 | Clickable tag with name and count badge; toggles filter | `.tag-item` |
| Tag Label | 标签名 | Text content of a tag | `.tag-label` |
| Tag Count | 标签计数 | Number badge showing how many images have this tag | `.tag-count` |
| Clear Filters | 清除筛选 | Button to remove all active tag filters | `.tag-item.tag-clear` |

---

## 14. Find Bar / 查找栏

macOS-style floating search bar at the bottom of the canvas (Cmd+F).

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Find Bar | 查找栏 | Floating search bar for filtering cards by name/description/tags | `#find-bar` |
| Find Input | 查找输入框 | Text field for typing search queries | `#find-bar-input` |
| Find Count | 查找计数 | Shows "N of M" match count | `#find-bar-count` |
| AI Search Toggle | AI 搜索开关 | Button to switch between local and AI-powered semantic search | `#find-bar-ai` / `.find-bar-ai-btn` |
| Previous Button | 上一个按钮 | Navigate to previous match (Shift+Enter) | `#find-bar-prev` |
| Next Button | 下一个按钮 | Navigate to next match (Enter) | `#find-bar-next` |
| Find Close Button | 查找关闭按钮 | Closes the find bar (Esc) | `#find-bar-close` |

---

## 15. Search Results Panel / 搜索结果面板

Slide-in panel (280px) on the left side of the canvas showing search/similarity/cluster results.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Search Results Panel | 搜索结果面板 | Overlay panel showing text search, similarity, or cluster results | `#search-results-panel` |
| Results Header | 结果头部 | Title bar with "Results" and count | `.results-header` |
| Results Count | 结果计数 | Text showing number of results found | `#results-count` |
| Results List | 结果列表 | Scrollable list of result items | `#results-list` |
| Result Item | 结果项 | Single search result with thumbnail, name, description, and tags | `.result-item` |
| Result Thumbnail | 结果缩略图 | Small image preview in a result row | `.result-thumb` |
| Result Name | 结果名称 | Image filename in the result | `.result-name` |
| Result Description | 结果描述 | AI-generated description text | `.result-desc` |
| Result Tag | 结果标签 | Small tag chip in search results | `.result-tag` |

### Cluster Results / 聚类结果

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Cluster Section | 聚类区域 | A single cluster group in the results panel | `.cluster-section` |
| Cluster Header | 聚类标题 | Color dot + "Cluster N (M images)" label | `.cluster-header` |
| Cluster Dot | 聚类色点 | Colored circle identifying a cluster | `.cluster-dot` |
| Cluster Grid | 聚类网格 | Thumbnail grid showing images in a cluster | `.cluster-grid` |
| Cluster Thumbnail | 聚类缩略图 | Small clickable image in a cluster grid | `.cluster-thumb` |

---

## 16. Web Collection Panel / 网页采集面板

Slide-in panel (340px) for searching and downloading images from the web.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Web Panel | 网页采集面板 | Overlay panel for web image search and download | `#web-panel` |
| Web Panel Header | 采集面板头部 | Title bar with "Web Collection" and result count | `.web-panel-header` |
| Web Results Count | 网页结果计数 | Number of images found | `#web-results-count` |
| Web Search Input | 网页搜索输入框 | Text field for typing web image search queries | `#web-search-input` |
| Web Search Button | 网页搜索按钮 | Triggers Brave Image Search | `#web-search-btn` |
| Web Results Grid | 网页结果网格 | 2-column grid of web image result cards | `#web-results-grid` |
| Web Result Card | 网页结果卡片 | Single web image result with thumbnail, title, and download button | `.web-result-card` |
| Web Result Image | 网页结果图片 | Thumbnail image from web search | `.web-result-img` |
| Web Result Overlay | 网页结果浮层 | Hover overlay showing title, domain, dimensions, download button | `.web-result-overlay` |
| Web Result Title | 网页结果标题 | Image title from the source page | `.web-result-title` |
| Web Result Domain | 网页结果域名 | Source website domain | `.web-result-domain` |
| Download Button | 下载按钮 | Plus button to download a web image into the project | `.web-dl-btn` |
| Download All Button | 全部下载按钮 | Downloads all web results into the project | `#web-download-all-btn` |
| Web Loading | 网页加载 | Spinner shown while search is in progress | `#web-loading` |

---

## 17. Settings Page / 设置页

Modal dialog with a two-column layout: categories on the left, settings form on the right.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Settings Page | 设置页 | Full-screen modal overlay for app configuration | `#settings-page` |
| Settings Card | 设置卡片 | The centered dialog container (1040x800px) | `.settings-page-card` |
| Settings Left | 设置左栏 | Category navigation sidebar (200px) | `.settings-page-left` |
| Settings Right | 设置右栏 | Form area with header, body, and footer | `.settings-page-right` |
| Settings Category | 设置分类按钮 | Navigation button for a settings section | `.settings-cat` |
| Settings Breadcrumb | 设置面包屑 | "Settings > Category" path indicator | `#settings-breadcrumb` |
| Settings Panel | 设置面板 | Content panel for one settings category | `.settings-panel` |
| Settings Group | 设置组 | Label + input pair within a panel | `.settings-group` |
| Settings Label | 设置标签 | Form field label text | `.settings-label` |
| Settings Description | 设置描述 | Helper text below a label | `.settings-desc` |
| Settings Input | 设置输入框 | Text/number input field in settings | `.settings-input` |
| Settings Select | 设置下拉框 | Dropdown select field in settings | `.settings-select` |
| Save Button | 保存按钮 | Persists all settings to backend | `#settings-save-btn` |
| Settings Status | 设置状态 | Status message ("Settings saved." / error) | `#settings-status` |
| Settings Close | 设置关闭 | X button to close settings modal | `#settings-page-close` |

### General Settings / 通用设置

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| General Panel | 通用面板 | Projects folder and models folder configuration | `#settings-panel-general` |
| Projects Folder | 项目文件夹 | Default root folder for Deco projects | `#settings-projects-folder` |
| Models Folder | 模型文件夹 | Storage path for CLIP/ONNX models | `#settings-models-folder` |
| Browse Folder Button | 浏览文件夹按钮 | Opens native folder picker dialog | `#settings-browse-folder-btn` |
| Vision Model Options | 视觉模型选项 | Radio card group for choosing the local vision model (CLIP vs Grounding DINO + SAM) | `.vision-model-options` / `#settings-vision-model` |
| Vision Model Option | 视觉模型选项项 | A single `<label>` wrapping a hidden radio input and a visual card | `.vision-model-option` |
| Vision Model Card | 视觉模型卡片 | Bordered card that highlights with accent color when its radio is selected | `.vision-model-card` |
| Vision Model Title | 视觉模型标题 | Model name text (e.g., "CLIP", "Grounding DINO + SAM") inside the card | `.vision-model-title` |
| Vision Model Description | 视觉模型描述 | Brief capability and performance summary below the model title | `.vision-model-desc` |

### AI Provider Settings / AI 提供商设置

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| AI Panel | AI 面板 | AI provider selection and configuration; uses a nested list+form two-column layout | `#settings-panel-ai` / `.settings-panel-ai-layout` |
| Provider List | 提供商列表 | Scrollable list of AI providers (OpenAI, Claude, etc.) | `#ai-provider-list` / `.ai-provider-list` |
| Provider Item | 提供商项 | Clickable provider entry with icon and name | `.ai-provider-item` |
| Provider Icon | 提供商图标 | Letter badge identifying the provider | `.ai-provider-icon` |
| Provider Form | 提供商表单 | Configuration form for the selected provider | `.ai-provider-form` |
| Provider Header | 提供商头部 | Icon + name + description at top of form | `.ai-provider-header` |
| API Key Input | API 密钥输入 | Password field for the provider's API key | `#settings-api-key` |
| Key Toggle | 密钥显隐 | Eye button to show/hide the API key | `#settings-key-toggle` |
| Model Input | 模型输入 | Text field for the AI model name (e.g., "gpt-4o-mini") | `#settings-model` |
| Base URL Input | 基础 URL 输入 | Text field for the provider's API endpoint | `#settings-endpoint` |
| Temperature Input | 温度输入 | Number input for generation randomness (0-2) | `#settings-temperature` |
| Max Tokens Input | 最大 Token 输入 | Number input for response length limit | `#settings-max-tokens` |
| Auto-Analyze Toggle | 自动分析开关 | Checkbox to auto-run AI analysis on import | `#settings-auto-analyze` |
| Test Connection | 测试连接 | Button to verify API key and endpoint work | `#settings-test-btn` |
| Provider Select | 提供商下拉 | Hidden `<select>` for backward compatibility | `#settings-provider` |

### Web Collection Settings / 网页采集设置

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Web Panel (Settings) | 网页采集面板(设置) | Brave Search API key configuration | `#settings-panel-web` |
| Brave API Key | Brave 密钥 | API key for Brave Image Search | `#settings-brave-key` |

### Compression Settings / 压缩设置

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Compression Panel | 压缩面板 | Image compression on import configuration | `#settings-panel-compression` |
| Compress Toggle | 压缩开关 | Checkbox to enable/disable import compression | `#settings-compress-toggle` |
| Compress Options | 压缩选项 | Quality and max dimension controls (hidden when off) | `#settings-compress-options` |
| Quality Slider | 质量滑块 | Range input for JPEG quality (0.1-1.0) | `#settings-compress-quality` |
| Quality Label | 质量标签 | Percentage display next to quality slider | `#settings-quality-label` |
| Max Dimension | 最大尺寸 | Dropdown for max image dimension (1024/2048/3840/unlimited) | `#settings-compress-maxdim` |

---

## 18. Context Menus / 右键菜单

Native-style context menus triggered by right-click.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Context Menu | 右键菜单 | Context menu for home screen project cards | `#context-menu` |
| Canvas Context Menu | 画布右键菜单 | Context menu for canvas cards (dynamically populated) | `#canvas-context-menu` |
| Context Item | 菜单项 | Individual action in a context menu | `.ctx-item` |
| Context Icon | 菜单图标 | Icon beside a context menu action | `.ctx-item-icon` |
| Context Shortcut | 菜单快捷键 | Keyboard shortcut hint text (right-aligned) | `.ctx-item-shortcut` |
| Context Divider | 菜单分隔线 | Horizontal line separating menu sections | `.ctx-divider` |

### Home Context Menu Actions / 主页菜单操作

| English Name | Chinese Name | Description | Code `data-action` |
|---|---|---|---|
| Open | 打开 | Opens the selected project | `open` |
| Show in Finder | 在 Finder 中显示 | Opens the project folder in macOS Finder | `finder` |
| Rename | 重命名 | Renames the project | `rename` |
| Delete | 删除 | Deletes the project | `delete` |

---

## 19. Modals & Dialogs / 弹窗与对话框

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| New Project Dialog | 新建项目对话框 | Modal for entering a new project name | `#new-project-dialog` |
| Project Name Input | 项目名输入 | Text field for the project name | `#new-project-name` |
| Path Preview | 路径预览 | Shows the full path where the project will be created | `#new-project-path-preview` |
| Create Button | 创建按钮 | Confirms and creates the new project | `#new-project-create-btn` |
| Cancel Button | 取消按钮 | Cancels the new project dialog | `#new-project-cancel-btn` |
| Generate Image Dialog | 图片生成对话框 | Modal for AI image generation with prompt and options | `#generate-overlay` / `.generate-dialog` |
| Generate Prompt | 生成提示词 | Textarea for describing the image to generate | `#generate-prompt` |
| Generate References | 生成参考图 | Thumbnail strip of selected images used as style context | `#generate-refs` / `.generate-refs` |
| Generate Model Select | 生成模型选择 | Dropdown to pick DALL-E model version | `#generate-model` |
| Generate Size Select | 生成尺寸选择 | Dropdown for output image dimensions | `#generate-size` |
| Generate Count Select | 生成数量选择 | Dropdown for number of images to generate | `#generate-count` |
| Generate Submit | 生成提交 | Starts image generation and closes dialog | `.generate-submit` |
| Lightbox | 灯箱 / 全屏预览 | Full-screen image viewer overlay with navigation | `#lightbox` |
| Lightbox Image | 灯箱图片 | The displayed full-size image | `#lightbox-img` |
| Lightbox Caption | 灯箱标题 | Filename shown below the lightbox image | `#lightbox-caption` |
| Lightbox Navigation | 灯箱导航 | "1 / N" counter and keyboard hints | `#lightbox-nav` |
| Lightbox Close | 灯箱关闭 | X button to close the lightbox | `#lightbox-close` |

---

## 20. Status Bar / 状态栏

Bottom bar (24px) showing status messages, selection info, item count, and zoom controls. File actions (New Board, Open Folder) have moved to the native macOS menu bar (see section 3).

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Status Bar | 状态栏 | Bottom bar with status text, selection info, counts, and zoom | `#statusbar` |
| Status Text | 状态文字 | Current operation status message (e.g., "Ready", "Imported 5 images") | `#status-text` |
| Selection Info | 选择信息 | Details about the current selection (name, size, count) | `#selection-info` |
| Item Count | 元素计数 | Total count of images and annotations on canvas | `#canvas-item-count` |
| Zoom Controls | 缩放控件 | Zoom in/out buttons and percentage display | `.zoom-controls` |
| Zoom In Button | 放大按钮 | Increases canvas zoom level | `#zoom-in-btn` |
| Zoom Out Button | 缩小按钮 | Decreases canvas zoom level | `#zoom-out-btn` |
| Zoom Display | 缩放显示 | Shows current zoom percentage; click to reset to 100% | `#zoom-display` / `.zoom-level` |

---

## 21. Overlays & Feedback / 覆盖层与反馈

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Drop Overlay | 拖放覆盖层 | Full-screen dashed border shown when dragging files into the window | `#drop-overlay` |
| Drop Label | 拖放文字 | "Drop images here" prompt text | `.drop-label` |
| Analysis Spinner | 分析加载 | Centered spinner shown during single-image AI analysis | `#analysis-spinner` |
| Analysis Error Toast | 分析错误提示 | Red toast notification for AI analysis failures | `#analysis-error` |
| Batch Progress | 批量进度 | Floating progress bar for multi-image batch analysis | `#batch-progress` |
| Batch Progress Text | 批量进度文字 | "Analyzing 3/10: filename.jpg" status text | `#batch-progress-text` |
| Batch Progress Fill | 批量进度条 | Animated fill bar showing completion percentage | `#batch-progress-fill` |
| Batch Cancel | 批量取消 | Button to abort batch analysis | `#batch-progress-cancel` |
| Model Download Dialog | 模型下载对话框 | Shown when CLIP model is being downloaded (~150MB, first run) | `#model-download-dialog` |
| Keyboard Hints | 快捷键提示 | Overlay showing all keyboard shortcuts (toggled with "?") | `#hints` |
| Hints Toggle | 提示开关 | "?" button in bottom-right corner to toggle hints | `#hints-toggle` |

---

## 22. Shared UI Components / 通用 UI 组件

Reusable components used across multiple panels and views.

| English Name | Chinese Name | Description | Code ID/Class |
|---|---|---|---|
| Chip | 标签胶囊 | Small pill-shaped tag/keyword display | `.chip` |
| Chip Label | 胶囊文字 | Text content of a chip | `.chip-label` |
| Chip Remove | 胶囊删除 | X button to remove an editable chip | `.chip-remove` |
| Chip Add | 添加标签 | "+ Add" button for inserting a new tag | `.chip-add` |
| Chip Input | 标签输入 | Inline text input for typing a new tag | `.chip-input` |
| Chips Container | 标签容器 | Flex-wrap container for multiple chips | `.chips-container` |
| Color Swatch | 颜色色块 | Small colored square showing a dominant color | `.color-swatch` |
| Swatches Container | 色块容器 | Flex container for color swatches | `.swatches-container` |
| Primary Button | 主按钮 | Filled accent-colored button for primary actions | `.btn-primary` |
| Secondary Button | 次按钮 | Bordered button for secondary actions | `.btn-secondary` |
| Spinner | 加载旋转 | Animated circular loading indicator | `.spinner` |
| Segmented Control | 分段控件 | macOS-style toggle bar with mutually exclusive options (e.g., font size presets: Compact / Default / Large). Active segment is highlighted with a solid background and shadow | `.segmented-control` |
| Segmented Button | 分段按钮 | Individual option button inside a Segmented Control; toggled via `.active` class | `.segmented-btn` |

---

## 23. Features & Actions / 功能与操作

Feature-level terms used in UI labels, commands, and team discussions.

| English Name | Chinese Name | Description | Code Reference |
|---|---|---|---|
| Import | 导入 | Adding images to a project (drag-drop, paste, or file picker) | `importAndAddCards()` in main.js |
| AI Analysis | AI 分析 | Using a vision LLM to generate tags, description, style, mood, colors, era | `analyzeCard()` / `analyzeBatch()` |
| Batch Analysis | 批量分析 | Running AI analysis on multiple selected images sequentially | `analyzeBatch()` |
| Auto-Analyze | 自动分析 | Automatically triggering AI analysis when images are imported | `isAutoAnalyzeEnabled()` |
| Find Similar | 查找相似 | Finding visually similar images in the project using CLIP embeddings | `findSimilar()` in search.js |
| Find Online | 在线搜索 | Searching the web for images similar to a selected card | `findMoreLike()` in collection.js |
| Cluster | 聚类 | Grouping project images by visual similarity using CLIP | `clusterProject()` in search.js |
| Color Search | 颜色搜索 | Finding images by matching a selected color against dominant colors | `searchByColor()` in search.js |
| Semantic Search | 语义搜索 | Searching images by natural language query over AI metadata (FTS5) | `semanticSearch()` in search.js |
| Text Search | 文字搜索 | Full-text search over image names, descriptions, and tags | `cmd_search_text` |
| Tag Filter | 标签筛选 | Filtering canvas cards by selecting one or more tags | `toggleTagFilter()` in search.js |
| Group | 编组 | Combining multiple cards into a single movable/selectable unit | `groupSelected()` (Cmd+G) |
| Ungroup | 取消编组 | Dissolving a group back into individual cards | Cmd+Shift+U |
| Tidy Up | 自动排列 | Automatically arranging cards in a neat grid layout | Cmd+Shift+T |
| Fit All | 适应全部 | Zooming and panning to fit all cards in view | `fitAll()` (Shift+1) |
| Fit Selection | 适应选择 | Zooming to fit selected cards in view | Shift+2 |
| Duplicate | 复制 | Creating a copy of selected cards at an offset position | Cmd+D |
| Lock | 锁定 | Preventing a card from being moved or resized | `setCardLocked()` |
| Export PNG | 导出 PNG | Rendering the entire canvas to a PNG file | `exportCanvasPNG()` (Cmd+Shift+E) |
| Generate Image | 生成图片 | Using DALL-E to create new images from a text prompt | `cmd_generate_image` (Cmd+Shift+G) |
| Nudge | 微调 | Moving selected cards by 1px (or 10px with Shift) using arrow keys | Arrow keys |
| Save Board | 保存画板 | Persisting all card positions, groups, connections, and viewport | `save_board_state` (Cmd+S / auto-save) |
| Compress | 压缩 | Reducing image file size on import (quality + max dimension) | `compressImageBlob()` / `compressImageFromPath()` |

---

## 24. Backend Concepts / 后端概念

Technical terms for the Rust/Tauri backend, used in architecture and API discussions.

| English Name | Chinese Name | Description | Code Reference |
|---|---|---|---|
| Tauri Command | Tauri 命令 | A Rust function exposed to the frontend via IPC (`invoke()`) | `#[tauri::command]` in `src-tauri/src/` |
| Tauri IPC | Tauri 进程通信 | The inter-process communication bridge between JS and Rust | `window.__TAURI__.core.invoke()` |
| AI Provider | AI 提供商 | An LLM API service (OpenAI, Anthropic, Ollama, etc.) for image analysis | `ai.rs` / `PROVIDER_PRESETS` |
| CLIP Embedding | CLIP 嵌入向量 | A 512-dim float vector representing an image's visual content | `embed.rs` / `cmd_embed_project` |
| CLIP Model | CLIP 模型 | The ONNX vision model (~150MB) used for embedding generation | fastembed in `embed.rs` |
| CLIP Warmup | CLIP 预热 | Loading the CLIP model into memory 3 seconds after app start | `cmd_warmup_clip` |
| SQLite Database | SQLite 数据库 | Per-project database storing search index and embeddings | `{project}/.deco/search.db` |
| FTS5 | 全文搜索 | SQLite full-text search extension used for text/tag queries | `search.rs` |
| Board State | 画板状态 | JSON file storing card positions, groups, viewport, connections, z-order | `{project}/.deco/board.json` |
| Auto-Save | 自动保存 | Periodic save (every 30s) of board state when changes are detected | `AUTO_SAVE_INTERVAL = 30000` |
| HTTP API | HTTP 接口 | Local REST API (localhost:7890) for external tool integration | `api.rs` |
| Scan Images | 扫描图片 | Walking a directory tree to discover all supported image files | `scan_images` command |
| Import Images | 导入图片 | Copying image files into the project directory | `import_images` / `import_clipboard_image` |
| Delete Image | 删除图片 | Removing an image file from disk and the search index | `delete_image` command |
| Web Search | 网页搜索 | Searching Brave Image Search API for reference images | `cmd_web_search` in `web.rs` |
| Download Web Image | 下载网页图片 | Downloading a web image into the project folder | `cmd_download_web_image` |
| Config (Global) | 全局配置 | App-wide settings stored at `~/.deco/config.json` | `get_app_config` / `set_app_config` |
| Config (AI) | AI 配置 | AI provider settings (key, model, endpoint, temperature, tokens) | `get_ai_config` / `set_ai_config` |
| Config (Web) | 网页配置 | Web collection settings (Brave API key, safe search, results count) | `cmd_get_web_config` / `cmd_set_web_config` |

---

## 25. Theme & Styling / 主题与样式

| English Name | Chinese Name | Description | Code Reference |
|---|---|---|---|
| Dark Theme | 深色主题 | Default dark color scheme (bg: `#1e1e1e`) | `DARK_THEME` / `:root` |
| Light Theme | 浅色主题 | Light color scheme (bg: `#f5f5f7`) | `LIGHT_THEME` / `[data-theme="light"]` |
| System Theme | 系统主题 | Follows macOS system appearance setting automatically | `applySavedTheme()` |
| Vibrancy | 毛玻璃效果 | Semi-transparent background with `backdrop-filter: blur()` | `var(--surface)` + `backdrop-filter` |
| Accent Color | 强调色 | Primary interactive color (blue: `#409cff` dark / `#007aff` light) | `var(--accent)` |

---

## 26. Keyboard Shortcuts / 快捷键

Reference for all keyboard shortcuts documented in the hints overlay.

| Shortcut | English Name | Chinese Name |
|---|---|---|
| V | Select Tool | 选择工具 |
| H | Hand Tool | 抓手工具 |
| R | Rect Tool | 矩形工具 |
| O | Ellipse Tool | 椭圆工具 |
| L | Line Tool | 线段工具 |
| T | Text Tool | 文字工具 |
| C | Connect Tool | 连线工具 |
| G | Toggle Grid | 网格开关 |
| M | Toggle Minimap | 小地图开关 |
| Space + drag | Pan Canvas | 平移画布 |
| Scroll | Zoom | 缩放 |
| Cmd+0 | Reset to 100% | 重置缩放 |
| Shift+1 | Fit All | 适应全部 |
| Shift+2 | Fit Selection | 适应选择 |
| Cmd+Z | Undo | 撤销 |
| Cmd+Shift+Z | Redo | 重做 |
| Cmd+D | Duplicate | 复制 |
| Cmd+G | Group | 编组 |
| Cmd+Shift+U | Ungroup | 取消编组 |
| Cmd+Shift+T | Tidy Up | 自动排列 |
| Cmd+Shift+A | Analyze | AI 分析 |
| Cmd+Shift+F | Find Online | 在线搜索 |
| Cmd+Shift+G | Generate Image | 生成图片 |
| Cmd+Shift+E | Export PNG | 导出 PNG |
| Cmd+F | Find | 查找 |
| Cmd+S | Save | 保存 |
| Cmd+, | Settings | 设置 |
| Cmd+\ | Toggle Sidebar | 侧边栏开关 |
| Delete / Backspace | Delete | 删除 |
| Arrows | Nudge 1px | 微调 1px |
| Shift+Arrows | Nudge 10px | 微调 10px |
| Esc | Deselect / Close | 取消选择 / 关闭 |

---

*Last updated: 2026-02-18*
