# Node Connection System — 执行方案

> Branch: `feature/node-connections`
> 基于: `docs/research/node-connections-research.md`
> 状态: Phase 1 已实现 (2026-02)

---

## 概览

为 Deco 画布添加节点连接系统，让卡片/图形/文本可以通过 Bezier 曲线连接。
共分 3 个 Phase，本文档详细描述 **Phase 1 (MVP)** 的每一步。

---

## Phase 1: MVP — 基础连接系统

目标：能创建、显示、持久化、删除连接线。

### Step 1: 扩展 state.js

**文件:** `desktop/src/canvas/state.js`

新增状态字段（在 `state` 对象中，`activeFilter` 之后）：

```javascript
// Connection state
allConnections: [],      // 所有连接 [{id, data, sourceCard, targetCard}]
connectionGfx: null,     // 批量绘制连接线的 Graphics
connectionPortGfx: null, // 锚点提示的 Graphics
dragConnection: null,    // 拖拽创建连接时的临时状态
selectedConnection: null, // 当前选中的连接线
```

新增常量（在文件末尾 SHAPE_TOOLS 附近）：

```javascript
// Connection constants
export const CONNECTION_PORT_RADIUS = 5;
export const CONNECTION_HIT_THRESHOLD = 12;
export const CONNECTION_ARROW_SIZE = 10;
export const CONNECTION_DEFAULT_CURVATURE = 0.4;
export const CONNECTION_TOOLS = new Set(['connector']);
```

---

### Step 2: 创建 connections.js 核心模块

**文件:** `desktop/src/canvas/connections.js` (新建)

**模块结构（~350 行）：**

```
imports: Graphics, Text, TextStyle from pixi.js + state, THEME + screenToWorld + markDirty

── Constants ──
PORT_RADIUS, ARROW_SIZE, ARROW_ANGLE, HIT_THRESHOLD, DEFAULT_CURVATURE

── Anchor Utilities ──
getAnchorPoints(card) → {top, right, bottom, left}
getAnchorPosition(card, anchor) → {x, y}
getSmartAnchors(sourceCard, targetCard) → {sourceAnchor, targetAnchor}
getCardKey(card) → string (path or id)

── Bezier Math ──
getControlPoint(pos, anchor, offset) → {x, y}
cubicBezierPoint(p0, cp1, cp2, p1, t) → {x, y}
computeControlPoints(sPos, tPos, sAnchor, tAnchor) → {cp1, cp2}

── Rendering ──
drawConnection(gfx, conn)                    // 绘制单条连接
drawArrow(gfx, tip, angle, color, width)     // 绘制箭头
renderAllConnections()                        // 批量重绘所有连接
requestConnectionRedraw()                     // RAF 节流重绘

── CRUD ──
createConnection(sourceCard, targetCard, opts) → conn
deleteConnection(conn)
removeConnectionsForCard(card)                // 删除卡片时清理关联连接

── Port/Anchor 视觉 ──
showConnectionPorts(card)                     // hover 时显示 4 个锚点
hideConnectionPorts()
findNearestAnchor(card, worldX, worldY)       // 找最近锚点

── Hit Testing ──
findConnectionAt(worldX, worldY)              // 点击检测
isPointNearBezier(point, p0, cp1, cp2, p1, threshold)
isPointNearLine(point, p0, p1, threshold)

── Serialization ──
serializeConnections() → array               // for getBoardState()
restoreConnections(savedConnections, cardByKey) // for restoreBoardState()
```

**Exports:**
- `getAnchorPoints`, `getAnchorPosition`, `getSmartAnchors`, `getCardKey`
- `renderAllConnections`, `requestConnectionRedraw`
- `createConnection`, `deleteConnection`, `removeConnectionsForCard`
- `showConnectionPorts`, `hideConnectionPorts`, `findNearestAnchor`
- `findConnectionAt`
- `serializeConnections`, `restoreConnections`

---

### Step 3: 初始化连接层

**文件:** `desktop/src/canvas/index.js`

在 `initCanvas()` 中，world 容器创建后，guideGfx 创建前，插入：

```javascript
// Connection layer (behind cards, in world space)
state.connectionGfx = new Graphics();
state.connectionGfx.zIndex = -2;  // 在所有卡片下方
state.world.addChild(state.connectionGfx);

// Connection port overlay (above cards, in world space)
state.connectionPortGfx = new Graphics();
state.connectionPortGfx.zIndex = 9990;  // 在卡片上方但在 guide 下方
state.world.addChild(state.connectionPortGfx);
```

在 toolMap 中新增 connector 工具映射：

```javascript
const toolMap = { 'Select': 'select', 'Hand': 'hand', 'Note': 'text',
  'Rect': 'rect', 'Ellipse': 'ellipse', 'Line': 'line', 'Connect': 'connector' };
```

在 re-exports 区域新增：

```javascript
// connections.js
export {
  createConnection, deleteConnection, removeConnectionsForCard,
  renderAllConnections, requestConnectionRedraw,
  serializeConnections, restoreConnections,
  findConnectionAt,
} from './connections.js';
```

---

### Step 4: Connector 工具 + 拖拽创建

**文件:** `desktop/src/canvas/toolbar.js`

在 `setTool()` 函数中：

```javascript
// titles 映射新增 connector
const titles = { select: 'Select', hand: 'Hand', text: 'Note', rect: 'Rect',
  ellipse: 'Ellipse', line: 'Line', connector: 'Connect' };

// cursor 分支新增 connector
state.app.canvas.style.cursor = tool === 'hand' ? 'grab'
  : tool === 'text' ? 'text'
  : SHAPE_TOOLS.has(tool) ? 'crosshair'
  : tool === 'connector' ? 'crosshair'
  : 'default';
```

**文件:** `desktop/src/canvas/selection.js`

在 `setupGlobalDrag()` 的 `globalpointermove` handler 中，新增 case：

```javascript
case 'drawConnection': {
  const wp = screenToWorld(e.global.x, e.global.y);
  updateDragConnectionPreview(state.dragState, wp);
  break;
}
```

在 `pointerdown` handler 中（SHAPE_TOOLS 判断之后），新增：

```javascript
if (state.currentTool === 'connector') {
  // 检查是否点在某个卡片上
  const wp = screenToWorld(e.global.x, e.global.y);
  const hitCard = findCardAtWorld(wp.x, wp.y);
  if (hitCard) {
    const anchor = findNearestAnchor(hitCard, wp.x, wp.y);
    state.dragState = {
      type: 'drawConnection',
      sourceCard: hitCard,
      sourceAnchor: anchor,
      preview: new Graphics(),
    };
    state.dragState.preview.zIndex = 9999;
    state.world.addChild(state.dragState.preview);
  }
  return;
}
```

在 `finishDrag()` 中新增 `drawConnection` 类型的完成逻辑：

```javascript
case 'drawConnection': {
  if (state.dragState.preview) {
    state.world.removeChild(state.dragState.preview);
    state.dragState.preview.destroy();
  }
  hideConnectionPorts();
  // 检查落点是否在目标卡片上
  const wp = screenToWorld(e.global.x, e.global.y);
  const targetCard = findCardAtWorld(wp.x, wp.y);
  if (targetCard && targetCard !== state.dragState.sourceCard) {
    createConnection(state.dragState.sourceCard, targetCard, {
      sourceAnchor: state.dragState.sourceAnchor,
    });
  }
  break;
}
```

需要新增 helper: `findCardAtWorld(wx, wy)` — 遍历 allCards 找包含该点的卡片。

也需要新增 `updateDragConnectionPreview(dragState, wp)` — 绘制虚线预览。

---

### Step 5: 持久化（保存/恢复）

**文件:** `desktop/src/canvas/toolbar.js`

**`getBoardState()`** — version 升级到 3，新增 connections 字段：

```javascript
return {
  version: 3,  // 从 2 升级到 3
  viewport: { ... },
  items,
  textAnnotations,
  shapeAnnotations,
  groups,
  zOrder,
  connections: serializeConnections(),  // 新增
};
```

**`restoreBoardState()`** — 在 groups 恢复之后，新增连接恢复：

```javascript
// Restore connections (after all cards and groups are loaded)
if (savedState.connections && savedState.connections.length > 0) {
  const cardByKey3 = new Map();
  for (const card of state.allCards) {
    const key = (card.isText || card.isShape) ? card.data.id : card.data.path;
    cardByKey3.set(key, card);
  }
  restoreConnections(savedState.connections, cardByKey3);
}
```

注意：version 2 的 board.json 没有 connections 字段，向后兼容——不存在则跳过。

---

### Step 6: 删除联动

**文件:** `desktop/src/canvas/shortcuts.js`

在 `deleteSelected()` 中，`removeCardFromCanvas(card)` 调用之前，清理连接：

```javascript
for (const { card } of entries) {
  removeConnectionsForCard(card);  // 新增：删除关联连接
  removeCardFromCanvas(card);
}
```

---

### Step 7: 快捷键 + 拖拽时重绘

**文件:** `desktop/src/canvas/shortcuts.js`

在 `setupKeyboard()` 中新增：

```javascript
// C — Connector tool
if (key === 'c' && !ctrl && !meta && !shift) {
  setTool('connector');
  e.preventDefault();
  return;
}
```

**文件:** `desktop/src/canvas/selection.js`

在 `globalpointermove` 的 `card` 和 `multicard` case 末尾，新增：

```javascript
requestConnectionRedraw();  // 卡片移动时重绘连接线
```

**文件:** `desktop/src/canvas/renderer.js`

在 `applyViewport()` 中已有 `requestCull()`，不需要额外调用——因为连接层在 world 容器内，会随 world 缩放移动。但需要在 `cullCards()` 末尾触发连接线重绘（因为卡片可能被隐藏/显示）。

---

### Step 8: 工具栏 UI（Sidebar 按钮）

**文件:** `desktop/index.html`

在 sidebar tool buttons 区域，Line 按钮之后新增：

```html
<button class="sidebar-btn" title="Connect (C)">
  <!-- Lucide: move-diagonal or git-branch or arrow-right-from-line -->
  <svg>...</svg>
</button>
```

使用 Lucide icon: `move-diagonal` 或自定义连接线图标。

---

## 文件变更总览

| 文件 | 操作 | 变更量 |
|------|------|--------|
| `desktop/src/canvas/connections.js` | **新建** | ~350 行 |
| `desktop/src/canvas/state.js` | 修改 | +15 行（5 个状态 + 5 个常量） |
| `desktop/src/canvas/index.js` | 修改 | +15 行（2 个 Graphics + re-exports） |
| `desktop/src/canvas/toolbar.js` | 修改 | +20 行（setTool, getBoardState, restoreBoardState） |
| `desktop/src/canvas/selection.js` | 修改 | +50 行（drawConnection 拖拽 + finishDrag + 重绘） |
| `desktop/src/canvas/shortcuts.js` | 修改 | +5 行（快捷键 C + deleteSelected 清理） |
| `desktop/src/canvas/renderer.js` | 修改 | +2 行（cull 后触发连接重绘） |
| `desktop/index.html` | 修改 | +5 行（sidebar connector 按钮） |

**总计：** ~460 行新代码，~0 依赖

---

## 实施顺序（建议的 commit 序列）

1. **`feat: add connection state + constants`** — state.js 扩展
2. **`feat: add connections.js core module`** — 完整模块（anchor、bezier、render、CRUD、序列化）
3. **`feat: init connection layers in canvas`** — index.js 初始化 + re-exports
4. **`feat: connector tool + drag-to-create`** — selection.js 拖拽创建 + toolbar.js setTool
5. **`feat: persist connections in board state`** — toolbar.js getBoardState/restoreBoardState
6. **`feat: delete connections with cards + shortcut C`** — shortcuts.js 清理 + 快捷键
7. **`feat: redraw connections on card drag`** — selection.js + renderer.js 联动
8. **`style: add connector tool button to sidebar`** — HTML + icon

每步 commit 后可以 `npm run tauri dev` 增量验证。

---

## 连接数据格式

### 内存中的连接对象

```javascript
{
  id: 'conn-1708123456789-a1b2',
  data: {
    source: 'images/photo.jpg',       // getCardKey(sourceCard)
    target: 'text-abc123',             // getCardKey(targetCard)
    sourceAnchor: 'right',             // top | right | bottom | left
    targetAnchor: 'left',
    lineType: 'bezier',                // bezier | straight
    arrowType: 'end',                  // none | start | end | both
    color: 0x409cff,
    strokeWidth: 2,
    label: '',
    lineStyle: 'solid',               // solid | dashed
  },
  sourceCard: <card ref>,              // 运行时引用
  targetCard: <card ref>,              // 运行时引用
}
```

### board.json 中的序列化格式

```json
{
  "version": 3,
  "connections": [
    {
      "id": "conn-1708123456789-a1b2",
      "source": "images/photo.jpg",
      "target": "text-abc123",
      "sourceAnchor": "right",
      "targetAnchor": "left",
      "lineType": "bezier",
      "arrowType": "end",
      "color": 4234495,
      "strokeWidth": 2,
      "label": "",
      "lineStyle": "solid"
    }
  ]
}
```

---

## Phase 2: 交互增强（Phase 1 完成后）

- 连接线点击选中（`findConnectionAt()` 已在 Phase 1 实现）
- 连接线 hover 高亮
- 拖拽端点重新连接
- 右键菜单：删除连接、切换箭头方向
- Undo/Redo 支持（pushUndo type: 'createConnection' / 'deleteConnection'）

## Phase 3: 视觉增强（Phase 2 完成后）

- 连接线标签（Text + 背景）
- 多种线型切换（bezier / straight / elbow）
- 虚线样式
- 颜色选择器
- 浮动工具栏显示连接属性
- 动画效果（流动虚线）

---

## 验证清单

- [x] 选择 Connector 工具 → 从卡片拖拽到另一卡片 → 创建连接线
- [x] 连接线正确显示 Bezier 曲线 + 箭头
- [x] 拖拽卡片时连接线实时跟随
- [x] 保存项目 → 重新打开 → 连接线恢复
- [x] 删除卡片 → 关联连接线自动删除
- [x] 快捷键 C 切换到 Connector 工具
- [x] 缩放/平移画布时连接线位置正确
- [x] 空拖拽（松开在空白处）→ 不创建连接
- [ ] 100 条连接线时性能流畅（60 FPS）
