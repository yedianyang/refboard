// Deco 2.0 — Connection System
// Bezier connections between cards with anchors, hit testing, serialization

import { Graphics } from 'pixi.js';
import {
  state, THEME,
  CONNECTION_PORT_RADIUS, CONNECTION_HIT_THRESHOLD,
  CONNECTION_ARROW_SIZE, CONNECTION_DEFAULT_CURVATURE,
} from './state.js';
import { screenToWorld } from './renderer.js';
import { markDirty } from './toolbar.js';

// ============================================================
// Anchor Utilities
// ============================================================

const ARROW_ANGLE = 0.4;

export function getAnchorPoints(card) {
  const x = card.container.x;
  const y = card.container.y;
  const w = card.cardWidth;
  const h = card.cardHeight;
  return {
    top:    { x: x + w / 2, y },
    right:  { x: x + w,     y: y + h / 2 },
    bottom: { x: x + w / 2, y: y + h },
    left:   { x,             y: y + h / 2 },
  };
}

export function getAnchorPosition(card, anchor) {
  return getAnchorPoints(card)[anchor] || getAnchorPoints(card).right;
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

export function getCardKey(card) {
  return (card.isText || card.isShape) ? card.data.id : card.data.path;
}

export function findNearestAnchor(card, worldX, worldY) {
  const anchors = getAnchorPoints(card);
  let best = 'right';
  let bestDist = Infinity;
  for (const [name, pos] of Object.entries(anchors)) {
    const dx = worldX - pos.x;
    const dy = worldY - pos.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
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
  const offset = Math.max(50, Math.min(200, Math.max(dx, dy) * CONNECTION_DEFAULT_CURVATURE));
  return {
    cp1: getControlPoint(sPos, sAnchor, offset),
    cp2: getControlPoint(tPos, tAnchor, offset),
  };
}

// ============================================================
// Rendering
// ============================================================

function drawConnectionCurve(gfx, sPos, tPos, sAnchor, tAnchor, opts = {}) {
  const color = opts.color ?? THEME.selectBorder;
  const strokeWidth = opts.strokeWidth ?? 2;
  const lineType = opts.lineType ?? 'bezier';
  const arrowType = opts.arrowType ?? 'end';
  const lineStyle = opts.lineStyle ?? 'solid';

  if (lineType === 'straight') {
    gfx.moveTo(sPos.x, sPos.y).lineTo(tPos.x, tPos.y);
    gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
    if (arrowType === 'end' || arrowType === 'both') {
      const angle = Math.atan2(tPos.y - sPos.y, tPos.x - sPos.x);
      drawArrow(gfx, tPos, angle, color, strokeWidth);
    }
    if (arrowType === 'start' || arrowType === 'both') {
      const angle = Math.atan2(sPos.y - tPos.y, sPos.x - tPos.x);
      drawArrow(gfx, sPos, angle, color, strokeWidth);
    }
    return;
  }

  // Bezier
  const { cp1, cp2 } = computeControlPoints(sPos, tPos, sAnchor, tAnchor);

  if (lineStyle === 'dashed') {
    drawDashedBezier(gfx, sPos, cp1, cp2, tPos, color, strokeWidth);
  } else {
    gfx.moveTo(sPos.x, sPos.y);
    gfx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, tPos.x, tPos.y);
    gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
  }

  if (arrowType === 'end' || arrowType === 'both') {
    const angle = Math.atan2(tPos.y - cp2.y, tPos.x - cp2.x);
    drawArrow(gfx, tPos, angle, color, strokeWidth);
  }
  if (arrowType === 'start' || arrowType === 'both') {
    const angle = Math.atan2(sPos.y - cp1.y, sPos.x - cp1.x);
    drawArrow(gfx, sPos, angle, color, strokeWidth);
  }
}

function drawDashedBezier(gfx, p0, cp1, cp2, p1, color, strokeWidth) {
  const steps = 40;
  const dashLen = 8;
  const gapLen = 6;
  let drawing = true;
  let remain = dashLen;
  let prev = cubicBezierPoint(p0, cp1, cp2, p1, 0);
  gfx.moveTo(prev.x, prev.y);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pt = cubicBezierPoint(p0, cp1, cp2, p1, t);
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (segLen <= remain) {
      remain -= segLen;
      if (drawing) {
        gfx.lineTo(pt.x, pt.y);
      } else {
        gfx.moveTo(pt.x, pt.y);
      }
    } else {
      // Switch drawing state
      if (drawing) {
        gfx.lineTo(pt.x, pt.y);
        gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
      }
      drawing = !drawing;
      remain = drawing ? dashLen : gapLen;
      gfx.moveTo(pt.x, pt.y);
    }
    prev = pt;
  }
  if (drawing) {
    gfx.stroke({ color, width: strokeWidth, alpha: 0.85 });
  }
}

function drawArrow(gfx, tip, angle, color, strokeWidth) {
  const size = CONNECTION_ARROW_SIZE;
  const x1 = tip.x - size * Math.cos(angle - ARROW_ANGLE);
  const y1 = tip.y - size * Math.sin(angle - ARROW_ANGLE);
  const x2 = tip.x - size * Math.cos(angle + ARROW_ANGLE);
  const y2 = tip.y - size * Math.sin(angle + ARROW_ANGLE);
  gfx.moveTo(x1, y1).lineTo(tip.x, tip.y).lineTo(x2, y2);
  gfx.stroke({ color, width: strokeWidth, cap: 'round', join: 'round' });
}

export function renderAllConnections() {
  if (!state.connectionGfx) return;
  state.connectionGfx.clear();

  for (const conn of state.allConnections) {
    if (!conn.sourceCard?.container?.parent || !conn.targetCard?.container?.parent) continue;
    const sPos = getAnchorPosition(conn.sourceCard, conn.data.sourceAnchor);
    const tPos = getAnchorPosition(conn.targetCard, conn.data.targetAnchor);
    drawConnectionCurve(state.connectionGfx, sPos, tPos,
      conn.data.sourceAnchor, conn.data.targetAnchor, conn.data);
  }
}

export function requestConnectionRedraw() {
  if (state._connRAF) return;
  state._connRAF = requestAnimationFrame(() => {
    renderAllConnections();
    state._connRAF = null;
  });
}

// ============================================================
// Connection Port Visuals (hover anchors)
// ============================================================

export function showConnectionPorts(card) {
  if (!state.connectionPortGfx) return;
  const anchors = getAnchorPoints(card);
  const gfx = state.connectionPortGfx;
  gfx.clear();

  for (const pos of Object.values(anchors)) {
    // Outer ring
    gfx.circle(pos.x, pos.y, CONNECTION_PORT_RADIUS + 1);
    gfx.stroke({ color: 0xffffff, width: 2 });
    // Inner fill
    gfx.circle(pos.x, pos.y, CONNECTION_PORT_RADIUS);
    gfx.fill({ color: THEME.selectBorder });
  }
}

export function hideConnectionPorts() {
  if (state.connectionPortGfx) state.connectionPortGfx.clear();
}

// ============================================================
// Drag Preview
// ============================================================

export function updateDragConnectionPreview(dragState, worldPos) {
  if (!dragState.preview) return;
  dragState.preview.clear();

  const sPos = getAnchorPosition(dragState.sourceCard, dragState.sourceAnchor);
  const targetCard = findCardAtWorld(worldPos.x, worldPos.y);

  let tPos, tAnchor;
  if (targetCard && targetCard !== dragState.sourceCard) {
    const smart = getSmartAnchors(dragState.sourceCard, targetCard);
    tAnchor = smart.targetAnchor;
    tPos = getAnchorPosition(targetCard, tAnchor);
    showConnectionPorts(targetCard);
    dragState._hoverTarget = targetCard;
    dragState._hoverAnchor = tAnchor;
  } else {
    tPos = worldPos;
    tAnchor = getOppositeAnchor(dragState.sourceAnchor);
    hideConnectionPorts();
    dragState._hoverTarget = null;
  }

  drawConnectionCurve(dragState.preview, sPos, tPos,
    dragState.sourceAnchor, tAnchor, {
      color: THEME.selectBorder,
      strokeWidth: 2,
      lineStyle: 'dashed',
      arrowType: 'end',
    });
}

function getOppositeAnchor(anchor) {
  const map = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  return map[anchor] || 'left';
}

// ============================================================
// CRUD
// ============================================================

export function createConnection(sourceCard, targetCard, opts = {}) {
  const anchors = opts.sourceAnchor
    ? { sourceAnchor: opts.sourceAnchor, targetAnchor: opts.targetAnchor || getSmartAnchors(sourceCard, targetCard).targetAnchor }
    : getSmartAnchors(sourceCard, targetCard);

  const conn = {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    data: {
      source: getCardKey(sourceCard),
      target: getCardKey(targetCard),
      sourceAnchor: anchors.sourceAnchor,
      targetAnchor: anchors.targetAnchor,
      lineType: opts.lineType || 'bezier',
      arrowType: opts.arrowType || 'end',
      color: opts.color ?? THEME.selectBorder,
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

/** Get all connections involving a specific card */
export function getConnectionsForCard(card) {
  const key = getCardKey(card);
  return state.allConnections.filter(
    c => c.data.source === key || c.data.target === key
  );
}

/** Get the "other" card in a connection relative to the given card */
export function getConnectedCard(conn, card) {
  const key = getCardKey(card);
  if (conn.data.source === key) return conn.targetCard;
  if (conn.data.target === key) return conn.sourceCard;
  return null;
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
      if (isPointNearLine({ x: worldX, y: worldY }, sPos, tPos, CONNECTION_HIT_THRESHOLD)) {
        return conn;
      }
    } else {
      const { cp1, cp2 } = computeControlPoints(sPos, tPos,
        conn.data.sourceAnchor, conn.data.targetAnchor);
      if (isPointNearBezier({ x: worldX, y: worldY }, sPos, cp1, cp2, tPos, CONNECTION_HIT_THRESHOLD)) {
        return conn;
      }
    }
  }
  return null;
}

function isPointNearBezier(point, p0, cp1, cp2, p1, threshold) {
  const steps = 32;
  const t2 = threshold * threshold;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = cubicBezierPoint(p0, cp1, cp2, p1, t);
    const dx = point.x - pt.x;
    const dy = point.y - pt.y;
    if (dx * dx + dy * dy <= t2) return true;
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
  const cx = p0.x + t * dx;
  const cy = p0.y + t * dy;
  const distX = point.x - cx;
  const distY = point.y - cy;
  return distX * distX + distY * distY <= threshold * threshold;
}

// ============================================================
// Find Card at World Position
// ============================================================

export function findCardAtWorld(wx, wy) {
  // Iterate in reverse (top-most first) to match visual stacking
  for (let i = state.allCards.length - 1; i >= 0; i--) {
    const card = state.allCards[i];
    const cx = card.container.x;
    const cy = card.container.y;
    if (wx >= cx && wx <= cx + card.cardWidth &&
        wy >= cy && wy <= cy + card.cardHeight) {
      return card;
    }
  }
  return null;
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

    state.allConnections.push({
      id: saved.id,
      data: {
        source: saved.source,
        target: saved.target,
        sourceAnchor: saved.sourceAnchor || 'right',
        targetAnchor: saved.targetAnchor || 'left',
        lineType: saved.lineType || 'bezier',
        arrowType: saved.arrowType || 'end',
        color: saved.color ?? THEME.selectBorder,
        strokeWidth: saved.strokeWidth || 2,
        label: saved.label || '',
        lineStyle: saved.lineStyle || 'solid',
      },
      sourceCard,
      targetCard,
    });
  }

  renderAllConnections();
}
