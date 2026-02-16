// Deco 2.0 — Group Management

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { state, THEME } from './state.js';
import { clearSelection, setCardSelected } from './selection.js';

// ============================================================
// Groups
// ============================================================

export function updateGroupBounds(group) {
  if (!group || group.cards.size === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of group.cards) {
    minX = Math.min(minX, card.container.x);
    minY = Math.min(minY, card.container.y);
    maxX = Math.max(maxX, card.container.x + card.cardWidth);
    maxY = Math.max(maxY, card.container.y + card.cardHeight);
  }
  const pad = 16;
  group.container.position.set(0, 0);
  group.border.clear()
    .roundRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, 12)
    .fill({ color: THEME.groupBg, alpha: 0.04 })
    .stroke({ color: THEME.groupBorder, width: 1.5, alpha: 0.3 });
  if (group.label) {
    group.label.position.set(minX - pad + 8, minY - pad - 18);
  }
}

export function selectGroup(group) {
  clearSelection();
  for (const card of group.cards) {
    setCardSelected(card, true);
  }
}

export function enterGroupEditMode(group) {
  state.editingGroup = group;
}

export function exitGroupEditMode() {
  if (!state.editingGroup) return;
  const group = state.editingGroup;
  state.editingGroup = null;
  selectGroup(group);
}

export function groupSelected() {
  if (state.selection.size < 2) return;
  const cards = new Set(state.selection);

  const groupContainer = new Container();
  groupContainer.zIndex = -1;

  const border = new Graphics();

  const label = new Text({
    text: `Group ${state.allGroups.length + 1}`,
    style: new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 12,
      fill: THEME.groupBorder,
      fontWeight: '600',
    }),
  });

  groupContainer.addChild(border, label);
  state.world.addChild(groupContainer);

  const group = { name: `Group ${state.allGroups.length + 1}`, cards, container: groupContainer, label, border };
  state.allGroups.push(group);

  for (const card of cards) {
    card.group = group;
  }

  updateGroupBounds(group);
}

export function ungroupSelected() {
  const groups = new Set();
  for (const card of state.selection) {
    if (card.group) groups.add(card.group);
  }

  for (const group of groups) {
    if (group.container.parent) {
      group.container.parent.removeChild(group.container);
    }
    group.container.destroy({ children: true });

    for (const card of group.cards) {
      card.group = null;
    }

    const idx = state.allGroups.indexOf(group);
    if (idx >= 0) state.allGroups.splice(idx, 1);
  }
}
