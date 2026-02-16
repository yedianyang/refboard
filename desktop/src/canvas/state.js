// Deco 2.0 — Canvas Shared State & Constants

export const state = {
  app: null,
  world: null,
  gridGfx: null,
  minimapGfx: null,
  selectRectGfx: null,
  guideGfx: null,

  allCards: [],
  allGroups: [],

  viewport: {
    x: 0, y: 0, scale: 1,
    minScale: 0.05, maxScale: 8.0,
    isPanning: false,
    lastPointer: { x: 0, y: 0 },
  },

  selection: new Set(),
  dragState: null,
  spaceDown: false,
  currentTool: 'select',
  gridVisible: true,
  minimapVisible: false,
  activeAnnotationColor: parseInt(localStorage.getItem('deco-annotation-color') || '0x4a9eff', 16) || 0x4a9eff,
  activeShapeFill: localStorage.getItem('deco-shape-fill') === 'true',
  activeShapeLineStyle: localStorage.getItem('deco-shape-linestyle') || 'solid',
  activeShapeStrokeWidth: parseFloat(localStorage.getItem('deco-shape-strokewidth') || '2') || 2,

  editingGroup: null,
  clipboard: [],

  undoStack: [],
  redoStack: [],

  resizeHandleGfx: null,
  resizeTarget: null,
  textEditOverlay: null,

  lightboxOpen: false,
  lightboxIndex: -1,

  activeFilter: null,

  minimapCardCache: null,
  cullRAF: null,
  minimapRAF: null,

  boardDirty: false,
  autoSaveTimer: null,

  lastClickCard: null,
  lastClickTime: 0,

  onCardSelectCallback: null,

  loadingEl: null,
  zoomEl: null,
};

// Theme colors
export const THEME = {
  bg: 0x1a1a2e,
  cardBg: 0x2a2a3e,
  cardBorder: 0x3a3a5e,
  cardHover: 0x4a4a6a,
  selectBorder: 0x4a9eff,
  selectRect: 0x4a9eff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0x262640,
  gridLineMajor: 0x303050,
  resizeHandle: 0x4a9eff,
  minimap: {
    bg: 0x16213e,
    viewport: 0x4a9eff,
    card: 0x4a9eff,
    border: 0x2a2a4a,
  },
  text: '#e0e0e0',
  textDim: '#888899',
};

export const DARK_THEME = {
  bg: 0x1a1a2e,
  cardBg: 0x2a2a3e,
  cardBorder: 0x3a3a5e,
  cardHover: 0x4a4a6a,
  selectBorder: 0x4a9eff,
  selectRect: 0x4a9eff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0x262640,
  gridLineMajor: 0x303050,
  resizeHandle: 0x4a9eff,
  minimap: { bg: 0x16213e, viewport: 0x4a9eff, card: 0x4a9eff, border: 0x2a2a4a },
  text: '#e0e0e0',
  textDim: '#888899',
};

export const LIGHT_THEME = {
  bg: 0xe8e8ef,
  cardBg: 0xffffff,
  cardBorder: 0xd0d0d8,
  cardHover: 0xb0b0c0,
  selectBorder: 0x0066dd,
  selectRect: 0x0066dd,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0xd0d0d8,
  gridLineMajor: 0xb8b8c8,
  resizeHandle: 0x0066dd,
  minimap: { bg: 0xffffff, viewport: 0x0066dd, card: 0x0066dd, border: 0xd0d0d8 },
  text: '#1a1a2e',
  textDim: '#666680',
};

// Card constants
export const CARD_MAX_WIDTH = 220;
export const CARD_PADDING = 6;
export const CARD_RADIUS = 8;

// Text constants
export const TEXT_DEFAULT_WIDTH = 200;
export const TEXT_DEFAULT_HEIGHT = 60;
export const TEXT_MIN_WIDTH = 60;
export const TEXT_PADDING = 10;

// Shape constants
export const SHAPE_STROKE_WIDTH = 2;
export const SHAPE_DEFAULT_COLOR = 0x4a9eff;
export const SHAPE_MIN_SIZE = 10;
export const SHAPE_DEFAULT_FILL = false;
export const SHAPE_DEFAULT_LINE_STYLE = 'solid';

// Resize constants
export const HANDLE_SIZE = 8;

// Texture management
export const TEXTURE_UNLOAD_PAD = 1200;

// Snap / guides
export const SNAP_THRESHOLD = 5;
export const GUIDE_COLOR = 0xe91e63;

// Minimap
export const MINIMAP = { width: 180, height: 120, margin: 12 };

// Undo
export const MAX_UNDO = 100;

// Shape tool sets
export const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'line']);
export const ANNOTATION_TOOLS = new Set(['rect', 'ellipse', 'line', 'text']);

// Auto-save
export const AUTO_SAVE_INTERVAL = 30000;
