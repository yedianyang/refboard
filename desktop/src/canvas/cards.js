// RefBoard 2.0 — Card CRUD, Text/Shape, Resize, Texture

import { Container, Sprite, Graphics, Assets, Rectangle, Text, TextStyle } from 'pixi.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  state, THEME,
  CARD_MAX_WIDTH, CARD_PADDING, CARD_RADIUS,
  TEXT_DEFAULT_WIDTH, TEXT_DEFAULT_HEIGHT, TEXT_MIN_WIDTH, TEXT_PADDING,
  SHAPE_STROKE_WIDTH, SHAPE_DEFAULT_COLOR, SHAPE_MIN_SIZE,
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

  if (card._frameMask) {
    card._frameMask.clear()
      .rect(CARD_PADDING, CARD_PADDING, w - CARD_PADDING * 2, h - CARD_PADDING * 2)
      .fill(0xffffff);
  } else if (card.sprite) {
    card.sprite.width = w - CARD_PADDING * 2;
    card.sprite.height = h - CARD_PADDING * 2;
  }

  if (card.bg) {
    card.bg.clear()
      .roundRect(0, 0, w, h, CARD_RADIUS)
      .fill({ color: THEME.cardBg })
      .stroke({ color: THEME.cardBorder, width: 1 });
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
  const w = opts.width || TEXT_DEFAULT_WIDTH;
  const h = opts.height || TEXT_DEFAULT_HEIGHT;
  const fontSize = opts.fontSize || 14;
  const color = opts.color != null ? opts.color : null;
  const id = opts.id || `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const card = {
    container: new Container(),
    data: { type: 'text', id, text: content, fontSize, color },
    cardWidth: w,
    cardHeight: h,
    isText: true,
  };

  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  const bg = new Graphics()
    .roundRect(0, 0, w, h, CARD_RADIUS)
    .fill({ color: THEME.cardBg, alpha: 0.7 })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.bg = bg;

  const hoverBorder = new Graphics()
    .roundRect(-2, -2, w + 4, h + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  const textFill = color != null ? '#' + color.toString(16).padStart(6, '0') : THEME.text;
  const textStyle = new TextStyle({
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize,
    fill: textFill,
    wordWrap: true,
    wordWrapWidth: w - TEXT_PADDING * 2,
    lineHeight: Math.round(fontSize * 1.5),
  });
  const textObj = new Text({ text: content || 'Type here...', style: textStyle });
  textObj.position.set(TEXT_PADDING, TEXT_PADDING);
  textObj.alpha = content ? 1.0 : 0.35;
  card.textObj = textObj;

  card.container.addChild(bg, hoverBorder, textObj);
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
  const measuredH = card.textObj.height + TEXT_PADDING * 2;
  const newH = Math.max(TEXT_DEFAULT_HEIGHT, measuredH);
  if (Math.abs(newH - card.cardHeight) < 2) return;
  card.cardHeight = newH;

  card.bg.clear()
    .roundRect(0, 0, card.cardWidth, newH, CARD_RADIUS)
    .fill({ color: THEME.cardBg, alpha: 0.7 })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.hoverBorder.clear()
    .roundRect(-2, -2, card.cardWidth + 4, newH + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  card.container.hitArea = new Rectangle(-2, -2, card.cardWidth + 4, newH + 4);
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
  textarea.style.cssText = `
    position: fixed;
    left: ${screenX + TEXT_PADDING * state.viewport.scale}px;
    top: ${screenY + TEXT_PADDING * state.viewport.scale}px;
    width: ${screenW - TEXT_PADDING * 2 * state.viewport.scale}px;
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

export function createShapeCard(shapeType, x, y, opts = {}) {
  const w = opts.width || 120;
  const h = opts.height || 80;
  const color = opts.color ?? SHAPE_DEFAULT_COLOR;
  const strokeWidth = opts.strokeWidth || SHAPE_STROKE_WIDTH;
  const id = opts.id || `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const card = {
    container: new Container(),
    data: { type: 'shape', id, shapeType, color, strokeWidth },
    cardWidth: w,
    cardHeight: h,
    isShape: true,
  };

  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  const shapeGfx = new Graphics();
  drawShapeGraphics(shapeGfx, shapeType, w, h, color, strokeWidth);
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

export function drawShapeGraphics(gfx, shapeType, w, h, color, sw) {
  const strokeW = sw || SHAPE_STROKE_WIDTH;
  gfx.clear();
  if (shapeType === 'rect') {
    gfx.roundRect(0, 0, w, h, 3)
      .stroke({ color, width: strokeW });
  } else if (shapeType === 'ellipse') {
    gfx.ellipse(w / 2, h / 2, w / 2, h / 2)
      .stroke({ color, width: strokeW });
  } else if (shapeType === 'line') {
    gfx.moveTo(0, 0).lineTo(w, h)
      .stroke({ color, width: strokeW });
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
  drawShapeGraphics(card.shapeGfx, card.data.shapeType, w, h, card.data.color, card.data.strokeWidth);
  card.hoverBorder.clear()
    .roundRect(-4, -4, w + 8, h + 8, 2)
    .stroke({ color: THEME.cardHover, width: 1.5 });
  card.container.hitArea = new Rectangle(-4, -4, w + 8, h + 8);
}
