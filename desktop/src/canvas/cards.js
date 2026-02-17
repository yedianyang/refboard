// Deco 2.0 — Card CRUD, Text/Shape, Resize, Texture

import { Container, Sprite, Graphics, Assets, Rectangle, Text, TextStyle } from 'pixi.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  state, THEME,
  CARD_MAX_WIDTH, CARD_PADDING, CARD_RADIUS,
  TEXT_DEFAULT_WIDTH, TEXT_DEFAULT_HEIGHT, TEXT_MIN_WIDTH, TEXT_PADDING,
  SHAPE_STROKE_WIDTH, SHAPE_DEFAULT_COLOR, SHAPE_MIN_SIZE,
  SHAPE_DEFAULT_FILL, SHAPE_DEFAULT_LINE_STYLE,
} from './state.js';
import { requestCull } from './renderer.js';
import { startCardDrag } from './selection.js';
import { markDirty } from './toolbar.js';

// ============================================================
// Image Cards
// ============================================================

export function createPlaceholderCard(imageInfo, x, y) {
  const card = { container: new Container(), data: imageInfo };
  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  const estW = CARD_MAX_WIDTH + CARD_PADDING * 2;
  const estH = Math.round(CARD_MAX_WIDTH * 0.75) + CARD_PADDING * 2;
  card.cardWidth = estW;
  card.cardHeight = estH;

  const bg = new Graphics()
    .roundRect(0, 0, estW, estH, CARD_RADIUS)
    .fill({ color: THEME.cardBg })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.bg = bg;

  const hoverBorder = new Graphics()
    .roundRect(-2, -2, estW + 4, estH + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  card.container.addChild(bg, hoverBorder);
  card.container.hitArea = new Rectangle(-2, -2, estW + 4, estH + 4);

  card.container.on('pointerover', () => {
    if (!state.selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  card.container.on('pointerdown', (e) => {
    startCardDrag(card, e);

    const parent = card.container.parent;
    parent.removeChild(card.container);
    parent.addChild(card.container);

    e.stopPropagation();
  });

  card.sprite = null;
  card.texture = null;
  card._textureUrl = convertFileSrc(imageInfo.path);
  card._textureUnloaded = false;

  state.world.addChild(card.container);
  state.allCards.push(card);
  return card;
}

export async function loadTextureIntoCard(card) {
  try {
    const texture = await Assets.load(card._textureUrl);
    if (!card.container.parent) return;

    const aspect = texture.width / texture.height;
    const cardW = Math.min(CARD_MAX_WIDTH, texture.width);
    const cardH = cardW / aspect;

    const sprite = new Sprite(texture);
    sprite.width = cardW;
    sprite.height = cardH;
    sprite.position.set(CARD_PADDING, CARD_PADDING);
    card.sprite = sprite;
    card.texture = texture;
    card._textureUnloaded = false;

    card._originalSpriteWidth = cardW;
    card._originalSpriteHeight = cardH;

    card.container.addChildAt(sprite, 1);

    const frameMask = new Graphics()
      .rect(CARD_PADDING, CARD_PADDING, cardW, cardH)
      .fill(0xffffff);
    card.container.addChildAt(frameMask, 2);
    card._frameMask = frameMask;
    sprite.mask = frameMask;

    resizeCardTo(card, cardW + CARD_PADDING * 2, cardH + CARD_PADDING * 2);

    // Clear opaque bg fill now that sprite is loaded — keeps border only
    if (card.bg) {
      const w = card.cardWidth, h = card.cardHeight;
      card.bg.clear()
        .roundRect(0, 0, w, h, CARD_RADIUS)
        .stroke({ color: THEME.cardBorder, width: 1 });
    }
  } catch (err) {
    console.warn(`Failed to load image: ${card.data.name}`, err);
  }
}

export async function addImageCard(imageInfo, x, y) {
  const card = createPlaceholderCard(imageInfo, x, y);
  await loadTextureIntoCard(card);
  return card;
}

export function removeCardFromCanvas(card) {
  if (card.container.parent) {
    card.container.parent.removeChild(card.container);
  }
  const idx = state.allCards.indexOf(card);
  if (idx >= 0) state.allCards.splice(idx, 1);
  state.selection.delete(card);
}

// ============================================================
// Resize
// ============================================================

export function resizeCardTo(card, w, h) {
  card.cardWidth = w;
  card.cardHeight = h;

  if (card.sprite) {
    card.sprite.width = w - CARD_PADDING * 2;
    card.sprite.height = h - CARD_PADDING * 2;
  }
  if (card._frameMask) {
    card._frameMask.clear()
      .rect(CARD_PADDING, CARD_PADDING, w - CARD_PADDING * 2, h - CARD_PADDING * 2)
      .fill(0xffffff);
  }

  if (card.bg) {
    if (card.isText) {
      card.bg.clear(); // Text cards have no visible background
    } else if (card.sprite) {
      // Image loaded — border only, no opaque fill that would cover the sprite
      card.bg.clear()
        .roundRect(0, 0, w, h, CARD_RADIUS)
        .stroke({ color: THEME.cardBorder, width: 1 });
    } else {
      // Placeholder state — show filled bg
      card.bg.clear()
        .roundRect(0, 0, w, h, CARD_RADIUS)
        .fill({ color: THEME.cardBg })
        .stroke({ color: THEME.cardBorder, width: 1 });
    }
  }

  if (card.hoverBorder) {
    card.hoverBorder.clear()
      .roundRect(-2, -2, w + 4, h + 4, CARD_RADIUS + 2)
      .stroke({ color: THEME.cardHover, width: 2 });
  }

  if (card.selectionBorder) {
    card.selectionBorder.clear()
      .roundRect(-4, -4, w + 8, h + 8, 10)
      .stroke({ color: THEME.selectBorder, width: 2.5 });
  }

  card.container.hitArea = new Rectangle(-2, -2, w + 4, h + 4);

  if (state.resizeTarget === card) {
    drawResizeHandleGraphics(card);
  }
}

export function drawResizeHandleGraphics(card) {
  if (!state.resizeHandleGfx) return;
  state.resizeHandleGfx.clear();
  const corners = getCornerPositions(card);
  for (const pos of Object.values(corners)) {
    state.resizeHandleGfx
      .rect(pos.x - 8 / 2, pos.y - 8 / 2, 8, 8)
      .fill({ color: 0xffffff })
      .stroke({ color: THEME.resizeHandle, width: 1.5 });
  }
}

export function getCornerPositions(card) {
  return {
    nw: { x: 0, y: 0 },
    ne: { x: card.cardWidth, y: 0 },
    sw: { x: 0, y: card.cardHeight },
    se: { x: card.cardWidth, y: card.cardHeight },
  };
}

// ============================================================
// Text Annotations
// ============================================================

export function createTextCard(content, x, y, opts = {}) {
  const fontSize = opts.fontSize || 14;
  const color = opts.color != null ? opts.color : null;
  const id = opts.id || `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const card = {
    container: new Container(),
    data: { type: 'text', id, text: content, fontSize, color },
    cardWidth: 0,
    cardHeight: 0,
    isText: true,
  };

  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  // Transparent background — text cards have no visible bg/border
  const bg = new Graphics();
  card.bg = bg;

  const hoverBorder = new Graphics();
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  const textFill = color != null ? '#' + color.toString(16).padStart(6, '0') : THEME.text;
  // Use explicit width if restoring saved state; otherwise use a wide wrap and auto-size later
  const wrapWidth = opts.width ? opts.width - TEXT_PADDING * 2 : 800;
  const textStyle = new TextStyle({
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize,
    fill: textFill,
    wordWrap: true,
    wordWrapWidth: wrapWidth,
    lineHeight: Math.round(fontSize * 1.5),
  });
  const textObj = new Text({ text: content || 'Type here...', style: textStyle });
  textObj.position.set(TEXT_PADDING, TEXT_PADDING);
  textObj.alpha = content ? 1.0 : 0.35;
  card.textObj = textObj;

  card.container.addChild(bg, hoverBorder, textObj);

  // Size card to fit text content (no fixed default box)
  const w = opts.width || Math.max(TEXT_MIN_WIDTH, Math.ceil(textObj.width) + TEXT_PADDING * 2);
  const h = opts.height || Math.max(fontSize + TEXT_PADDING * 2, Math.ceil(textObj.height) + TEXT_PADDING * 2);
  card.cardWidth = w;
  card.cardHeight = h;

  // Update wordWrapWidth to match final width
  textObj.style.wordWrapWidth = w - TEXT_PADDING * 2;

  hoverBorder.roundRect(-2, -2, w + 4, h + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  card.container.hitArea = new Rectangle(-2, -2, w + 4, h + 4);

  card.container.on('pointerover', () => {
    if (!state.selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  card.container.on('pointerdown', (e) => {
    startCardDrag(card, e);
  });

  state.world.addChild(card.container);
  state.allCards.push(card);
  requestCull();
  markDirty();
  return card;
}

export function autoSizeTextCard(card) {
  if (!card.isText || !card.textObj) return;
  const measuredW = Math.max(TEXT_MIN_WIDTH, Math.ceil(card.textObj.width) + TEXT_PADDING * 2);
  const measuredH = Math.max(card.data.fontSize + TEXT_PADDING * 2, Math.ceil(card.textObj.height) + TEXT_PADDING * 2);
  if (Math.abs(measuredW - card.cardWidth) < 2 && Math.abs(measuredH - card.cardHeight) < 2) return;
  card.cardWidth = measuredW;
  card.cardHeight = measuredH;

  // No bg fill/stroke for text cards — keep bg clear
  card.bg.clear();
  card.hoverBorder.clear()
    .roundRect(-2, -2, measuredW + 4, measuredH + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  card.container.hitArea = new Rectangle(-2, -2, measuredW + 4, measuredH + 4);

  // Update selection border if present
  if (card.selectionBorder) {
    card.selectionBorder.clear()
      .roundRect(-4, -4, measuredW + 8, measuredH + 8, 10)
      .stroke({ color: THEME.selectBorder, width: 2.5 });
  }
}

export function addTextCard(content, x, y, opts) {
  return createTextCard(content, x, y, opts);
}

export function startTextEdit(card) {
  if (!card.isText) return;
  if (state.textEditOverlay) finishTextEdit();

  const canvasEl = state.app.canvas;
  const canvasRect = canvasEl.getBoundingClientRect();

  const screenX = card.container.x * state.viewport.scale + state.viewport.x + canvasRect.left;
  const screenY = card.container.y * state.viewport.scale + state.viewport.y + canvasRect.top;
  const screenW = card.cardWidth * state.viewport.scale;
  const screenH = Math.max(card.cardHeight * state.viewport.scale, 40);

  const textarea = document.createElement('textarea');
  textarea.value = card.data.text || '';
  const editMinW = Math.max(screenW - TEXT_PADDING * 2 * state.viewport.scale, 150);
  textarea.style.cssText = `
    position: fixed;
    left: ${screenX + TEXT_PADDING * state.viewport.scale}px;
    top: ${screenY + TEXT_PADDING * state.viewport.scale}px;
    width: ${editMinW}px;
    min-height: ${screenH - TEXT_PADDING * 2 * state.viewport.scale}px;
    background: transparent;
    border: none;
    outline: none;
    color: ${card.data.color != null ? '#' + card.data.color.toString(16).padStart(6, '0') : 'var(--text)'};
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: ${card.data.fontSize * state.viewport.scale}px;
    line-height: ${Math.round(card.data.fontSize * 1.5) * state.viewport.scale}px;
    resize: none;
    z-index: 1000;
    padding: 0;
    margin: 0;
    overflow: hidden;
  `;

  card.textObj.visible = false;

  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      finishTextEdit();
    }
  });

  textarea.addEventListener('blur', () => {
    finishTextEdit();
  });

  document.body.appendChild(textarea);
  textarea.focus();
  state.textEditOverlay = { textarea, card };
}

export function finishTextEdit() {
  if (!state.textEditOverlay) return;
  const { textarea, card } = state.textEditOverlay;
  const newText = textarea.value;

  card.data.text = newText;
  card.textObj.text = newText || 'Type here...';
  card.textObj.alpha = newText ? 1.0 : 0.35;
  card.textObj.visible = true;
  autoSizeTextCard(card);

  textarea.remove();
  state.textEditOverlay = null;
  markDirty();
}

// ============================================================
// Shape Annotations (Rectangle, Ellipse, Line)
// ============================================================

// --- Dashed line helpers (PixiJS 8 has no native dash) ---

function dashedLine(gfx, x1, y1, x2, y2, dash, gap) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const ux = dx / len, uy = dy / len;
  let d = 0;
  let drawing = true;
  while (d < len) {
    const seg = drawing ? dash : gap;
    const end = Math.min(d + seg, len);
    if (drawing) {
      gfx.moveTo(x1 + ux * d, y1 + uy * d);
      gfx.lineTo(x1 + ux * end, y1 + uy * end);
    }
    d = end;
    drawing = !drawing;
  }
}

function dashedRect(gfx, x, y, w, h, dash, gap) {
  dashedLine(gfx, x, y, x + w, y, dash, gap);
  dashedLine(gfx, x + w, y, x + w, y + h, dash, gap);
  dashedLine(gfx, x + w, y + h, x, y + h, dash, gap);
  dashedLine(gfx, x, y + h, x, y, dash, gap);
}

function dashedEllipse(gfx, cx, cy, rx, ry, dash, gap) {
  const n = Math.max(48, Math.round(Math.max(rx, ry) * 0.8));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  let carry = 0;
  let drawing = true;
  for (let i = 0; i < pts.length - 1; i++) {
    const sx = pts[i].x, sy = pts[i].y;
    const ex = pts[i + 1].x, ey = pts[i + 1].y;
    const segLen = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
    let d = 0;
    while (d < segLen) {
      const need = drawing ? dash - carry : gap - carry;
      const avail = segLen - d;
      const step = Math.min(need, avail);
      const frac1 = d / segLen, frac2 = (d + step) / segLen;
      if (drawing) {
        gfx.moveTo(sx + (ex - sx) * frac1, sy + (ey - sy) * frac1);
        gfx.lineTo(sx + (ex - sx) * frac2, sy + (ey - sy) * frac2);
      }
      carry += step;
      d += step;
      if (carry >= (drawing ? dash : gap)) {
        carry = 0;
        drawing = !drawing;
      }
    }
  }
}

export function createShapeCard(shapeType, x, y, opts = {}) {
  const w = opts.width || 120;
  const h = opts.height || 80;
  const color = opts.color ?? SHAPE_DEFAULT_COLOR;
  const strokeWidth = opts.strokeWidth || SHAPE_STROKE_WIDTH;
  const hasFill = opts.hasFill ?? SHAPE_DEFAULT_FILL;
  const lineStyle = opts.lineStyle ?? SHAPE_DEFAULT_LINE_STYLE;
  const id = opts.id || `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const card = {
    container: new Container(),
    data: { type: 'shape', id, shapeType, color, strokeWidth, hasFill, lineStyle },
    cardWidth: w,
    cardHeight: h,
    isShape: true,
  };

  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  const shapeGfx = new Graphics();
  drawShapeGraphics(shapeGfx, shapeType, w, h, color, strokeWidth, { hasFill, lineStyle });
  card.shapeGfx = shapeGfx;

  const hoverBorder = new Graphics()
    .roundRect(-4, -4, w + 8, h + 8, 2)
    .stroke({ color: THEME.cardHover, width: 1.5 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  card.container.addChild(shapeGfx, hoverBorder);
  card.container.hitArea = new Rectangle(-4, -4, w + 8, h + 8);

  card.container.on('pointerover', () => {
    if (!state.selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  card.container.on('pointerdown', (e) => {
    startCardDrag(card, e);
  });

  state.world.addChild(card.container);
  state.allCards.push(card);
  requestCull();
  markDirty();
  return card;
}

export function drawShapeGraphics(gfx, shapeType, w, h, color, sw, opts = {}) {
  const strokeW = sw || SHAPE_STROKE_WIDTH;
  const hasFill = opts.hasFill ?? false;
  const lineStyle = opts.lineStyle ?? 'solid';
  const dashed = lineStyle === 'dashed';
  const dash = 8, gap = 5;

  gfx.clear();

  if (shapeType === 'rect') {
    if (hasFill) {
      gfx.roundRect(0, 0, w, h, 3).fill({ color, alpha: 0.15 });
    }
    if (dashed) {
      dashedRect(gfx, 0, 0, w, h, dash, gap);
      gfx.stroke({ color, width: strokeW });
    } else {
      gfx.roundRect(0, 0, w, h, 3).stroke({ color, width: strokeW });
    }
  } else if (shapeType === 'ellipse') {
    if (hasFill) {
      gfx.ellipse(w / 2, h / 2, w / 2, h / 2).fill({ color, alpha: 0.15 });
    }
    if (dashed) {
      dashedEllipse(gfx, w / 2, h / 2, w / 2, h / 2, dash, gap);
      gfx.stroke({ color, width: strokeW });
    } else {
      gfx.ellipse(w / 2, h / 2, w / 2, h / 2).stroke({ color, width: strokeW });
    }
  } else if (shapeType === 'line') {
    if (dashed) {
      dashedLine(gfx, 0, 0, w, h, dash, gap);
      gfx.stroke({ color, width: strokeW });
    } else {
      gfx.moveTo(0, 0).lineTo(w, h).stroke({ color, width: strokeW });
    }
    // Arrowhead (always solid)
    const angle = Math.atan2(h, w);
    const arrLen = Math.max(10, strokeW * 5);
    gfx.moveTo(w, h)
      .lineTo(w - arrLen * Math.cos(angle - 0.4), h - arrLen * Math.sin(angle - 0.4))
      .stroke({ color, width: strokeW });
    gfx.moveTo(w, h)
      .lineTo(w - arrLen * Math.cos(angle + 0.4), h - arrLen * Math.sin(angle + 0.4))
      .stroke({ color, width: strokeW });
  }
}

export function resizeShapeCard(card, w, h) {
  card.cardWidth = w;
  card.cardHeight = h;
  drawShapeGraphics(card.shapeGfx, card.data.shapeType, w, h, card.data.color, card.data.strokeWidth, {
    hasFill: card.data.hasFill,
    lineStyle: card.data.lineStyle,
  });
  card.hoverBorder.clear()
    .roundRect(-4, -4, w + 8, h + 8, 2)
    .stroke({ color: THEME.cardHover, width: 1.5 });
  card.container.hitArea = new Rectangle(-4, -4, w + 8, h + 8);
}
