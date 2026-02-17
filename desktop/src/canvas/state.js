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

  // Connection state
  allConnections: [],
  connectionGfx: null,
  connectionPortGfx: null,
  dragConnection: null,
  selectedConnection: null,
  _connRAF: null,

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

// Theme colors — neutral grays (Figma/Sketch inspired, no blue tint)
export const THEME = {
  bg: 0x222222,
  cardBg: 0x2d2d2d,
  cardBorder: 0x3c3c3c,
  cardHover: 0x505050,
  selectBorder: 0x409cff,
  selectRect: 0x409cff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0x2e2e2e,
  gridLineMajor: 0x383838,
  resizeHandle: 0x409cff,
  minimap: {
    bg: 0x1a1a1a,
    viewport: 0x409cff,
    card: 0x409cff,
    border: 0x333333,
  },
  text: '#e8e8e8',
  textDim: '#888888',
};

export const DARK_THEME = {
  bg: 0x222222,
  cardBg: 0x2d2d2d,
  cardBorder: 0x3c3c3c,
  cardHover: 0x505050,
  selectBorder: 0x409cff,
  selectRect: 0x409cff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0x2e2e2e,
  gridLineMajor: 0x383838,
  resizeHandle: 0x409cff,
  minimap: { bg: 0x1a1a1a, viewport: 0x409cff, card: 0x409cff, border: 0x333333 },
  text: '#e8e8e8',
  textDim: '#888888',
};

export const LIGHT_THEME = {
  bg: 0xf0f0f0,
  cardBg: 0xffffff,
  cardBorder: 0xe0e0e0,
  cardHover: 0xc0c0c0,
  selectBorder: 0x007aff,
  selectRect: 0x007aff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0xe0e0e0,
  gridLineMajor: 0xcccccc,
  resizeHandle: 0x007aff,
  minimap: { bg: 0xffffff, viewport: 0x007aff, card: 0x007aff, border: 0xe0e0e0 },
  text: '#1d1d1f',
  textDim: '#666666',
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

// Connection constants
export const CONNECTION_PORT_RADIUS = 5;
export const CONNECTION_HIT_THRESHOLD = 12;
export const CONNECTION_ARROW_SIZE = 10;
export const CONNECTION_DEFAULT_CURVATURE = 0.4;
export const CONNECTION_TOOLS = new Set(['connector']);

// Auto-save
export const AUTO_SAVE_INTERVAL = 30000;
