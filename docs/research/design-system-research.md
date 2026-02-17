# Figma & Sketch 设计风格分析

> 调研目标：分析 Figma 和 Sketch 的设计为什么这么「润」(polished/smooth)
> 输出：可直接应用到 Deco 的 CSS 代码片段和设计规范

---

## 1. 配色方案 (Color Scheme)

### Figma UI3 (Dark Mode)

Figma 使用**语义化 CSS 变量**系统，不直接硬编码颜色。这是它感觉「润」的核心原因之一 —— 每个颜色都有明确的语义角色。

| 层级 | 用途 | 色值 | 特征 |
|------|------|------|------|
| Canvas | 画布背景 | `#1e1e1e` | 纯深灰，不是纯黑 |
| Surface 1 | 面板/侧边栏 | `#2c2c2c` | 比画布浅一级 |
| Surface 2 | 输入框/卡片 | `#383838` | 微妙的层次感 |
| Surface 3 | Hover 态 | `#444444` | 鼠标悬浮反馈 |
| Border | 分隔线 | `rgba(255,255,255,0.1)` | 半透明白色 |
| Border Strong | 强调边框 | `rgba(255,255,255,0.15)` | 选中/聚焦 |
| Text Primary | 主文本 | `#ffffff` | 纯白 |
| Text Secondary | 次要文本 | `rgba(255,255,255,0.7)` | 70% 白 |
| Text Tertiary | 占位符 | `rgba(255,255,255,0.4)` | 40% 白 |
| Accent | 品牌蓝 | `#0d99ff` | Figma 特征蓝 |
| Accent Hover | 蓝悬浮 | `#0c8ce9` | 略深 |
| Danger | 错误红 | `#f24822` | 醒目但不刺眼 |
| Success | 成功绿 | `#14ae5c` | 饱和度适中 |
| Warning | 警告黄 | `#ffcd29` | 温暖 |

**关键发现：Figma 的颜色层级用 `rgba()` 半透明叠加而非硬编码灰度，这使得颜色在不同背景上自然过渡。**

### Sketch (Dark Mode)

Sketch 遵循 macOS 原生深色主题，使用 `NSAppearance` 系统色：

| 层级 | 用途 | 色值 | 特征 |
|------|------|------|------|
| Window | 窗口背景 | `#292929` | macOS 标准深色 |
| Sidebar | 侧边栏 | `#1e1e1e` + vibrancy | 磨砂玻璃 |
| Inspector | 检查器面板 | `#323232` | 比窗口略浅 |
| Canvas | 画布 | `#1a1a1a` | 最深 |
| Toolbar | 工具栏 | `#3a3a3a` | 紧凑深色 |
| Accent | 系统强调色 | 跟随系统设置 | 自动适配 |
| Selection | 选中态 | `#0a60ff` | macOS 蓝 |
| Text Primary | 主文本 | `#ffffff` | |
| Text Secondary | 次要 | `#999999` | |
| Separator | 分隔线 | `rgba(255,255,255,0.12)` | |

**关键发现：Sketch 使用 macOS 原生 vibrancy 磨砂效果，侧边栏自动融合桌面壁纸色调，这是原生感的核心。**

### 对比表

| 属性 | Figma | Sketch | Deco 建议 |
|------|-------|--------|-----------|
| 背景基调 | `#2c2c2c` (暖灰) | `#292929` (冷灰) | `#2a2a2a` 折中 |
| 层级区分方式 | rgba 叠加 | 固定色值 + vibrancy | rgba 为主 |
| 边框 | 半透明白 10% | 半透明白 12% | `rgba(255,255,255,0.1)` |
| 强调色 | 自有蓝 `#0d99ff` | 系统蓝 | 自有蓝 `#4a9eff` |
| 文字对比度 | WCAG AA+ | WCAG AA+ | 保持 AA+ |

### Deco 可用 CSS

```css
:root {
  /* Figma 风格色阶 */
  --bg-canvas: #1e1e1e;
  --bg-surface: #2c2c2c;
  --bg-elevated: #383838;
  --bg-hover: #444444;
  --bg-active: #505050;

  /* 半透明边框（关键：让边框随背景自适应） */
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);
  --border-focus: rgba(77, 158, 255, 0.5);

  /* 文本层级（用 opacity 而非灰度） */
  --text: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.65);
  --text-tertiary: rgba(255, 255, 255, 0.4);
  --text-disabled: rgba(255, 255, 255, 0.25);

  /* 语义色 */
  --accent: #4a9eff;
  --accent-hover: #3d8ce6;
  --accent-pressed: #3580d4;
  --danger: #f24822;
  --success: #14ae5c;
  --warning: #ffcd29;
}
```

---

## 2. 间距系统 (Spacing System)

### Figma

Figma 使用 **4px 基础网格**，所有间距都是 4 的倍数：

| Token | 值 | 用途 |
|-------|----|------|
| `spacing-xxs` | 2px | 图标与文字间距 |
| `spacing-xs` | 4px | 紧凑元素间距 |
| `spacing-sm` | 8px | 按钮内边距、列表项间距 |
| `spacing-md` | 12px | 面板内边距 |
| `spacing-lg` | 16px | 区块间距 |
| `spacing-xl` | 24px | 面板区域分隔 |
| `spacing-xxl` | 32px | 大区块分隔 |

**面板宽度：** 左面板 240px（可调整），右面板 240px
**工具栏高度：** 48px（UI3 改为底部浮动工具栏 40px）
**列表项高度：** 32px（标准）, 28px（紧凑）

### Sketch

Sketch 遵循 macOS HIG 的 8pt 网格：

| Token | 值 | 用途 |
|-------|----|------|
| 微间距 | 4px | 内联元素 |
| 紧凑 | 8px | 列表项、按钮 |
| 标准 | 12px | 面板区域 |
| 舒适 | 16px | 区块分隔 |
| 宽松 | 24px | 主要区域 |

**Inspector 宽度：** 260px（固定）
**Toolbar 高度：** 38px（macOS 标准）
**Layer 行高：** 28px

### Deco 可用 CSS

```css
:root {
  --space-1: 2px;   /* xxs — 内联微调 */
  --space-2: 4px;   /* xs  — 图标-文字间距 */
  --space-3: 8px;   /* sm  — 按钮 padding、列表 gap */
  --space-4: 12px;  /* md  — 面板 padding */
  --space-5: 16px;  /* lg  — 区块间距 */
  --space-6: 24px;  /* xl  — 面板区域分隔 */
  --space-7: 32px;  /* xxl — 大区块分隔 */

  --panel-width: 240px;
  --toolbar-height: 40px;
  --list-item-height: 32px;
  --list-item-compact: 28px;
}
```

---

## 3. 圆角尺寸 (Border Radius)

### 对比

| 组件 | Figma | Sketch | Deco 建议 |
|------|-------|--------|-----------|
| 按钮 | 6px | 5px (macOS) | 6px |
| 输入框 | 6px | 4px | 6px |
| 面板/弹窗 | 8px | 10px | 8px |
| 卡片 | 8px | 8px | 8px |
| 工具提示 | 4px | 6px | 4px |
| 弹出菜单 | 8px | 6px (macOS) | 8px |
| 标签 chip | 4px | 4px | 4px |
| 圆形按钮 | 50% | 50% | 50% |
| 缩略图 | 4px | 4px | 4px |
| Modal 对话框 | 12px | 10px | 12px |

**关键发现：Figma 和 Sketch 都控制在 4-12px 范围内。大圆角（>12px）只用于模态窗口。层级越高，圆角越大。**

### Deco 可用 CSS

```css
:root {
  --radius-xs: 2px;   /* 微组件：进度条、badge */
  --radius-sm: 4px;   /* 标签、tooltip、缩略图 */
  --radius-md: 6px;   /* 按钮、输入框 */
  --radius-lg: 8px;   /* 面板、卡片、菜单 */
  --radius-xl: 12px;  /* Modal、大面板 */
  --radius-full: 50%; /* 圆形 */
}
```

---

## 4. 阴影 (Box Shadow)

### Figma 阴影系统

Figma 使用**多层阴影叠加**实现自然感：

```css
/* Elevation 1 — 浮动卡片、下拉菜单 */
box-shadow:
  0 0 0 1px rgba(0, 0, 0, 0.05),           /* 微弱边框 */
  0 2px 4px rgba(0, 0, 0, 0.05),            /* 近阴影 */
  0 4px 12px rgba(0, 0, 0, 0.1);            /* 扩散阴影 */

/* Elevation 2 — 弹出面板、对话框 */
box-shadow:
  0 0 0 1px rgba(0, 0, 0, 0.08),
  0 4px 8px rgba(0, 0, 0, 0.08),
  0 12px 24px rgba(0, 0, 0, 0.15);

/* Elevation 3 — 模态窗口 */
box-shadow:
  0 0 0 1px rgba(0, 0, 0, 0.1),
  0 8px 16px rgba(0, 0, 0, 0.1),
  0 24px 48px rgba(0, 0, 0, 0.25);

/* 深色主题阴影更重（背景深，需要更大对比） */
box-shadow:
  0 0 0 1px rgba(0, 0, 0, 0.3),
  0 4px 12px rgba(0, 0, 0, 0.4),
  0 12px 24px rgba(0, 0, 0, 0.3);
```

### Sketch 阴影系统

Sketch 使用 macOS 原生 `NSShadow`，更克制：

```css
/* 标准弹窗 */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

/* 菜单 */
box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);

/* 深色模式加重 */
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
```

**关键发现：**
- 多层阴影叠加 = 更自然的深度感（Figma 风格）
- 第一层用 `0 0 0 1px` 模拟边框，比 `border` 更柔和
- 深色模式下阴影 opacity 需要加倍才能看到效果

### Deco 可用 CSS

```css
:root {
  /* 阴影系统（深色主题优化） */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);

  /* 浮动工具栏专用 */
  --shadow-toolbar: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
}
```

---

## 5. 字体 (Typography)

### Figma

Figma 使用自有字体 `figmaSans`（基于 Inter 定制），具有可变字重：

| 层级 | 字号 | 字重 | 行高 | 字间距 |
|------|------|------|------|--------|
| Title Large | 20px | 600 | 28px | -0.02em |
| Title | 14px | 600 | 20px | -0.01em |
| Body | 12px | 400 | 16px | 0 |
| Body Bold | 12px | 600 | 16px | 0 |
| Caption | 11px | 400 | 14px | 0.01em |
| Label | 11px | 500 | 14px | 0.02em |
| Code | 11px | 400 (mono) | 16px | 0 |

**`font-variation-settings: 'wdth' 100, 'wght' 330-600`**

### Sketch

Sketch 使用 **SF Pro**（macOS 系统字体），严格遵循 Apple HIG：

| 层级 | 字号 | 字重 | 行高 |
|------|------|------|------|
| Window Title | 13px | Semibold (600) | 16px |
| Inspector Label | 11px | Regular (400) | 14px |
| Inspector Value | 11px | Regular (400) | 14px |
| Layer Name | 12px | Regular (400) | 16px |
| Sidebar Header | 11px | Semibold (600) | 14px |
| Status Bar | 11px | Regular (400) | 14px |

### 对比

| 属性 | Figma | Sketch | Deco 建议 |
|------|-------|--------|-----------|
| 基础字号 | 12px | 11px | 12px |
| 字体族 | figmaSans / Inter | SF Pro | SF Pro |
| 主标题字重 | 600 | 600 | 600 |
| 正文字重 | 400 | 400 | 400 |
| 行高比 | 1.33x | 1.27x | 1.33x |
| 负字间距 | 标题用 | 不用 | 标题用 |

### Deco 可用 CSS

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
  --font-mono: 'SF Mono', 'Menlo', 'Consolas', monospace;

  --text-xs: 10px;    /* 标注、badge */
  --text-sm: 11px;    /* 标签、caption */
  --text-base: 12px;  /* 正文、输入框 */
  --text-md: 13px;    /* 次标题 */
  --text-lg: 14px;    /* 面板标题 */
  --text-xl: 16px;    /* 对话框标题 */
  --text-2xl: 20px;   /* 大标题 */

  --leading-tight: 1.2;    /* 标题 */
  --leading-normal: 1.33;  /* 正文 */
  --leading-relaxed: 1.5;  /* 描述 */

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
}
```

---

## 6. 动画 (Animation)

### Figma 动画参数

Figma 的动画感觉「润」的核心是 **spring 物理模型** + **ease-out 为主**：

| 类型 | 时长 | 缓动 | 用途 |
|------|------|------|------|
| Instant | 0ms | — | 点击高亮 |
| Micro | 100ms | ease-out | hover 色变、icon 变化 |
| Quick | 150ms | ease-out | 按钮状态、tooltip |
| Standard | 200ms | ease-out | 面板展开、菜单打开 |
| Smooth | 300ms | cubic-bezier(0.2, 0, 0, 1) | 侧边栏滑入 |
| Expressive | 400ms | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性效果 |

**Figma Spring 参数：**
- Stiffness: 400 (硬朗) / 200 (柔和) / 100 (弹性)
- Damping: 30 (快停) / 15 (有弹跳) / 10 (活泼)
- Mass: 1 (标准)

### Sketch 动画参数

Sketch 使用 macOS 原生 Core Animation，更克制：

| 类型 | 时长 | 缓动 | 用途 |
|------|------|------|------|
| Hover | 0.1s | ease | 按钮背景色 |
| Panel | 0.2s | ease-in-out | Inspector 展开 |
| Sheet | 0.25s | ease-out | 对话框出现 |
| Transition | 0.3s | ease-out | 页面切换 |

### 关键发现：什么让动画感觉「润」

1. **永远用 ease-out（减速）** 进入动画，ease-in（加速）退出动画
2. **差异化时长**：越小的元素越快（100ms），越大的面板越慢（300ms）
3. **状态反馈即时**：hover 变色 < 100ms，不等待
4. **避免线性**：`linear` 让动画看起来机械化
5. **Spring 物理**：给交互以「重量感」

### Deco 可用 CSS

```css
:root {
  /* 时长 */
  --duration-instant: 0ms;
  --duration-micro: 100ms;
  --duration-quick: 150ms;
  --duration-standard: 200ms;
  --duration-smooth: 300ms;
  --duration-expressive: 400ms;

  /* 缓动曲线 */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);            /* 标准减速 */
  --ease-out-soft: cubic-bezier(0.25, 0.46, 0.45, 0.94); /* 柔和减速 */
  --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);         /* 对称 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);      /* 弹性过冲 */
  --ease-smooth: cubic-bezier(0.2, 0, 0, 1);              /* Figma 标准 */

  /* 组合 shorthand */
  --transition-colors: color var(--duration-micro) var(--ease-out),
                       background-color var(--duration-micro) var(--ease-out),
                       border-color var(--duration-micro) var(--ease-out);
  --transition-transform: transform var(--duration-standard) var(--ease-out);
  --transition-opacity: opacity var(--duration-quick) var(--ease-out);
  --transition-all: all var(--duration-quick) var(--ease-out);
}
```

---

## 7. 层级 (Z-Index / Elevation)

### Figma 层级系统

| 层级 | z-index | 组件 |
|------|---------|------|
| Canvas | 0 | 画布内容 |
| Grid Overlay | 10 | 网格/标尺 |
| Selection | 20 | 选中边框 |
| Floating Toolbar | 100 | 属性栏 |
| Panel | 200 | 左右面板 |
| Dropdown | 500 | 下拉菜单 |
| Popover | 600 | 弹出窗口 |
| Toast | 800 | 通知 |
| Modal Backdrop | 900 | 遮罩层 |
| Modal | 1000 | 模态对话框 |
| Tooltip | 1100 | 工具提示（最顶层） |

### Sketch 层级

Sketch 使用 macOS NSWindow 层级，前端不需要管 z-index —— 原生应用由窗口系统处理。

### Deco 可用 CSS

```css
:root {
  --z-canvas: 0;
  --z-grid: 10;
  --z-selection: 20;
  --z-floating: 100;
  --z-panel: 200;
  --z-sidebar: 300;
  --z-dropdown: 500;
  --z-popover: 600;
  --z-toast: 800;
  --z-modal-backdrop: 900;
  --z-modal: 1000;
  --z-tooltip: 1100;
}
```

---

## 8. 微交互 (Micro-interactions)

### Figma 的微交互细节

| 交互 | 效果 | 时长 | 注意点 |
|------|------|------|--------|
| 按钮 hover | 背景色变亮 | 100ms | 不改变尺寸 |
| 按钮 active/pressed | 背景色加深 + 缩小 0.98 | 50ms | 即时反馈 |
| 输入框 focus | 蓝色边框 + 微弱蓝色光晕 | 150ms | `box-shadow: 0 0 0 2px var(--accent-bg)` |
| 列表项 hover | 背景色半透明 | 80ms | 不用边框变化 |
| 面板展开 | 从右侧滑入 | 250ms ease-out | 带 backdrop 模糊 |
| 工具切换 | 图标颜色变化 + 背景高亮 | 100ms | 无动画位移 |
| 拖拽卡片 | 投影加深 + 缩小 0.97 | — (实时) | 鼠标跟随无延迟 |
| 放下卡片 | 弹性归位 | 200ms spring | 有微弱弹跳 |
| 选中对象 | 蓝色描边出现 | 0ms | 即时，不做动画 |
| 菜单打开 | 从按钮位置弹出 + 微缩放 | 150ms | `transform-origin` 从触发点 |
| 删除 | 淡出 + 缩小 | 200ms | opacity + scale |

### Sketch 的微交互

Sketch 更克制，遵循 macOS 原生行为：

| 交互 | 效果 | 特征 |
|------|------|------|
| 按钮 hover | NSButton 原生高亮 | 系统处理 |
| 列表选中 | 蓝色背景 + 圆角 | 跟随系统强调色 |
| Inspector 展开 | Disclosure triangle 旋转 | 0.2s ease |
| 画布缩放 | 平滑 momentum | 跟随 trackpad 惯性 |
| 拖拽图层 | 半透明预览跟随 | 原生拖放 API |

### Deco 可用 CSS

```css
/* 按钮状态 */
.btn {
  transition: background-color 100ms ease-out,
              transform 100ms ease-out,
              box-shadow 100ms ease-out;
}
.btn:hover {
  background: var(--bg-hover);
}
.btn:active {
  background: var(--bg-active);
  transform: scale(0.98);
}

/* 输入框聚焦 */
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.15);
  outline: none;
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}

/* 面板滑入 */
.panel {
  transform: translateX(100%);
  opacity: 0;
  transition: transform 250ms var(--ease-out),
              opacity 200ms ease-out;
}
.panel.open {
  transform: translateX(0);
  opacity: 1;
}

/* 菜单弹出（从触发点展开） */
.menu {
  transform-origin: top left;
  transform: scale(0.95);
  opacity: 0;
  transition: transform 150ms var(--ease-spring),
              opacity 100ms ease-out;
}
.menu.open {
  transform: scale(1);
  opacity: 1;
}

/* 卡片拖拽 */
.card.dragging {
  box-shadow: var(--shadow-lg);
  transform: scale(0.97);
  opacity: 0.9;
}

/* 列表项 hover */
.list-item {
  transition: background-color 80ms ease-out;
}
.list-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.list-item.active {
  background: var(--accent-bg);
}

/* 删除动画 */
.card.deleting {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
  opacity: 0;
  transform: scale(0.9);
}
```

---

## 关键发现总结：什么让 Figma & Sketch 感觉「润」

### 1. 颜色用 rgba 半透明而非硬编码灰度
所有边框、分隔线、文字层级都使用 `rgba(255,255,255, N%)`。这让组件在任何背景色上都自然融合，改变背景时不需要逐个调整。

### 2. 多层阴影 > 单层阴影
一个 `box-shadow` 里叠 2-3 层，每层有不同 offset/blur/opacity。模拟真实光照的多重散射，比单层阴影更有深度。

### 3. 动画只用 ease-out
进入用减速（ease-out），退出用加速（ease-in）。永远不用 linear。不同尺寸组件用不同时长：微元素 100ms，面板 300ms。

### 4. 状态反馈即时
hover 变色 < 100ms，选中描边 0ms，不做过长的过渡。用户感知到「系统在响应我」。

### 5. 间距严格遵循 4px 网格
所有 margin/padding 都是 4 的倍数。视觉对齐的一致性让整体感觉「干净」。

### 6. 圆角适度（4-12px）
不滥用大圆角。层级越高圆角越大：按钮 6px < 面板 8px < 模态 12px。

### 7. 字重对比而非字号对比
Figma 大量使用 12px 正文 + 不同字重（400/500/600）区分层级，而非频繁改变字号。看起来整齐统一。

### 8. 磨砂玻璃仅用于浮动层
`backdrop-filter: blur()` 只用于工具栏、弹出菜单等浮动组件。面板本身用实色背景。滥用会让界面模糊不清。

---

## 对比总结表

| 维度 | Figma | Sketch | Deco 现状 | 建议改进 |
|------|-------|--------|-----------|----------|
| 配色 | 自有设计系统，语义 token | macOS 原生 NSColor | CSS 变量 | 统一为 rgba 半透明体系 |
| 间距 | 4px 网格 | 8px 网格 | 混合 | 严格 4px 倍数 |
| 圆角 | 6-8px 为主 | 5-10px | 8px | 分层：6/8/12px |
| 阴影 | 多层叠加 | 单层原生 | 单层 | 改为 2-3 层叠加 |
| 字体 | figmaSans 12px | SF Pro 11px | SF Pro 12-13px | 对齐 12px base |
| 动画 | Spring + ease-out | Core Animation | ease 0.2s | 分级时长 + ease-out |
| 层级 | 严格 z-index | NSWindow 层级 | 部分缺失 | 建立完整 z 层级表 |
| 微交互 | 丰富细腻 | 原生克制 | 基础 | 增加 hover/focus/press |

---

## 参考来源

- [Figma CSS Variables (Developer Docs)](https://developers.figma.com/docs/plugins/css-variables/)
- [Figma Blog: Illuminating Dark Mode](https://www.figma.com/blog/illuminating-dark-mode/)
- [Figma UI3 Design System (Community)](https://www.figma.com/community/file/1435605222271498542/)
- [Sketch Dark Mode Blog](https://www.sketch.com/blog/dark-mode-data-a-brand-new-look-and-more-in-sketch-52/)
- [Sketch Features](https://www.sketch.com/features/)
- [Figma Easing & Spring Animations](https://help.figma.com/hc/en-us/articles/360051748654-Prototype-easing-and-spring-animations)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

*最后更新: 2026-02-17*
