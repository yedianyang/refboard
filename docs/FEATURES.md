# RefBoard 功能清单

## 设计原则
> **信息收集和插入功能优先为 AI 考虑**
> 
> 这是一个 AI-first 的视觉参考工具，所有交互都应该便于 AI agent 操作。

---

## 核心功能

### 1. 图片自动分析 ⭐ 优先
**描述：** 贴入一张照片时，自动分析图片内容，提取关键词

**实现思路：**
- 使用 vision model API 分析图片
- 提取：主题、风格、颜色、物体、情绪等
- 自动生成 tags 并写入 metadata.json
- AI agent 可通过 CLI 调用：`refboard add <image> --analyze`

**输出格式：**
```json
{
  "file": "image.jpg",
  "autoTags": ["art-deco", "bronze", "sculpture", "1920s", "geometric"],
  "autoDescription": "A bronze Art Deco sculpture featuring geometric forms...",
  "dominantColors": ["#8B7355", "#2C2C2C", "#D4AF37"]
}
```

---

### 2. 拖拽位置持久化 ⭐ 优先
**描述：** 图片卡片有客观存储位置，可通过拖拽调整并自动保存

**实现思路：**
- 每个 item 在 metadata.json 中存储 `position: { x, y }`
- 拖拽结束时自动保存到 metadata.json
- AI agent 可通过 CLI 设置位置：`refboard meta <n> --position "100,200"`
- 支持批量布局：`refboard layout --grid` / `refboard layout --cluster`

**数据结构：**
```json
{
  "file": "image.jpg",
  "position": { "x": 150, "y": 300 },
  "size": { "width": 200, "height": 150 }
}
```

---

### 3. 关键词过滤与聚合
**描述：** 通过关键字 filter，让意义相近的图片聚集在一起

**实现思路：**
- 侧边栏显示所有 tags，点击过滤
- 搜索框支持多关键词组合
- "聚合模式"：相同 tag 的图片自动靠近
- AI agent 可调用：`refboard filter --tags "bronze,1920s"` 或 `refboard cluster --by tags`

**UI 交互：**
- 点击 tag → 高亮相关图片，淡化其他
- 双击 tag → 只显示相关图片
- 拖拽 tag 到画布 → 创建标签分组区域

---

### 4. 文本框（参考 Figma）
**描述：** 在画布上插入文本框，用于标注和注释

**实现思路：**
- 类型：`text`
- 支持：标题、正文、列表
- 可调整大小、字体、颜色
- AI agent 可调用：`refboard add-text "注释内容" --position "100,200" --style title`

**数据结构：**
```json
{
  "type": "text",
  "id": "text-001",
  "content": "# Art Deco 特征\n- 几何形状\n- 金属质感",
  "position": { "x": 500, "y": 100 },
  "size": { "width": 300, "height": 200 },
  "style": {
    "fontSize": 14,
    "fontFamily": "Inter",
    "color": "#f0f0f0",
    "background": "#1a1a1a"
  }
}
```

---

### 5. 图形框（参考 Figma）
**描述：** 在画布上插入图形框，用于分组和标注

**实现思路：**
- 类型：矩形、圆形、箭头、连接线
- 可调整颜色、边框、透明度
- 用于：圈选分组、指向关联、区域划分
- AI agent 可调用：`refboard add-shape rect --position "100,200" --size "400,300" --label "青铜雕塑"`

**数据结构：**
```json
{
  "type": "shape",
  "id": "shape-001",
  "shape": "rect",
  "position": { "x": 100, "y": 200 },
  "size": { "width": 400, "height": 300 },
  "style": {
    "fill": "transparent",
    "stroke": "#f5c518",
    "strokeWidth": 2,
    "cornerRadius": 8
  },
  "label": "青铜雕塑组"
}
```

---

## AI Agent 接口汇总

| 命令 | 功能 |
|------|------|
| `refboard add <image> --analyze` | 添加图片并自动分析 |
| `refboard meta <n> --position "x,y"` | 设置图片位置 |
| `refboard layout --grid` | 网格布局 |
| `refboard layout --cluster --by tags` | 按标签聚合布局 |
| `refboard filter --tags "a,b"` | 过滤显示 |
| `refboard add-text "内容" --position "x,y"` | 添加文本框 |
| `refboard add-shape rect --position "x,y"` | 添加图形框 |
| `refboard export --format json` | 导出结构化数据 |

---

## 优先级排序

1. **P0 - 立即实现**
   - 拖拽位置持久化
   - 关键词过滤

2. **P1 - 短期实现**
   - 图片自动分析（需要 API）
   - 文本框

3. **P2 - 中期实现**
   - 图形框
   - 聚合模式
   - 批量布局命令

---

## 信息面板设计（通用 Moodboard 工具）

### 设计原则
> **标准设计 Moodboard 参考工具** - 不限于特定领域，适用于所有设计工作流

### 通用字段架构

采用 **核心字段 + 扩展字段** 的灵活架构：

```
┌─────────────────────────────────────┐
│  TITLE（必填）                       │
│  作品/图片的标题                      │
├─────────────────────────────────────┤
│  CREATOR · DATE                     │
│  创作者（可选显示）· 时间             │
├─────────────────────────────────────┤
│  DESCRIPTION                        │
│  简短描述 - AI 可自动生成             │
├─────────────────────────────────────┤
│  CONTEXT                            │
│  背景说明 - 根据 board 主题自动调整   │
│  • 历史类 → Historical Context      │
│  • 设计类 → Design Rationale        │
│  • 品牌类 → Brand Story             │
│  • 通用   → Notes                   │
├─────────────────────────────────────┤
│  REFERENCES                         │
│  关联/灵感来源 - 可链接到其他卡片     │
├─────────────────────────────────────┤
│  ATTRIBUTES                         │
│  自定义属性区 - 用户可增删            │
│  • 材质、尺寸、颜色、风格...          │
├─────────────────────────────────────┤
│  TAGS                               │
│  标签 - AI 推荐 + 用户编辑           │
├─────────────────────────────────────┤
│  SOURCE                             │
│  来源链接 / 文件路径                  │
├─────────────────────────────────────┤
│  🔍 SEARCH MORE                     │
│  扩展搜索按钮                        │
└─────────────────────────────────────┘
```

### 预设模板

| 模板 ID | 适用场景 | 特色字段 |
|---------|---------|---------|
| `minimal` | 快速收集 | Title, Tags, Source |
| `design` | 产品/UI设计 | Creator, Description, Attributes, References |
| `art-history` | 艺术史研究 | Artist, Year, Historical Context, Influences |
| `brand` | 品牌/视觉 | Brand, Description, Colors, Typography |
| `photography` | 摄影参考 | Photographer, Location, Camera/Settings |
| `custom` | 完全自定义 | 用户定义所有字段 |

### 字段类型

```javascript
const fieldTypes = {
  text: { display: 'single-line' },
  longtext: { display: 'multi-line', maxLines: 5 },
  tags: { display: 'chips', aiSuggest: true },
  link: { display: 'url', preview: true },
  date: { display: 'date-picker' },
  color: { display: 'color-swatch', extract: true },
  reference: { display: 'card-link', internal: true },
  attributes: { display: 'key-value-list', flexible: true },
};
```

### 配置示例

**refboard.json:**
```json
{
  "infoPanel": {
    "template": "design",
    "fields": [
      { "key": "title", "label": "Title", "type": "text", "required": true },
      { "key": "creator", "label": "Designer / Brand", "type": "text" },
      { "key": "date", "label": "Date", "type": "date" },
      { "key": "description", "label": "Description", "type": "longtext", "aiGenerate": true },
      { "key": "context", "label": "Design Notes", "type": "longtext" },
      { "key": "attributes", "label": "Attributes", "type": "attributes", "defaults": ["Material", "Style", "Color"] },
      { "key": "references", "label": "References", "type": "reference" },
      { "key": "tags", "label": "Tags", "type": "tags", "aiSuggest": true },
      { "key": "source", "label": "Source", "type": "link" }
    ],
    "showSearch": true,
    "aiAssist": true
  }
}
```

### 字段显示逻辑
- **空字段默认隐藏** - 只显示有内容的字段
- **编辑模式显示全部** - 点击编辑时展开所有字段
- **AI 建议字段** - 带 ✨ 图标，点击可让 AI 填充

---

## AI 智能功能

### 1. 自动信息提取（插入时）
**触发：** 用户贴入/添加图片时

**AI 分析内容：**
- 图片主题/物体识别
- 风格判断（Art Deco / 现代 / 极简 / 复古...）
- 颜色提取（主色调、配色）
- 情绪/氛围
- 相似性匹配（与已有图片对比）

**智能 Tag 推荐：**
- 基于图片内容分析
- 参考面板中已有图片的 tags
- 推荐相关但未使用的 tags
- 用户可一键接受或修改

**输出示例：**
```
🤖 AI 分析结果：
- 主题：青铜雕塑
- 风格：Art Deco, 几何主义
- 颜色：#8B7355 (古铜), #2C2C2C (深灰)
- 推荐 Tags：[sculpture] [bronze] [geometric] [1930s]
  已有相似 Tags：[art-deco] ✓ [heroic] ✓
  
[接受全部] [编辑] [跳过]
```

### 2. 扩展搜索（从 Info 面板）
**入口：** Info 面板右下角 🔍 按钮

**搜索选项：**
- 🔍 搜索相似图片（基于视觉相似）
- 🏷️ 搜索相同 Tags 的图片（Pinterest/Dribbble/Google）
- 📚 搜索相关资料（艺术家/设计师信息）
- 🛒 搜索购买链接（如适用）

**实现方式：**
- 调用 web_search API
- 调用 Pinterest/Dribbble API
- 返回结果可直接添加到 board

**CLI 支持：**
```bash
refboard search --similar <image>
refboard search --tags "art-deco,bronze"
refboard search --artist "Lee Lawrie"
```

---

## v2.0 Desktop — AI Architecture

RefBoard 2.0 uses two complementary AI subsystems: **CLIP** for local visual understanding and **AI Vision** for rich semantic analysis via cloud APIs.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RefBoard 2.0 Desktop                        │
├─────────────────────────────┬───────────────────────────────────────┤
│   CLIP (Local)              │   AI Vision (Remote API)              │
│   fastembed + ONNX Runtime  │   Anthropic / OpenAI / Ollama         │
├─────────────────────────────┼───────────────────────────────────────┤
│                             │                                       │
│  ┌───────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ Image Embeddings      │  │  │ Image Analysis                  │  │
│  │ 512-dim float vectors │  │  │ Description, tags, style, mood, │  │
│  │ CLIP ViT-B/32 model   │  │  │ colors, era                     │  │
│  └───────────┬───────────┘  │  └──────────────┬──────────────────┘  │
│              │              │                 │                      │
│  ┌───────────▼───────────┐  │  ┌──────────────▼──────────────────┐  │
│  │ Similarity Search     │  │  │ Context-Aware Tagging           │  │
│  │ Cosine similarity     │  │  │ Reuses existing board tags      │  │
│  │ "Find Similar" action │  │  │ when they apply                 │  │
│  └───────────┬───────────┘  │  └──────────────┬──────────────────┘  │
│              │              │                 │                      │
│  ┌───────────▼───────────┐  │  ┌──────────────▼──────────────────┐  │
│  │ Stored in SQLite      │  │  │ Stored in SQLite                │  │
│  │ embeddings table      │  │  │ images table + FTS5 index       │  │
│  │ per-project search.db │  │  │ per-project search.db           │  │
│  └───────────────────────┘  │  └─────────────────────────────────┘  │
│                             │                                       │
│  Runs: automatically on     │  Runs: on-demand (Cmd+Shift+A)        │
│  project open + image paste │  User triggers per image               │
│                             │                                       │
│  No API key needed          │  Requires API key (cloud) or           │
│  ~150MB model download      │  Ollama server (local)                 │
│  Apple Silicon CoreML accel │                                        │
└─────────────────────────────┴───────────────────────────────────────┘
```

### How They Work Together

1. **CLIP** answers "what looks like what" — fast visual similarity matching
2. **AI Vision** answers "what is this" — rich semantic understanding

When a user selects **Find Similar** on a card:
- If CLIP embeddings exist → cosine similarity on 512-dim vectors (fast, visual)
- Fallback → Jaccard similarity on tags + style + mood fields (metadata-based)

When a user clicks **Analyze with AI** (Cmd+Shift+A):
- AI Vision sends the image to the configured provider
- Returns structured JSON: description, tags, style, mood, colors, era
- The prompt references existing board tags for consistency

---

## CLIP Image Embedding

Local image embedding using CLIP ViT-B/32 via fastembed (ONNX Runtime). Provides visual similarity search without any external API.

**Source:** `src-tauri/src/embed.rs`

### Model

- **Architecture:** CLIP ViT-B/32
- **Runtime:** ONNX Runtime (with CoreML acceleration on Apple Silicon)
- **Output:** 512-dimensional float vectors per image
- **Model size:** ~150MB (auto-downloaded on first use)
- **Batch size:** 32 images per inference call

### Commands

| Command | Description |
|---------|-------------|
| `cmd_warmup_clip` | Pre-initialize the CLIP model (download + ONNX runtime setup) |
| `cmd_embed_project` | Generate embeddings for all unembedded images in a project |

### Warmup Behavior

The CLIP model is loaded lazily — it initializes on first use. To avoid lag when the user first pastes an image or opens a project, RefBoard warms up the model in the background:

```
App Start
    │
    ├── UI renders immediately
    │
    └── +3 seconds ──► invoke('cmd_warmup_clip')
                            │
                            ├── Model already cached? ──► instant return
                            │
                            └── First time? ──► download ~150MB model
                                               initialize ONNX runtime
                                               (runs in background thread)
```

**Implementation** (`main.js:35-39`):

```javascript
setTimeout(() => {
  invoke('cmd_warmup_clip').catch((err) => {
    console.warn('CLIP warmup skipped:', err);
  });
}, 3000);
```

**Paste before model is ready:** If the user pastes an image while the CLIP model is still initializing, the app shows a "Setting up CLIP model" dialog. The dialog dismisses automatically once embedding completes.

### Embedding Storage

Embeddings are stored in the per-project SQLite database (`{project}/.refboard/search.db`) in the `embeddings` table:

| Column | Type | Description |
|--------|------|-------------|
| `path` | TEXT | Image file path |
| `model` | TEXT | Model identifier (`clip-vit-b-32`) |
| `embedding` | BLOB | 512 float32 values |

Only images without existing embeddings are processed — re-running `cmd_embed_project` is safe and incremental.

---

## AI Vision Providers

AI Vision provides rich semantic analysis of images: description, tags, style, mood, colors, and era. Three providers are supported.

**Source:** `src-tauri/src/ai.rs`

### Provider Comparison

| | Anthropic (Claude) | OpenAI (GPT-4o) | Ollama (Local) |
|---|---|---|---|
| **Display name** | Claude Vision | GPT-4o Vision | Ollama (Local) |
| **Default model** | `claude-sonnet-4-5-20250929` | `gpt-4o` | `llava` |
| **Endpoint** | `api.anthropic.com/v1/messages` | `api.openai.com/v1/chat/completions` | `localhost:11434/api/chat` |
| **Auth** | `x-api-key` header | `Bearer` token | None |
| **API key env var** | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` | N/A |
| **Image format** | Base64 with media type | Data URI (`data:mime;base64,...`) | Raw base64 (no wrapper) |
| **JSON mode** | Natural (prompt-guided) | `response_format: json_object` | `format: "json"` |
| **Cost** | Per-token (cloud) | Per-token (cloud) | Free (local compute) |
| **Privacy** | Images sent to cloud | Images sent to cloud | All data stays local |
| **Speed** | Fast (~2-5s) | Fast (~2-5s) | Varies by hardware |

### Configuration

AI provider settings are stored in `~/.refboard/config.json`:

```json
{
  "ai": {
    "provider": "anthropic",
    "apiKey": "sk-ant-...",
    "endpoint": "https://api.anthropic.com/v1",
    "model": "claude-sonnet-4-5-20250929"
  }
}
```

The `provider` field accepts: `"anthropic"`, `"openai"`, or `"ollama"`.

### Switching Providers

1. Open **Settings** (gear icon in toolbar)
2. Select a provider from the dropdown
3. Enter your API key (Anthropic or OpenAI) or verify the Ollama endpoint
4. Optionally change the model
5. Click **Save**

Or set the API key via environment variable:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."   # for Anthropic
export OPENAI_API_KEY="sk-..."          # for OpenAI
```

### Ollama Setup

For fully local AI analysis with no cloud dependency:

1. Install [Ollama](https://ollama.com/)
2. Pull a vision model: `ollama pull llava`
3. Start the server: `ollama serve`
4. In RefBoard Settings, select **Ollama** and verify endpoint is `http://localhost:11434`

RefBoard can check Ollama availability via the `check_ollama` command (calls `/api/tags`).

### Analysis Output

All providers return the same unified `AnalysisResult` structure:

```json
{
  "description": "A bronze Art Deco sculpture featuring geometric forms",
  "tags": ["art-deco", "bronze", "sculpture", "geometric"],
  "style": ["geometric", "streamlined"],
  "mood": ["elegant", "powerful"],
  "colors": ["#8B7355", "#2C2C2C", "#D4AF37"],
  "era": "1920s"
}
```

### Context-Aware Tagging

When analyzing an image, the prompt automatically includes existing board tags. This encourages the AI to reuse consistent terminology across the project rather than inventing new tags for the same concepts.

### IPC Commands

| Command | Parameters | Description |
|---------|------------|-------------|
| `analyze_image` | `imagePath`, `providerConfig`, `existingTags` | Analyze a single image |
| `get_ai_config` | — | Read current AI provider config |
| `set_ai_config` | `config` | Save AI provider config |
| `check_ollama` | — | Check if Ollama is running locally |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ai:analysis:start` | image path | Analysis request sent |
| `ai:analysis:complete` | image path | Analysis succeeded |
| `ai:analysis:error` | error message | Analysis failed |

---

*Last updated: 2026-02-15*
