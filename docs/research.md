# RefBoard 竞品交互研究

> Researcher (@researcher) | glow-nexus | 2026-02-14

---

## 目录

1. [Figma 交互设计](#1-figma-交互设计)
2. [Miro 交互设计](#2-miro-交互设计)
3. [PureRef 交互设计](#3-pureref-交互设计)
4. [交互模式对比](#4-交互模式对比)
5. [RefBoard 建议](#5-refboard-建议)

---

## 1. Figma 交互设计

### 1.1 画布导航

| 操作 | 方式 |
|------|------|
| **平移** | Space+拖拽 / 双指滑动(trackpad) / 中键拖拽 / H键切换手型工具 |
| **缩放** | Cmd/Ctrl+滚轮 / 双指捏合 / Shift+/- / Z键框选缩放 |
| **适应全部** | Shift+1 -- 视口适配所有内容 |
| **适应选中** | Shift+2 -- 视口适配选中元素 |
| **100%** | Cmd/Ctrl+0 |
| **逐帧导航** | N (下一个 Frame) / Shift+N (上一个 Frame) |

**关键设计**: 缩放始终以光标位置为中心；trackpad 上捏合→缩放、双指→平移可无缝切换，无需抬手。

### 1.2 对象操作

**选择**:
- 单击选中 (默认选顶层父级)
- Cmd/Ctrl+单击 = 深度选择 (穿透 group/frame 直接选子元素)
- Shift+单击 = 加/减选
- 拖拽空白处 = 框选 (相交即选中)
- Tab/Shift+Tab 在同级元素间切换
- Cmd/Ctrl+右键 = 弹出重叠图层列表，选择任意层

**移动**:
- 拖拽移动
- 方向键微调 (1px)，Shift+方向键大步微调 (10px)
- Shift+拖拽 = 锁定横/纵轴
- Alt+拖拽 = 复制并移动

**缩放**:
- 角点拖拽 = 同时改变宽高
- 边缘拖拽 = 单轴缩放
- Shift = 等比缩放
- Alt = 从中心缩放
- K键 (Scale工具) = 等比缩放包括笔画、字体、圆角等

**旋转**: 悬停角点外侧出现旋转图标，Shift 锁定 15 度增量

**翻转**: Shift+H (水平) / Shift+V (垂直)

### 1.3 智能辅助线与吸附

- **对齐参考线**: 移动时自动显示红色/品红色线，指示与邻近对象的边缘/中心对齐
- **等距指示器**: 当间距与其他对象间距相等时显示距离标注
- **Alt+悬停**: 选中对象后按住 Alt 悬停其他对象，显示精确像素距离
- **吸附到像素网格**: Shift+Cmd+' 开关
- **吸附到对象**: 默认开启，可在偏好设置中配置
- **标尺参考线**: Shift+R 显示标尺，从标尺拖出持久参考线

### 1.4 对齐与分布

| 快捷键 | 功能 |
|---------|------|
| Alt+A | 左对齐 |
| Alt+D | 右对齐 |
| Alt+W | 上对齐 |
| Alt+S | 下对齐 |
| Alt+H | 水平居中 |
| Alt+V | 垂直居中 |
| Ctrl+Alt+T | **Tidy Up** -- 自动整理为行/列/网格 |
| Ctrl+Alt+H | 水平等距分布 |
| Ctrl+Alt+V | 垂直等距分布 |

**Tidy Up** 是 moodboard 场景最有价值的功能之一 -- 一键把散乱的元素整理为整齐网格。

### 1.5 图层与排序

| 快捷键 | 功能 |
|---------|------|
| Cmd+] | 上移一层 |
| Cmd+[ | 下移一层 |
| Alt+Cmd+] | 移到最前 |
| Alt+Cmd+[ | 移到最后 |

### 1.6 右键上下文菜单

包含: 剪切/复制/粘贴、复制为PNG/SVG/CSS、图层选择(重叠层)、锁定/解锁、显示/隐藏、编组/取消编组、框选为Frame、翻转、Auto Layout、组件操作、导出等。

### 1.7 Auto Layout

- Shift+A 添加 Auto Layout (类似 CSS Flexbox)
- 支持水平/垂直/换行/网格方向
- 间距、padding、对齐方式可精细控制
- 子元素可设为 Hug/Fill/Fixed

### 1.8 评论系统

- C键进入评论模式，点击画布位置放置评论图钉
- 支持 @提及、富文本、图片/GIF附件、emoji 反应
- 评论可标记为已解决
- 评论随顶层 Frame 移动

### 1.9 Minimap

Figma **没有**内置 Minimap。通过以下方式弥补:
- Shift+1 适应全部、Shift+2 适应选中
- N/Shift+N 帧间导航
- 图层面板点击帧名跳转
- 社区插件 MiniMap 提供鸟瞰导航

### 1.10 Undo/Redo 与版本

- Cmd+Z / Shift+Cmd+Z
- 每30分钟自动保存版本检查点
- Cmd+Alt+S 创建命名版本
- 恢复版本是非破坏性的 (创建新版本)

### 1.11 快捷键速查

**工具激活 (单键)**:

| 键 | 工具 | 键 | 工具 |
|---|---|---|---|
| V | 移动 | H | 手型(平移) |
| F/A | Frame | R | 矩形 |
| O | 椭圆 | L | 线条 |
| P | 钢笔 | T | 文本 |
| C | 评论 | K | 缩放 |
| S | 切片 | I | 取色器 |

**透明度**: 数字键 1-9 = 10%-90%，0 = 100%

---

## 2. Miro 交互设计

### 2.1 画布导航

| 操作 | 方式 |
|------|------|
| **平移** | Space+拖拽 / 右键拖拽 / 中键拖拽 / H键手型工具 |
| **缩放** | 滚轮(Mouse模式) / Cmd/Ctrl+滚轮(Trackpad模式) / 捏合 |
| **适应全部** | Alt/Opt+1 |
| **适应选中** | Alt/Opt+2 |
| **100%** | Cmd/Ctrl+0 |
| **Minimap** | M键切换 |

**关键设计**: Miro 提供 Mouse/Trackpad 两种导航模式:
- **Mouse模式**: 滚轮=缩放
- **Trackpad模式**: 双指滚动=平移，Cmd/Ctrl+滚动=缩放

这是解决不同输入设备预期差异的重要 UX 决策。

### 2.2 对象操作

**选择**:
- V键激活选择工具
- 单击选择 / Shift+单击多选
- 拖拽框选 (相交~1%即选中)
- 长按拖拽 = 完全包围才选中
- Lasso 工具 = 自由框选 (~90%包围即选中)
- Cmd/Ctrl+A 全选 / Tab 在对象间切换

**移动/复制**:
- 拖拽移动 + 蓝色智能对齐线自动出现
- Alt+拖拽 = 复制
- Cmd/Ctrl+D = 复制
- 方向键微调，Cmd/Ctrl+方向键大步移动

**锁定**: Cmd/Ctrl+Shift+L (普通锁) / Cmd/Ctrl+Shift+P (保护锁，仅管理员可解)

**编组**: Cmd/Ctrl+G / Cmd/Ctrl+Shift+G

**层序**: Page Up 置顶 / Page Down 置底

### 2.3 工具栏 (左侧)

| 工具 | 快捷键 | 说明 |
|------|--------|------|
| Select/Hand | V/H | 不可移除 |
| Text | T | 点击放置文本 |
| Sticky Notes | N | 便签 |
| Shapes | S | R=矩形, O=椭圆 |
| Connection Line | L | 连接线/箭头 |
| Pen | P | 子工具: 笔/高亮/智能绘制/橡皮/套索 |
| Comment | C | 评论 |
| Frame | F | 命名区域 |
| Upload | -- | 上传文件 |
| More (+) | -- | 卡片(D)、表格、思维导图、图表等 |

**行为**: 大部分工具是**一次性的** -- 使用后自动切回选择工具。Pen/Eraser/Comment 是持久的。

### 2.4 智能辅助

- **蓝色对齐线**: 拖拽时自动显示边缘/中心对齐
- **等距参考**: 三个以上对象间距相等时显示
- **尺寸匹配**: 调整大小时匹配邻近对象尺寸时显示
- **Snap to Grid**: G键切换网格(线网格/点网格)，对象吸附到网格交点
- **Cmd/Ctrl+拖拽**: 临时禁用吸附

### 2.5 Frame (区域组织)

- F键创建，拖拽定义区域
- Frame 内对象随 Frame 移动
- Frames 面板可快速导航 (点击帧名跳转)
- 可导出为单独图片或 PDF 页
- "Organize frames" 自动排序

### 2.6 上下文工具栏 (浮动)

选中对象时在上方弹出浮动工具栏:
- 字体、字号、颜色、对齐
- 填充色、边框色、透明度、边框粗细、圆角
- 对齐/分布、链接、锁定、编组、复制、删除
- Shift 可隐藏浮动工具栏

### 2.7 无限画布

- 真正无限，无边界、无滚动条
- 拖拽到视口边缘自动滚动 (edge panning)
- Minimap (M键) 显示视口位置
- 超多对象时使用 LOD 简化渲染

### 2.8 协作功能

- 实时光标 (显示头像和名字)
- 评论图钉 + 线程讨论 + @提及
- 匿名投票、实时 emoji 反应、计时器
- 查看/评论/编辑权限分级

---

## 3. PureRef 交互设计

### 3.1 画布导航

| 操作 | 方式 |
|------|------|
| **平移** | 中键拖拽 / Alt+左键拖拽 / 双指滑动(trackpad) |
| **缩放** | 滚轮 / Z+左键拖拽 / 双指捏合 / Ctrl+Plus/Minus |
| **聚焦图片** | Space 或 双击 = 放大显示选中图片，再按返回 |
| **聚焦画布** | Ctrl+Space = 显示全部内容 |
| **重置缩放** | Ctrl+0 = 100% |
| **图片间导航** | 左/右方向键 (聚焦模式下) |

**关键设计**: 滚轮可配置为 缩放(默认)/平移/无动作。Ctrl 修饰键始终强制缩放。支持 3DConnexion SpaceMouse。

### 3.2 图片管理

**添加图片**:
- 从文件管理器/浏览器 **拖放**
- **Ctrl+V 粘贴** 剪贴板图片 (自动嵌入)
- **粘贴 URL** -- 自动抓取该页面所有图片
- **Ctrl+I** 文件浏览器导入
- 新图片自动选中，可配置自动排列 (最优/按名称/按添加顺序)

**存储**: 图片可嵌入 .pur 文件或链接到本地路径。Ctrl+Shift+J 管理嵌入/链接。

### 3.3 图片操作

| 操作 | 方式 |
|------|------|
| **移动** | 左键拖拽 |
| **轴锁定移动** | Shift+拖拽 = 锁定横/纵 |
| **邻近吸附移动** | Shift+Space+拖拽 = 自动吸附到邻近图片边缘 |
| **缩放** | 角点拖拽 (保持比例) / Alt+角点拖拽 (从中心缩放) |
| **旋转** | 角点外拖拽 / Ctrl+拖拽 / Ctrl+Shift 锁定45度 |
| **翻转** | Alt+Shift+H (水平) / Alt+Shift+V (垂直) |
| **裁剪** | C+拖拽 = 裁剪框 / V+拖拽 = 裁剪内平移 / 非破坏性 |
| **透明度** | Ctrl+Alt+Shift+拖拽 左右调整 / Ctrl+Plus/Minus 步进10% |
| **灰度** | Alt+G 单图切换 / Ctrl+Alt+G 全画布 |
| **双线性采样** | Alt+T 切换平滑/像素 |
| **复制** | Ctrl+D |

### 3.4 布局功能

| 快捷键 | 功能 |
|---------|------|
| Ctrl+P | **最优排列** -- 自动密铺适应窗口大小 |
| Ctrl+Alt+P | 排列+优化画布 |
| Ctrl+Alt+N | 按文件名排列 |
| Ctrl+Alt+A | 按添加顺序排列 |
| Ctrl+Alt+R | 随机排列 |
| Ctrl+方向键 | 对齐 (左/右/上/下) |
| Ctrl+Alt+S | 堆叠 (按层序重叠) |
| Ctrl+Alt+Shift+Up/Down | 水平/垂直等距分布 |

**标准化尺寸**:
- Ctrl+Alt+Left = 统一高度
- Ctrl+Alt+Right = 统一宽度
- Ctrl+Alt+Up = 统一大小
- Ctrl+Alt+Down = 统一缩放比例

### 3.5 网格与吸附 (v2.1 新增)

- G键切换网格可见性
- 线网格 / 点网格两种样式
- 吸附功能可独立于网格可见性 (网格隐藏时仍可吸附)

### 3.6 窗口模式 (桌面特有)

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| **置顶** | Ctrl+Shift+A | 始终在所有窗口上方 |
| **绑定应用** | Ctrl+Alt+Shift+A | 仅在指定应用上方 |
| **置底** | Ctrl+Shift+B | 在所有窗口下方(桌面壁纸) |
| **窗口锁定** | Ctrl+W | 防止窗口被移动/调整 |
| **画布锁定** | Ctrl+R | 防止画布内容被操作 |
| **鼠标穿透** | Ctrl+T | 鼠标点击穿透到下层应用 |
| **覆盖模式** | Ctrl+Y | 每张图片变独立浮动窗口 |

### 3.7 主题与透明

- Alt+1/2/3 = 暗色/亮色/玻璃(透明背景)预设
- Ctrl+Shift+Plus/Minus = 调整窗口整体透明度
- 玻璃模式 + 鼠标穿透 = 半透明参考叠加工作流

### 3.8 分组与层次 (v2.0)

- **Ctrl+G** 编组 / **Ctrl+Shift+G** 取消编组
- 组背景色和透明度可自定义
- 组默认锁定: 单击选组，双击进入组内选择
- **Ctrl+J** 打开层次面板 -- 树状结构显示所有元素
- 父子关系: 移动父级时子级跟随

### 3.9 独特功能

| 功能 | 说明 | Web可行性 |
|------|------|-----------|
| **取色器** | S+左键任意像素取色，可拖出窗口取色 | canvas getImageData |
| **坐标工具** | D+左键显示图片内X/Y像素坐标 | canvas 坐标计算 |
| **GIF 播放** | 完整播放控制、逐帧、速度调节 | Web 原生支持 |
| **URL 抓图** | 粘贴URL自动下载页面所有图片 | 需后端代理 |
| **幻灯片** | 自动循环显示图片(默认10秒) | setInterval |
| **绘图标注** | 画笔、直线、矩形、椭圆、箭头 | canvas/SVG |
| **富文本笔记** | 粗体、列表、链接、复选框 | contenteditable |
| **命令面板** | Ctrl+Shift+P 搜索执行命令 | Cmd+K 模式 |
| **非破坏性** | 所有变换可还原 | 数据层保存原始值 |

### 3.10 保存与导出

- `.pur` 格式 -- 单文件包含所有图片、位置、变换、组、绘图
- 自动保存 (默认每5分钟)
- 导出: 整个画布为图片 / 选中为图片 / 所有图片单独导出
- 支持 JPG/PNG/BMP/原始格式

---

## 4. 交互模式对比

### 4.1 导航操作对比

| 操作 | Figma | Miro | PureRef |
|------|-------|------|---------|
| 平移 | Space+拖拽 | Space+拖拽 | Alt+左键 / 中键 |
| 缩放 | Cmd+滚轮 / 捏合 | 滚轮(Mouse)/Cmd+滚轮(TP) | 滚轮 / Z+拖拽 |
| 适应全部 | Shift+1 | Alt+1 | Ctrl+Space |
| 适应选中 | Shift+2 | Alt+2 | Space / 双击 |
| 100% | Cmd+0 | Cmd+0 | Ctrl+0 |
| Minimap | 无(插件) | M键 | 无(层次面板替代) |

### 4.2 对象操作对比

| 操作 | Figma | Miro | PureRef |
|------|-------|------|---------|
| 选择 | 单击 | 单击 | 单击 |
| 多选 | Shift+单击 | Shift+单击 | Shift+单击 |
| 框选 | 拖拽空白 | 拖拽空白 | 拖拽空白 |
| 复制移动 | Alt+拖拽 | Alt+拖拽 | Ctrl+D 后拖拽 |
| 等比缩放 | Shift+角点 | 默认等比 | 默认等比 |
| 旋转 | 角点外 | 旋转手柄 | Ctrl+拖拽 |
| 编组 | Cmd+G | Cmd+G | Ctrl+G |
| 层序 | Cmd+]/[ | PgUp/PgDn | Up/Down |
| Undo | Cmd+Z | Cmd+Z | Ctrl+Z |

### 4.3 布局工具对比

| 功能 | Figma | Miro | PureRef |
|------|-------|------|---------|
| 自动排列 | Tidy Up (Ctrl+Alt+T) | Frame Grid | Pack All (Ctrl+P) |
| 对齐 | Alt+A/D/W/S | 浮动工具栏 | Ctrl+方向键 |
| 等距分布 | Ctrl+Alt+H/V | 浮动工具栏 | Ctrl+Alt+Shift+方向 |
| 网格吸附 | 像素网格 | G键网格 | G键网格(v2.1) |
| 标准化尺寸 | 无 | 无 | 统一高度/宽度/面积 |

### 4.4 差异化特色

| 工具 | 最大优势 | RefBoard 借鉴价值 |
|------|----------|------------------|
| **Figma** | Auto Layout、智能辅助线、精确设计 | Tidy Up、Alt距离测量、数字键透明度 |
| **Miro** | 协作、模板丰富、无限画布 | Mouse/Trackpad模式切换、Frame区域组织 |
| **PureRef** | 轻量专注、图片操作丰富、置顶工作流 | Pack最优排列、标准化尺寸、灰度切换、非破坏裁剪 |

---

## 5. RefBoard 建议

### 5.1 必须实现 (P0)

基于三款竞品的共同模式，以下是 RefBoard 画布交互的必备功能:

| 功能 | 说明 | 参考 |
|------|------|------|
| **Space+拖拽平移** | 三款产品共识 | Figma/Miro |
| **滚轮缩放 (光标为中心)** | 缩放锚定到鼠标位置 | Figma |
| **双指手势 (trackpad)** | 平移+捏合缩放 | 全部 |
| **框选** | 拖拽空白处画矩形选择 | 全部 |
| **Shift+点击多选** | 加/减选 | 全部 |
| **角点等比缩放** | 图片卡片拖角缩放 | 全部 |
| **Cmd+Z/Shift+Cmd+Z** | Undo/Redo | 全部 |
| **Delete 删除** | 移除选中元素 | 全部 |
| **Tidy Up / Auto-Pack** | 一键自动排列为网格 | Figma Tidy Up / PureRef Pack |
| **智能对齐线** | 拖拽时显示对齐参考 | Figma/Miro |

### 5.2 推荐实现 (P1)

| 功能 | 说明 | 参考 |
|------|------|------|
| **Alt+拖拽复制** | 快速复制图片 | Figma/Miro |
| **Minimap** | 已有基础，优化点击导航 | Miro |
| **快捷键工具激活** | V=选择, H=手型, T=文本 等 | Figma/Miro |
| **灰度切换** | Alt+G 单图/全画布灰度 | PureRef |
| **数字键透明度** | 1-9=10%-90%, 0=100% | Figma |
| **标准化尺寸** | 统一选中图片的高度/宽度 | PureRef |
| **Cmd+]/[ 层序** | 快速调整前后层叠 | Figma |
| **适应全部/选中** | Shift+1 适应全部, Shift+2 适应选中 | Figma |
| **命令面板** | Cmd+K 搜索执行命令 | PureRef/Figma |
| **网格吸附** | G键切换网格, 拖拽吸附 | PureRef/Miro |

### 5.3 可选实现 (P2)

| 功能 | 说明 | 参考 |
|------|------|------|
| **非破坏裁剪** | C键框选裁剪，保留原始数据 | PureRef |
| **评论图钉** | 在画布上钉评论 | Figma/Miro |
| **绘图标注** | 画笔/箭头/矩形标注 | PureRef |
| **旋转** | 角点外拖拽旋转 | Figma/PureRef |
| **Alt+悬停距离测量** | 显示对象间精确像素距离 | Figma |
| **Mouse/Trackpad模式** | 切换滚轮行为 | Miro |
| **URL抓图** | 粘贴URL自动下载页面图片 | PureRef |
| **幻灯片模式** | 自动循环展示参考图 | PureRef |

### 5.4 推荐快捷键映射

综合三款产品最佳实践，推荐 RefBoard 快捷键:

```
导航:
  Space+拖拽     平移
  滚轮           缩放
  Shift+1        适应全部
  Shift+2        适应选中
  Cmd+0          100%

工具:
  V              选择工具
  H              手型工具
  T              文本工具
  C              评论工具
  G              切换网格
  M              切换 Minimap

编辑:
  Cmd+Z          撤销
  Shift+Cmd+Z    重做
  Cmd+G          编组
  Shift+Cmd+G    取消编组
  Cmd+D          复制
  Delete         删除
  Cmd+]          上移一层
  Cmd+[          下移一层

布局:
  Cmd+Shift+T    Tidy Up (自动排列)
  Alt+A/D/W/S    对齐 左/右/上/下
  Alt+H/V        水平/垂直居中

视觉:
  1-9, 0         快速设置透明度
  Alt+G          灰度切换
  Cmd+K          命令面板
```

### 5.5 AI-First 差异化

RefBoard 相比竞品的核心差异是 **AI-First**:

| RefBoard 独有 | 竞品对应 | 优势 |
|---------------|----------|------|
| `refboard analyze` 自动分析图片 | 无 | 自动生成标签/描述 |
| AI 标签过滤+聚合 | 手动标签 | 语义理解，不止关键词匹配 |
| CLI 操作 (Agent友好) | GUI only | AI agent 可自动化操作 |
| `refboard ask` 对 board 提问 | 无 | 图片集合的语义理解 |
| 单文件 HTML 输出 | 需要账号/应用 | 零依赖分享 |

---

## 参考来源

### Figma
- [Figma Keyboard Shortcuts](https://help.figma.com/hc/en-us/articles/360040328653)
- [Figma Shortcuts Reference](https://www.figmashortcuts.com/)
- [Select layers and objects](https://help.figma.com/hc/en-us/articles/360040449873)
- [Adjust alignment, rotation, position](https://help.figma.com/hc/en-us/articles/360039956914)
- [Auto Layout Guide](https://help.figma.com/hc/en-us/articles/360040451373)
- [Smart Selection](https://help.figma.com/hc/en-us/articles/360040450233)
- [Scale Tool](https://help.figma.com/hc/en-us/articles/360040451453)
- [Canvas Guides](https://help.figma.com/hc/en-us/articles/360040449713)
- [Comments](https://help.figma.com/hc/en-us/articles/360041068574)
- [Zoom and View Options](https://help.figma.com/hc/en-us/articles/360041065034)
- [Version History](https://help.figma.com/hc/en-us/articles/360038006754)
- [Navigating UI3](https://help.figma.com/hc/en-us/articles/23954856027159)

### Miro
- [Miro Shortcuts](https://miro.com/shortcuts/)
- [Miro Keyboard Shortcuts - DefKey](https://defkey.com/miro-whiteboard-shortcuts)
- [Mouse, Trackpad, Touchscreen](https://help.miro.com/hc/en-us/articles/360017731053)
- [Working with Objects](https://help.miro.com/hc/en-us/articles/360017730953)
- [Toolbars](https://help.miro.com/hc/en-us/articles/360017730553)
- [Frames](https://help.miro.com/hc/en-us/articles/360018261813)
- [Snap to Grid - Community](https://community.miro.com/ideas/snap-to-grid-205)

### PureRef
- [PureRef Navigation Handbook](https://www.pureref.com/handbook/navigation/)
- [PureRef Features Handbook](https://www.pureref.com/handbook/features/)
- [PureRef Images Handbook](https://www.pureref.com/handbook/images/)
- [PureRef Organize Handbook](https://www.pureref.com/handbook/images/organize/)
- [PureRef Canvas Handbook](https://www.pureref.com/handbook/canvas/)
- [PureRef Settings Handbook](https://www.pureref.com/handbook/settings/)
- [PureRef Save/Load Handbook](https://www.pureref.com/handbook/saveload/)
- [PureRef All Shortcuts](https://www.pureref.com/handbook/shortcuts/all-shortcuts/)
- [PureRef 2.0 Blog](https://www.pureref.com/blog/pureref2/)
- [PureRef 2.1 Blog](https://www.pureref.com/blog/pureref21/)
- [PureRef 2.1 - CG Channel](https://www.cgchannel.com/2026/02/pureref-2-1-is-out/)

---

*最后更新: 2026-02-14*
