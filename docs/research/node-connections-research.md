# Node Connection System 调研报告

> 为 Deco 画布实现类似 Figma/FigJam 的节点连接线功能
> 日期：2026-02-17

---

## 1. Figma 参考分析

### 1.1 Figma Prototype Flow 连接

Figma 的 Prototype 模式中，用户可以在 Frame 之间创建流程连接（prototype noodles）：

**核心概念：**
- **Hotspot**：交互的起始元素（Frame 本身或 Frame 内的子元素）
- **Connection**：连接两端的箭头线（称为 "noodle"）
- **Destination**：连接的目标 Frame

**交互模式：**
1. 选中元素后，在 Prototype 面板中出现 "+" 图标
2. 从元素边缘的 "+" 拖拽到目标 Frame
3. 松开后建立连接，可配置 Trigger 和 Action
4. 支持批量选择多个元素连接到同一目标

**视觉样式：**
- 蓝色 Bezier 曲线（cubic bezier）
- 起点有圆形锚点，终点有箭头
- 未连接时显示蓝色虚线预览
- 连接线有抗锯齿，2px 宽度
- 连接线避免穿过其他 Frame（智能路由）

### 1.2 FigJam Connector 工具

FigJam 的 Connector 工具更接近 Deco 的使用场景：

**连接方式：**
1. 选择 Connector 工具（快捷键 L 或 Shift+C）
2. 鼠标悬停在元素上，边缘出现连接锚点（4 个边中点）
3. 从锚点拖拽到另一个元素的锚点
4. 也可以从空白处开始/结束（自由连接点）

**线型：**
- **Straight（直线）**：两点之间的直线
- **Curved（曲线）**：Bezier 曲线，有一个可拖拽的中间控制点
- **Elbowed（折线）**：90 度转角的折线路径

**箭头样式：**
- 无箭头（双向关系）
- 单向箭头（流程方向）
- 双向箭头

**连接标签：**
- 可以在连接线中间添加文字标签
- 标签有白色背景，居中显示在线上

**交互：**
- Hover 时高亮显示
- 点击选中，显示端点和控制点手柄
- 可拖拽端点到新的目标重新连接
- Delete 删除连接

### 1.3 对 Deco 的启示

Deco 是 Moodboard 工具，连接线的主要用途是：
- 表达图片之间的关系/灵感来源
- 创建视觉流程（情绪板的叙事线）
- 标注参考关系

因此更接近 FigJam 的 Connector 模式，而非 Figma Prototype 的交互流程。

---

## 2. 数据模型设计

### 2.1 Connection 数据结构

参考 React Flow 的 Edge 模型，结合 Deco 现有的卡片系统设计：

```javascript
// 单条连接的数据模型
{
  id: 'conn-1708123456-ab3f',     // 唯一 ID
  source: 'image-path-or-id',      // 源卡片标识（图片 path 或 text/shape id）
  target: 'image-path-or-id',      // 目标卡片标识
  sourceAnchor: 'right',           // 源锚点位置: 'top' | 'right' | 'bottom' | 'left' | 'auto'
  targetAnchor: 'left',            // 目标锚点位置: 同上
  lineType: 'bezier',              // 线型: 'bezier' | 'straight' | 'elbow'
  arrowType: 'end',                // 箭头: 'none' | 'end' | 'start' | 'both'
  color: 0x409cff,                 // 连接线颜色
  strokeWidth: 2,                  // 线宽
  label: '',                       // 可选标签文字
  lineStyle: 'solid',              // 'solid' | 'dashed'
}
```

### 2.2 Board State 扩展

在现有 `board.json` 中新增 `connections` 字段：

```javascript
// getBoardState() 返回值扩展
{
  version: 3,  // 版本号升级
  viewport: { x, y, zoom },
  items: [...],
  textAnnotations: [...],
  shapeAnnotations: [...],
  groups: [...],
  zOrder: [...],
  connections: [   // 新增
    {
      id: 'conn-xxx',
      source: 'path/to/image1.jpg',
      target: 'path/to/image2.jpg',
      sourceAnchor: 'right',
      targetAnchor: 'left',
      lineType: 'bezier',
      arrowType: 'end',
      color: 0x409cff,
      strokeWidth: 2,
      label: 'inspired by',
      lineStyle: 'solid',
    },
  ],
}
```

### 2.3 卡片标识策略

现有卡片标识方式：
- 图片卡片：`card.data.path`（文件路径）
- 文本卡片：`card.data.id`（如 `text-1708123456-ab3f`）
- 图形卡片：`card.data.id`（如 `shape-1708123456-cd5e`）

连接的 `source` / `target` 使用同样的 key 策略：
```javascript
function getCardKey(card) {
  return (card.isText || card.isShape) ? card.data.id : card.data.path;
}
```

这与现有 `getBoardState()` 中 `zOrder` 和 `groups.cardPaths` 的 key 策略完全一致。

### 2.4 Runtime State 扩展

在 `state.js` 中新增：

```javascript
export const state = {
  // ... 现有字段 ...
  
  allConnections: [],        // Connection 对象数组
  connectionGfx: null,       // Graphics layer for all connections
  connectionPortGfx: null,   // Graphics layer for hover port indicators
  dragConnection: null,       // 正在拖拽创建的临时连接
};
```

### 2.5 Connection Runtime 对象

```javascript
// Runtime connection 对象（非持久化的部分）
{
  id: 'conn-xxx',
  data: { /* 持久化数据，同 2.1 */ },
  sourceCard: cardRef,      // 运行时引用
  targetCard: cardRef,      // 运行时引用
  graphics: Graphics,       // PixiJS Graphics 对象
  labelText: Text,          // PixiJS Text 对象（可选）
  hitArea: Graphics,        // 透明宽 hitArea 用于交互
}
```

---

## 3. PixiJS 实现方案

### 3.1 连接线渲染层

连接线应该放在 `world` 容器中，z-index 在卡片下方（或可配置）：

```javascript
// 在 initCanvas() 中添加连接层
state.connectionLayer = new Container();
state.connectionLayer.zIndex = -2;  // 在 group borders (-1) 下方
state.world.addChild(state.connectionLayer);

// Port 指示器层（在卡片上方）
state.connectionPortLayer = new Container();
state.connectionPortLayer.zIndex = 9990;
state.world.addChild(state.connectionPortLayer);
```

### 3.2 锚点（Anchor）计算

锚点是连接线在卡片边缘的接入点。支持四边中点和自动选择最近边：

```javascript
/**
 * 计算卡片的四个边中点锚点位置（世界坐标）
 */
function getAnchorPoints(card) {
  const x = card.container.x;
  const y = card.container.y;
  const w = card.cardWidth;
  const h = card.cardHeight;
  
  return {
    top:    { x: x + w / 2, y: y },
    right:  { x: x + w,     y: y + h / 2 },
    bottom: { x: x + w / 2, y: y + h },
    left:   { x: x,         y: y + h / 2 },
  };
}

/**
 * 自动选择最近的锚点对
 * 根据两个卡片的相对位置，自动选择最自然的连接锚点
 */
function getAutoAnchors(sourceCard, targetCard) {
  const sAnchors = getAnchorPoints(sourceCard);
  const tAnchors = getAnchorPoints(targetCard);
  
  let bestDist = Infinity;
  let bestSource = 'right';
  let bestTarget = 'left';
  
  for (const [sName, sPos] of Object.entries(sAnchors)) {
    for (const [tName, tPos] of Object.entries(tAnchors)) {
      const dx = tPos.x - sPos.x;
      const dy = tPos.y - sPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestSource = sName;
        bestTarget = tName;
      }
    }
  }
  
  return { sourceAnchor: bestSource, targetAnchor: bestTarget };
}
```

**智能锚点选择（推荐）：** 基于卡片相对方向选择锚点更自然：

```javascript
/**
 * 基于方向的智能锚点选择
 * 优先选择"面向对方"的边，而不是最近距离
 */
function getSmartAnchors(sourceCard, targetCard) {
  const sCx = sourceCard.container.x + sourceCard.cardWidth / 2;
  const sCy = sourceCard.container.y + sourceCard.cardHeight / 2;
  const tCx = targetCard.container.x + targetCard.cardWidth / 2;
  const tCy = targetCard.container.y + targetCard.cardHeight / 2;
  
  const dx = tCx - sCx;
  const dy = tCy - sCy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  let sourceAnchor, targetAnchor;
  
  if (absDx > absDy) {
    // 水平方向为主
    sourceAnchor = dx > 0 ? 'right' : 'left';
    targetAnchor = dx > 0 ? 'left' : 'right';
  } else {
    // 垂直方向为主
    sourceAnchor = dy > 0 ? 'bottom' : 'top';
    targetAnchor = dy > 0 ? 'top' : 'bottom';
  }
  
  return { sourceAnchor, targetAnchor };
}
```

### 3.3 Bezier 曲线绘制

核心渲染函数，使用 PixiJS 8 的 `bezierCurveTo`：

```javascript
import { Graphics } from 'pixi.js';

/**
 * 绘制连接线的 Bezier 曲线
 * 参考 React Flow 的 getBezierPath 控制点计算
 */
function drawConnectionCurve(gfx, sourcePos, targetPos, sourceAnchor, targetAnchor, opts = {}) {
  const { color = 0x409cff, strokeWidth = 2, lineStyle = 'solid' } = opts;
  
  // 计算控制点偏移量（控制曲线弯曲程度）
  const dx = Math.abs(targetPos.x - sourcePos.x);
  const dy = Math.abs(targetPos.y - sourcePos.y);
  const curvature = 0.4;  // 0-1, 值越大曲线越弯
  const offset = Math.max(50, Math.min(200, Math.max(dx, dy) * curvature));
  
  // 根据锚点方向计算控制点
  const cp1 = getControlPoint(sourcePos, sourceAnchor, offset);
  const cp2 = getControlPoint(targetPos, targetAnchor, offset);
  
  gfx.clear();
  gfx.moveTo(sourcePos.x, sourcePos.y);
  gfx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, targetPos.x, targetPos.y);
  
  if (lineStyle === 'dashed') {
    // 虚线需要手动采样曲线点
    drawDashedBezier(gfx, sourcePos, cp1, cp2, targetPos, color, strokeWidth);
  } else {
    gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
  }
}

/**
 * 根据锚点方向计算控制点
 */
function getControlPoint(pos, anchor, offset) {
  switch (anchor) {
    case 'top':    return { x: pos.x, y: pos.y - offset };
    case 'right':  return { x: pos.x + offset, y: pos.y };
    case 'bottom': return { x: pos.x, y: pos.y + offset };
    case 'left':   return { x: pos.x - offset, y: pos.y };
    default:       return { x: pos.x + offset, y: pos.y };
  }
}
```

### 3.4 直线和折线

```javascript
/**
 * 绘制直线连接
 */
function drawStraightLine(gfx, sourcePos, targetPos, opts = {}) {
  const { color = 0x409cff, strokeWidth = 2 } = opts;
  gfx.clear();
  gfx.moveTo(sourcePos.x, sourcePos.y);
  gfx.lineTo(targetPos.x, targetPos.y);
  gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
}

/**
 * 绘制折线连接（Elbow / Step）
 * 参考 React Flow 的 SmoothStep edge
 */
function drawElbowLine(gfx, sourcePos, targetPos, sourceAnchor, targetAnchor, opts = {}) {
  const { color = 0x409cff, strokeWidth = 2, borderRadius = 8 } = opts;
  
  gfx.clear();
  
  // 计算中间折点
  const midX = (sourcePos.x + targetPos.x) / 2;
  const midY = (sourcePos.y + targetPos.y) / 2;
  
  const isHorizontalSource = sourceAnchor === 'left' || sourceAnchor === 'right';
  const isHorizontalTarget = targetAnchor === 'left' || targetAnchor === 'right';
  
  gfx.moveTo(sourcePos.x, sourcePos.y);
  
  if (isHorizontalSource && isHorizontalTarget) {
    // 水平→水平：经过 midX 的折线
    gfx.lineTo(midX, sourcePos.y);
    gfx.lineTo(midX, targetPos.y);
    gfx.lineTo(targetPos.x, targetPos.y);
  } else if (!isHorizontalSource && !isHorizontalTarget) {
    // 垂直→垂直：经过 midY 的折线
    gfx.lineTo(sourcePos.x, midY);
    gfx.lineTo(targetPos.x, midY);
    gfx.lineTo(targetPos.x, targetPos.y);
  } else {
    // 混合：单次折弯
    if (isHorizontalSource) {
      gfx.lineTo(targetPos.x, sourcePos.y);
    } else {
      gfx.lineTo(sourcePos.x, targetPos.y);
    }
    gfx.lineTo(targetPos.x, targetPos.y);
  }
  
  gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
}
```

### 3.5 箭头绘制

```javascript
/**
 * 在连接线端点绘制箭头
 */
function drawArrowhead(gfx, tipPos, direction, opts = {}) {
  const { color = 0x409cff, size = 10, strokeWidth = 2 } = opts;
  
  // direction 是箭头指向的角度（弧度）
  const angle = direction;
  const halfAngle = 0.4;  // 箭头张角（弧度）
  
  const x1 = tipPos.x - size * Math.cos(angle - halfAngle);
  const y1 = tipPos.y - size * Math.sin(angle - halfAngle);
  const x2 = tipPos.x - size * Math.cos(angle + halfAngle);
  const y2 = tipPos.y - size * Math.sin(angle + halfAngle);
  
  gfx.moveTo(x1, y1);
  gfx.lineTo(tipPos.x, tipPos.y);
  gfx.lineTo(x2, y2);
  gfx.stroke({ color, width: strokeWidth, cap: 'round', join: 'round' });
}

/**
 * 计算 Bezier 曲线在 t=0 或 t=1 处的切线方向
 */
function getBezierTangentAngle(p0, cp1, cp2, p1, atEnd = true) {
  if (atEnd) {
    // t=1 处的切线方向 = p1 - cp2
    return Math.atan2(p1.y - cp2.y, p1.x - cp2.x);
  } else {
    // t=0 处的切线方向 = cp1 - p0
    return Math.atan2(cp1.y - p0.y, cp1.x - p0.x);
  }
}
```

### 3.6 虚线 Bezier 曲线

PixiJS 8 不原生支持虚线，需要手动采样曲线点：

```javascript
/**
 * 沿 Bezier 曲线绘制虚线
 */
function drawDashedBezier(gfx, p0, cp1, cp2, p1, color, strokeWidth, dash = 8, gap = 5) {
  // 采样曲线上的点
  const segments = 64;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(cubicBezierPoint(p0, cp1, cp2, p1, t));
  }
  
  // 计算每段弧长
  let totalLength = 0;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
    lengths.push(totalLength);
  }
  
  // 沿弧长绘制虚线
  let drawing = true;
  let d = 0;
  
  while (d < totalLength) {
    const segLen = drawing ? dash : gap;
    const end = Math.min(d + segLen, totalLength);
    
    if (drawing) {
      const startPt = getPointAtLength(points, lengths, d);
      const endPt = getPointAtLength(points, lengths, end);
      gfx.moveTo(startPt.x, startPt.y);
      gfx.lineTo(endPt.x, endPt.y);
    }
    
    d = end;
    drawing = !drawing;
  }
  
  gfx.stroke({ color, width: strokeWidth });
}

/**
 * Cubic Bezier 参数方程
 */
function cubicBezierPoint(p0, cp1, cp2, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p1.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p1.y,
  };
}

/**
 * 在曲线弧长的指定位置获取点坐标
 */
function getPointAtLength(points, lengths, targetLength) {
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] >= targetLength) {
      const segLength = lengths[i] - lengths[i - 1];
      const frac = segLength > 0 ? (targetLength - lengths[i - 1]) / segLength : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * frac,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * frac,
      };
    }
  }
  return points[points.length - 1];
}
```

### 3.7 连接线 Hit Testing

Bezier 曲线的点击检测不能用简单的矩形 hitArea。
需要"膨胀路径"检测：检查鼠标点到曲线的最小距离是否小于阈值。

```javascript
/**
 * 检测一个点是否"靠近" Bezier 曲线
 * @param {object} point - 待检测的点 {x, y}
 * @param {object} p0, cp1, cp2, p1 - Bezier 控制点
 * @param {number} threshold - 像素距离阈值（推荐 8-12）
 * @returns {boolean}
 */
function isPointNearBezier(point, p0, cp1, cp2, p1, threshold = 10) {
  // 在曲线上采样多个点，找最小距离
  const steps = 32;
  let minDist = Infinity;
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = cubicBezierPoint(p0, cp1, cp2, p1, t);
    const dx = point.x - pt.x;
    const dy = point.y - pt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    minDist = Math.min(minDist, dist);
  }
  
  return minDist <= threshold;
}

/**
 * 也可以用一个宽的透明 Graphics 对象作为 hit area
 * 绘制较粗的透明路径，利用 PixiJS 内置 hit testing
 */
function createConnectionHitArea(p0, cp1, cp2, p1) {
  const hitGfx = new Graphics();
  hitGfx.moveTo(p0.x, p0.y);
  hitGfx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);
  hitGfx.stroke({ color: 0xffffff, width: 20, alpha: 0.001 }); // 20px 宽的透明线
  hitGfx.eventMode = 'static';
  hitGfx.cursor = 'pointer';
  return hitGfx;
}
```

### 3.8 性能优化

**大量连接线的渲染策略：**

```javascript
/**
 * 方案 A（推荐）：单个 Graphics 对象绘制所有连接
 * 适合 < 200 条连接线
 * 优点：draw call 少，性能好
 * 缺点：单条选中需要额外逻辑
 */
function renderAllConnections() {
  state.connectionGfx.clear();
  
  for (const conn of state.allConnections) {
    if (!conn.sourceCard || !conn.targetCard) continue;
    
    const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
    const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
    
    drawConnectionOnGraphics(state.connectionGfx, sPos, tPos, conn.data);
  }
}

/**
 * 方案 B：每条连接一个 Graphics 对象
 * 适合需要单独交互的场景
 * 优点：每条连接可独立交互（hover/select）
 * 缺点：连接多时 draw call 增加
 */
function renderConnectionIndividual(conn) {
  if (!conn.graphics) {
    conn.graphics = new Graphics();
    state.connectionLayer.addChild(conn.graphics);
  }
  
  const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
  const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
  
  drawConnectionOnGraphics(conn.graphics, sPos, tPos, conn.data);
}

/**
 * 方案 C（最佳性能）：混合方案
 * - 未选中的连接用单个 Graphics 批量绘制
 * - 选中/hover 的连接用独立 Graphics 单独绘制
 */
```

**Viewport Culling 集成：**

```javascript
/**
 * 连接线的视口裁剪
 * 如果源和目标都不在视口内，则跳过渲染
 */
function isConnectionVisible(conn, viewBounds) {
  const sCard = conn.sourceCard;
  const tCard = conn.targetCard;
  
  // 宽松判断：只要源或目标在扩展视口内就渲染
  const pad = 200;
  const inView = (card) => {
    const cx = card.container.x;
    const cy = card.container.y;
    return cx + card.cardWidth > viewBounds.left - pad &&
           cx < viewBounds.right + pad &&
           cy + card.cardHeight > viewBounds.top - pad &&
           cy < viewBounds.bottom + pad;
  };
  
  return inView(sCard) || inView(tCard);
}
```

**更新频率控制：**

```javascript
/**
 * 连接线跟随卡片移动的更新策略
 * 不需要每帧更新，只在卡片位置变化时更新
 */
function requestConnectionRedraw() {
  if (state._connRAF) return;
  state._connRAF = requestAnimationFrame(() => {
    renderAllConnections();
    state._connRAF = null;
  });
}

// 在以下时机调用 requestConnectionRedraw():
// 1. 卡片拖拽时（globalpointermove 中）
// 2. 视口 pan/zoom 后
// 3. 卡片新增/删除时
// 4. 连接新增/删除时
```

---

## 4. 交互设计

### 4.1 创建连接的交互流程

**方案 A：专用 Connector 工具（推荐）**

```
1. 用户在工具栏选择 "Connector" 工具（快捷键 C）
2. 鼠标悬停在卡片上 → 卡片四边出现锚点（4 个蓝色圆点）
3. 从锚点拖拽 → 显示预览连接线（虚线跟随鼠标）
4. 拖到目标卡片上 → 目标卡片高亮 + 显示最近锚点
5. 松开鼠标 → 创建连接
6. 如果松开在空白处 → 取消创建
```

**方案 B：从卡片边缘直接拖拽**

```
1. 工具为 Select 状态
2. 鼠标悬停在卡片边缘 → 出现连接锚点提示
3. 从锚点拖拽开始创建
4. 其余同方案 A
```

**推荐使用方案 A**，因为：
- 避免与选择/拖拽手势冲突
- 交互意图更明确
- 与现有的 Text/Shape 工具模式一致

### 4.2 锚点视觉反馈

```javascript
/**
 * 在 hover 卡片时显示连接锚点
 */
function showConnectionPorts(card) {
  const anchors = getAnchorPoints(card);
  const portGfx = state.connectionPortGfx;
  portGfx.clear();
  
  const portRadius = 5;
  
  for (const [name, pos] of Object.entries(anchors)) {
    // 外圈 - 白色描边
    portGfx.circle(pos.x, pos.y, portRadius + 1)
      .stroke({ color: 0xffffff, width: 2 });
    // 内圈 - 蓝色填充
    portGfx.circle(pos.x, pos.y, portRadius)
      .fill({ color: THEME.selectBorder });
  }
}

function hideConnectionPorts() {
  state.connectionPortGfx.clear();
}
```

### 4.3 拖拽创建预览

```javascript
/**
 * 拖拽过程中的连接线预览
 */
function updateDragConnectionPreview(sourceCard, sourceAnchor, mouseWorldPos) {
  const sourcePos = getAnchorPosition(sourceCard, sourceAnchor);
  
  // 检查鼠标是否在某个卡片上
  const targetCard = findCardAtWorld(mouseWorldPos.x, mouseWorldPos.y);
  
  let targetPos, targetAnchor;
  
  if (targetCard && targetCard !== sourceCard) {
    // 吸附到目标卡片的最近锚点
    const result = getSmartAnchors(sourceCard, targetCard);
    targetAnchor = result.targetAnchor;
    targetPos = getAnchorPosition(targetCard, targetAnchor);
    // 高亮目标卡片
    showConnectionPorts(targetCard);
  } else {
    // 跟随鼠标
    targetPos = mouseWorldPos;
    targetAnchor = getOppositeAnchor(sourceAnchor);
    hideConnectionPorts();
  }
  
  // 绘制预览线（虚线样式）
  state.dragConnectionPreview.clear();
  drawConnectionCurve(state.dragConnectionPreview, sourcePos, targetPos, 
    sourceAnchor, targetAnchor, {
      color: THEME.selectBorder,
      strokeWidth: 2,
      lineStyle: 'dashed',
    });
}
```

### 4.4 连接线选择与删除

```javascript
/**
 * 选中连接线的视觉反馈
 */
function selectConnection(conn) {
  state.selectedConnection = conn;
  
  // 高亮显示连接线
  if (conn.graphics) {
    conn.graphics.clear();
    drawConnectionOnGraphics(conn.graphics, ...getConnPositions(conn), {
      ...conn.data,
      color: THEME.selectBorder,
      strokeWidth: conn.data.strokeWidth + 1,
    });
  }
  
  // 显示端点手柄（可拖拽重连）
  showConnectionEndpoints(conn);
}

/**
 * 显示连接线端点的可拖拽圆圈
 */
function showConnectionEndpoints(conn) {
  const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
  const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
  
  // 在两端绘制可拖拽的圆形手柄
  const handleRadius = 6;
  
  // Source handle
  conn._sourceHandle = new Graphics()
    .circle(sPos.x, sPos.y, handleRadius)
    .fill({ color: 0xffffff })
    .stroke({ color: THEME.selectBorder, width: 2 });
  conn._sourceHandle.eventMode = 'static';
  conn._sourceHandle.cursor = 'grab';
  
  // Target handle
  conn._targetHandle = new Graphics()
    .circle(tPos.x, tPos.y, handleRadius)
    .fill({ color: 0xffffff })
    .stroke({ color: THEME.selectBorder, width: 2 });
  conn._targetHandle.eventMode = 'static';
  conn._targetHandle.cursor = 'grab';
  
  state.connectionPortLayer.addChild(conn._sourceHandle, conn._targetHandle);
}
```

### 4.5 连接线标签

```javascript
import { Text, TextStyle } from 'pixi.js';

/**
 * 在连接线中点添加文字标签
 */
function addConnectionLabel(conn, text) {
  if (!text) return;
  
  const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
  const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
  
  // 计算 Bezier 中点（t=0.5）
  const offset = calculateOffset(sPos, tPos, conn.data.sourceAnchor, conn.data.targetAnchor);
  const cp1 = getControlPoint(sPos, conn.data.sourceAnchor, offset);
  const cp2 = getControlPoint(tPos, conn.data.targetAnchor, offset);
  const midPoint = cubicBezierPoint(sPos, cp1, cp2, tPos, 0.5);
  
  const labelStyle = new TextStyle({
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 11,
    fill: THEME.text,
    align: 'center',
  });
  
  const labelText = new Text({ text, style: labelStyle });
  labelText.anchor.set(0.5, 0.5);
  labelText.position.set(midPoint.x, midPoint.y);
  
  // 白色背景
  const labelBg = new Graphics();
  const padding = 4;
  labelBg.roundRect(
    midPoint.x - labelText.width / 2 - padding,
    midPoint.y - labelText.height / 2 - padding,
    labelText.width + padding * 2,
    labelText.height + padding * 2,
    4
  ).fill({ color: THEME.bg, alpha: 0.9 })
   .stroke({ color: THEME.cardBorder, width: 1 });
  
  conn.labelBg = labelBg;
  conn.labelText = labelText;
  state.connectionLayer.addChild(labelBg, labelText);
}
```

---

## 5. 代码示例：完整 Connection Module

以下是一个完整的 `connections.js` 模块框架，可作为 `desktop/src/canvas/connections.js` 的起点：

```javascript
// Deco 2.0 — Connection System
// desktop/src/canvas/connections.js

import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import { state, THEME } from './state.js';
import { screenToWorld } from './renderer.js';
import { markDirty } from './toolbar.js';

// ============================================================
// Constants
// ============================================================

const PORT_RADIUS = 5;
const ARROW_SIZE = 10;
const ARROW_ANGLE = 0.4;
const HIT_THRESHOLD = 12;
const DEFAULT_CURVATURE = 0.4;

// ============================================================
// Anchor Utilities
// ============================================================

export function getAnchorPoints(card) {
  const x = card.container.x;
  const y = card.container.y;
  const w = card.cardWidth;
  const h = card.cardHeight;
  return {
    top:    { x: x + w / 2, y: y },
    right:  { x: x + w,     y: y + h / 2 },
    bottom: { x: x + w / 2, y: y + h },
    left:   { x: x,         y: y + h / 2 },
  };
}

export function getAnchorPosition(card, anchor) {
  const anchors = getAnchorPoints(card);
  return anchors[anchor] || anchors.right;
}

export function getSmartAnchors(sourceCard, targetCard) {
  const sCx = sourceCard.container.x + sourceCard.cardWidth / 2;
  const sCy = sourceCard.container.y + sourceCard.cardHeight / 2;
  const tCx = targetCard.container.x + targetCard.cardWidth / 2;
  const tCy = targetCard.container.y + targetCard.cardHeight / 2;
  
  const dx = tCx - sCx;
  const dy = tCy - sCy;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      sourceAnchor: dx > 0 ? 'right' : 'left',
      targetAnchor: dx > 0 ? 'left' : 'right',
    };
  }
  return {
    sourceAnchor: dy > 0 ? 'bottom' : 'top',
    targetAnchor: dy > 0 ? 'top' : 'bottom',
  };
}

// ============================================================
// Bezier Math
// ============================================================

function getControlPoint(pos, anchor, offset) {
  switch (anchor) {
    case 'top':    return { x: pos.x, y: pos.y - offset };
    case 'right':  return { x: pos.x + offset, y: pos.y };
    case 'bottom': return { x: pos.x, y: pos.y + offset };
    case 'left':   return { x: pos.x - offset, y: pos.y };
    default:       return { x: pos.x + offset, y: pos.y };
  }
}

function cubicBezierPoint(p0, cp1, cp2, p1, t) {
  const mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p1.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p1.y,
  };
}

function computeControlPoints(sPos, tPos, sAnchor, tAnchor) {
  const dx = Math.abs(tPos.x - sPos.x);
  const dy = Math.abs(tPos.y - sPos.y);
  const offset = Math.max(50, Math.min(200, Math.max(dx, dy) * DEFAULT_CURVATURE));
  return {
    cp1: getControlPoint(sPos, sAnchor, offset),
    cp2: getControlPoint(tPos, tAnchor, offset),
  };
}

// ============================================================
// Rendering
// ============================================================

export function drawConnection(gfx, conn) {
  const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
  const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
  const { color, strokeWidth, lineType, arrowType } = conn.data;
  
  if (lineType === 'straight') {
    gfx.moveTo(sPos.x, sPos.y);
    gfx.lineTo(tPos.x, tPos.y);
    gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
  } else {
    // Default: bezier
    const { cp1, cp2 } = computeControlPoints(sPos, tPos,
      conn.data.sourceAnchor, conn.data.targetAnchor);
    gfx.moveTo(sPos.x, sPos.y);
    gfx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, tPos.x, tPos.y);
    gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
    
    // Arrows
    if (arrowType === 'end' || arrowType === 'both') {
      const angle = Math.atan2(tPos.y - cp2.y, tPos.x - cp2.x);
      drawArrow(gfx, tPos, angle, color, strokeWidth);
    }
    if (arrowType === 'start' || arrowType === 'both') {
      const angle = Math.atan2(sPos.y - cp1.y, sPos.x - cp1.x);
      drawArrow(gfx, sPos, angle, color, strokeWidth);
    }
  }
}

function drawArrow(gfx, tip, angle, color, strokeWidth) {
  const x1 = tip.x - ARROW_SIZE * Math.cos(angle - ARROW_ANGLE);
  const y1 = tip.y - ARROW_SIZE * Math.sin(angle - ARROW_ANGLE);
  const x2 = tip.x - ARROW_SIZE * Math.cos(angle + ARROW_ANGLE);
  const y2 = tip.y - ARROW_SIZE * Math.sin(angle + ARROW_ANGLE);
  
  gfx.moveTo(x1, y1).lineTo(tip.x, tip.y).lineTo(x2, y2);
  gfx.stroke({ color, width: strokeWidth, cap: 'round', join: 'round' });
}

export function renderAllConnections() {
  if (!state.connectionGfx) return;
  state.connectionGfx.clear();
  
  for (const conn of state.allConnections) {
    if (!conn.sourceCard?.container?.parent || !conn.targetCard?.container?.parent) continue;
    drawConnection(state.connectionGfx, conn);
  }
}

// ============================================================
// CRUD Operations
// ============================================================

export function createConnection(sourceCard, targetCard, opts = {}) {
  const { sourceAnchor, targetAnchor } = opts.sourceAnchor
    ? { sourceAnchor: opts.sourceAnchor, targetAnchor: opts.targetAnchor }
    : getSmartAnchors(sourceCard, targetCard);
  
  const conn = {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    data: {
      source: getCardKey(sourceCard),
      target: getCardKey(targetCard),
      sourceAnchor,
      targetAnchor,
      lineType: opts.lineType || 'bezier',
      arrowType: opts.arrowType || 'end',
      color: opts.color || THEME.selectBorder,
      strokeWidth: opts.strokeWidth || 2,
      label: opts.label || '',
      lineStyle: opts.lineStyle || 'solid',
    },
    sourceCard,
    targetCard,
  };
  
  state.allConnections.push(conn);
  renderAllConnections();
  markDirty();
  return conn;
}

export function deleteConnection(conn) {
  const idx = state.allConnections.indexOf(conn);
  if (idx >= 0) state.allConnections.splice(idx, 1);
  renderAllConnections();
  markDirty();
}

export function getCardKey(card) {
  return (card.isText || card.isShape) ? card.data.id : card.data.path;
}

// ============================================================
// Hit Testing
// ============================================================

export function findConnectionAt(worldX, worldY) {
  for (const conn of state.allConnections) {
    if (!conn.sourceCard || !conn.targetCard) continue;
    
    const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
    const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
    
    if (conn.data.lineType === 'straight') {
      if (isPointNearLine({ x: worldX, y: worldY }, sPos, tPos, HIT_THRESHOLD)) {
        return conn;
      }
    } else {
      const { cp1, cp2 } = computeControlPoints(sPos, tPos,
        conn.data.sourceAnchor, conn.data.targetAnchor);
      if (isPointNearBezier({ x: worldX, y: worldY }, sPos, cp1, cp2, tPos, HIT_THRESHOLD)) {
        return conn;
      }
    }
  }
  return null;
}

function isPointNearBezier(point, p0, cp1, cp2, p1, threshold) {
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = cubicBezierPoint(p0, cp1, cp2, p1, t);
    const dx = point.x - pt.x;
    const dy = point.y - pt.y;
    if (dx * dx + dy * dy <= threshold * threshold) return true;
  }
  return false;
}

function isPointNearLine(point, p0, p1, threshold) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  
  let t = ((point.x - p0.x) * dx + (point.y - p0.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = p0.x + t * dx;
  const closestY = p0.y + t * dy;
  const distX = point.x - closestX;
  const distY = point.y - closestY;
  
  return distX * distX + distY * distY <= threshold * threshold;
}

// ============================================================
// Serialization
// ============================================================

export function serializeConnections() {
  return state.allConnections.map(conn => ({
    id: conn.id,
    ...conn.data,
  }));
}

export function restoreConnections(savedConnections, cardByKey) {
  if (!savedConnections || savedConnections.length === 0) return;
  
  for (const saved of savedConnections) {
    const sourceCard = cardByKey.get(saved.source);
    const targetCard = cardByKey.get(saved.target);
    if (!sourceCard || !targetCard) continue;
    
    const conn = {
      id: saved.id,
      data: {
        source: saved.source,
        target: saved.target,
        sourceAnchor: saved.sourceAnchor || 'auto',
        targetAnchor: saved.targetAnchor || 'auto',
        lineType: saved.lineType || 'bezier',
        arrowType: saved.arrowType || 'end',
        color: saved.color || THEME.selectBorder,
        strokeWidth: saved.strokeWidth || 2,
        label: saved.label || '',
        lineStyle: saved.lineStyle || 'solid',
      },
      sourceCard,
      targetCard,
    };
    
    state.allConnections.push(conn);
  }
  
  renderAllConnections();
}

// ============================================================
// Cleanup on Card Deletion
// ============================================================

export function removeConnectionsForCard(card) {
  const key = getCardKey(card);
  const toRemove = state.allConnections.filter(
    c => c.data.source === key || c.data.target === key
  );
  for (const conn of toRemove) {
    const idx = state.allConnections.indexOf(conn);
    if (idx >= 0) state.allConnections.splice(idx, 1);
  }
  if (toRemove.length > 0) renderAllConnections();
}
```

---

## 6. 开源参考

### 6.1 React Flow / xyflow

- **仓库**：https://github.com/xyflow/xyflow
- **许可证**：MIT
- **特点**：
  - 最成熟的节点图编辑器库
  - Edge 数据模型设计优秀（source, target, sourceHandle, targetHandle）
  - 支持 4 种 edge 类型：bezier, straight, step, smoothstep
  - `getBezierPath` 工具函数提供了控制点计算的参考实现
  - `interactionWidth` 属性控制点击检测宽度
  - edge 支持 label, animated, markerStart/markerEnd, reconnectable
- **参考价值**：**高** - 数据模型和交互流程的最佳参考
- **不能直接使用**：React Flow 是 React 组件库，基于 SVG 渲染，无法在 PixiJS 中直接使用

### 6.2 react-diagrams

- **仓库**：https://github.com/projectstorm/react-diagrams
- **许可证**：MIT
- **特点**：
  - 更传统的 Node-Port-Link 模型
  - Port 的概念（每个 Node 可以有多个 Port）对 Deco 过于复杂
  - 支持自定义 Link 路由算法
  - 有 `@projectstorm/react-diagrams-routing` 包做路径路由
- **参考价值**：**中** - Port 模型可做参考，但整体过于复杂

### 6.3 Litegraph.js

- **仓库**：https://github.com/jagenjo/litegraph.js
- **许可证**：MIT
- **特点**：
  - 原生 Canvas 2D 渲染（非 React）
  - 为 ComfyUI 等节点编辑器使用
  - 连接线绘制用原生 Canvas bezierCurveTo
  - 有完整的 hit testing 实现
- **参考价值**：**高** - 连接线渲染逻辑可直接参考

### 6.4 pixi-graph（已过时）

- **仓库**：https://github.com/nickolaev/pixi-graph
- **状态**：基于旧版 PixiJS，长时间未更新
- **参考价值**：**低** - API 已过时，但证明 PixiJS 可实现图形连接

### 6.5 Drawflow

- **仓库**：https://github.com/jerosoler/Drawflow
- **许可证**：MIT
- **特点**：
  - 轻量级，无框架依赖
  - 基于 SVG path 绘制连接线
  - 数据模型简洁：`{ id, input, output, data }`
  - 有拖拽创建连接的完整实现
- **参考价值**：**中** - 轻量级设计理念值得借鉴

---

## 7. 实现建议

### 7.1 推荐方案

综合考虑 Deco 的技术栈（PixiJS 8 + Vanilla JS）、使用场景（Moodboard 参考关系）和现有代码架构，推荐以下实现方案：

**核心策略：**
1. 新建 `desktop/src/canvas/connections.js` 模块
2. 采用"独立 Connector 工具"交互模式（与 Text/Shape 工具一致）
3. 连接线统一用单个 Graphics 对象批量渲染（< 200 条连接时性能足够）
4. 选中的连接线用独立 Graphics 高亮显示
5. 数据持久化在 `board.json` 的 `connections` 字段

### 7.2 实施优先级

**Phase 1 -- MVP（建议先做）**
1. 添加 `connections.js` 模块，包含基本数据结构和渲染
2. 在 `state.js` 中添加 `allConnections` 和 `connectionGfx`
3. 在 `initCanvas()` 中初始化连接层
4. 实现 Bezier 曲线渲染（`drawConnection`）
5. 实现从卡片边缘拖拽创建连接（Connector 工具）
6. 在 `getBoardState()` / `restoreBoardState()` 中保存/恢复连接
7. 在 `deleteSelected()` 中清理相关连接
8. 快捷键：C 切换到 Connector 工具，Delete 删除选中连接

**Phase 2 -- 交互增强**
1. 连接线点击选中（hit testing）
2. 连接线 hover 高亮
3. 拖拽端点重新连接
4. 右键菜单：删除连接、切换箭头方向
5. Undo/Redo 支持

**Phase 3 -- 视觉增强**
1. 连接线标签
2. 多种线型切换（bezier / straight / elbow）
3. 虚线样式
4. 连接线颜色选择
5. 动画效果（流动虚线）

### 7.3 需要修改的现有文件

| 文件 | 修改内容 |
|------|----------|
| `desktop/src/canvas/state.js` | 新增 `allConnections`, `connectionGfx`, `connectionPortGfx`, `dragConnection` 状态字段；可能新增 `CONNECTION_TOOLS` Set |
| `desktop/src/canvas/index.js` | 初始化连接层；re-export connections 公共 API |
| `desktop/src/canvas/toolbar.js` | `getBoardState()` 中序列化连接；`restoreBoardState()` 中恢复连接；`setTool()` 支持 'connector' 工具 |
| `desktop/src/canvas/shortcuts.js` | 快捷键 C 切换 Connector 工具；`deleteSelected()` 中清理关联连接；context menu 新增连接操作 |
| `desktop/src/canvas/selection.js` | `setupGlobalDrag()` 中处理 connector 工具的拖拽创建流程 |
| `desktop/src/canvas/renderer.js` | `cullCards()` 中触发连接线重绘；`applyViewport()` 中触发重绘 |
| `desktop/src/floating-toolbar.js` | 可能需要新增连接线属性面板（颜色、线型、箭头） |

### 7.4 不需要新增依赖

整个实现方案使用纯 PixiJS 8 API：
- `Graphics.moveTo()` / `.lineTo()` / `.bezierCurveTo()` -- 曲线绘制
- `Graphics.stroke()` -- 描边样式
- `Graphics.circle()` -- 锚点绘制
- `Text` -- 标签文字
- `Container` -- 分层管理

不需要任何新的 npm 依赖或 Rust crate。

### 7.5 性能预期

| 连接数量 | 方案 | 预期性能 |
|----------|------|----------|
| < 50 | 单 Graphics 批量绘制 | 60 FPS，无压力 |
| 50-200 | 单 Graphics 批量绘制 | 60 FPS，偶尔 redraw 耗时 1-2ms |
| 200-500 | 混合方案（批量+视口裁剪） | 55-60 FPS |
| > 500 | 需要 LOD（缩小时简化为直线） | 需要额外优化 |

对于 Moodboard 场景，50-200 条连接线是最常见的范围，性能完全够用。

### 7.6 与现有功能的集成点

- **卡片拖拽**：`globalpointermove` 中每次卡片移动都需要触发 `requestConnectionRedraw()`
- **卡片删除**：`deleteSelected()` 中调用 `removeConnectionsForCard()`
- **卡片复制/粘贴**：粘贴时不复制连接（与 Figma 一致）
- **Group**：连接线不受 Group 影响，始终连接两个独立卡片
- **Minimap**：可选在 minimap 中绘制连接线（简化为直线）
- **Auto Layout (Tidy Up)**：不影响连接线（连接线自动跟随卡片位置更新）
- **Export PNG**：连接线会自动包含在导出中（因为在 world 容器内）

---

## 附录：技术名词对照

| 英文 | 中文 | 说明 |
|------|------|------|
| Connection / Edge | 连接线 | 两个节点之间的视觉连线 |
| Node | 节点/卡片 | Deco 中的 card |
| Anchor / Port / Handle | 锚点 | 连接线在卡片上的接入点 |
| Bezier Curve | 贝塞尔曲线 | 最常用的连接线曲线类型 |
| Control Point | 控制点 | 决定贝塞尔曲线弯曲方向的点 |
| Noodle | 面条线 | Figma 社区对连接线的俗称 |
| Hit Testing | 命中检测 | 判断鼠标是否点击到了曲线上 |
| Elbow / Step | 折线 | 只有 90 度转角的连接线 |
| Curvature | 曲率 | 控制贝塞尔曲线的弯曲程度 |
