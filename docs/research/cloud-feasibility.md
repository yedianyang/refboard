# Deco 云端查看与协作可行性研究

> 前瞻性架构研究 — 识别当前架构的云端适配能力，规划需要预留的接口
>
> 日期：2026-02-17
> 作者：Researcher Agent

---

## 1. 可行性评估总结

### 难度评级矩阵

| 方案 | 难度 (1-5) | 开发周期 | 前端改动 | 后端改动 | 新增依赖 |
|------|-----------|---------|---------|---------|---------|
| **只读 Web Viewer** | 2/5 | 2-3 周 | 中等 | 少量 | 静态服务器 |
| **云端存储 + 同步** | 3/5 | 4-6 周 | 中等 | 大量 | S3/R2, 云数据库 |
| **实时协作编辑** | 5/5 | 3-6 月 | 大量 | 大量 | CRDT库, WebSocket |

### 关键发现

1. **StorageProvider trait 是最大的架构优势。** 当前 `desktop/src-tauri/src/storage/mod.rs` 已定义 `StorageProvider` trait，`LocalStorage` 是唯一实现。添加 `CloudStorage` 实现即可让后端支持云端——前端几乎不需要改动。这是非常有远见的架构决策。

2. **前端对 Tauri API 的依赖是主要阻碍。** 前端代码中大量使用 `invoke()`, `convertFileSrc()`, `listen()`, `getCurrentWindow()` 等 Tauri 特有 API。要在纯浏览器环境运行，需要一个 adapter layer 来桥接这些调用。

3. **PixiJS 8 本身完全兼容浏览器。** PixiJS 是纯 WebGL/WebGPU 库，不依赖 Tauri。canvas 引擎（`desktop/src/canvas/`）可以直接在任何现代浏览器运行，前提是解决数据加载问题。

---

## 2. 只读查看方案（最简路径）

### 2.1 方案概述

最低成本的云端方案：将项目导出为可独立访问的 Web 页面，或提供一个只读 Web Viewer。

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────┐
│  Deco Desktop App (创作端)                           │
│  ┌─────────────────┐                                │
│  │  Export to Cloud │ ── board.json + images ──┐     │
│  └─────────────────┘                          │     │
└───────────────────────────────────────────────│─────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────┐
│  Cloud Storage (S3 / R2 / Supabase Storage)         │
│  /{project-id}/                                      │
│  ├── board.json          (画布状态)                  │
│  ├── metadata.json       (项目元数据)                │
│  ├── search.json         (导出的标签/描述数据)       │
│  └── images/                                         │
│      ├── thumb/          (缩略图 ~200px)            │
│      └── full/           (原图)                      │
└───────────────────────────────┬─────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────┐
│  Web Viewer (纯浏览器端, 无 Tauri)                   │
│  ┌─────────────────────────────────────────────┐    │
│  │  PixiJS 8 Canvas (只读, 缩放/平移/浏览)     │    │
│  │  + 图片懒加载 (HTTP URLs)                    │    │
│  │  + 标签/搜索 (客户端 JSON 过滤)              │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2.3 需要改动的文件

**前端（中等改动）：**

| 文件 | 改动内容 |
|------|---------|
| `desktop/src/canvas/cards.js` | `convertFileSrc(path)` → HTTP URL adapter |
| `desktop/src/canvas/index.js` | 移除 Tauri-only 初始化代码 |
| `desktop/src/canvas/toolbar.js` | `loadProject()` 需要支持从 HTTP JSON 加载 |
| `desktop/src/main.js` | 抽取为两个入口：`main-desktop.js` + `main-viewer.js` |
| `desktop/src/panels.js` | 只读模式隐藏编辑功能 |
| `desktop/src/search.js` | 改为客户端 JSON 过滤（不调用 Rust） |

**后端（少量改动）：**

| 文件 | 改动内容 |
|------|---------|
| `desktop/src-tauri/src/lib.rs` | 新增 `export_for_web` 命令 |
| `desktop/src-tauri/src/api.rs` | 新增 `GET /api/export` 端点 |

### 2.4 Web Viewer 前端 Adapter

核心问题：前端代码依赖 `@tauri-apps/api`。解决方案是创建一个 adapter 模块：

```javascript
// src/platform/adapter.js — 平台抽象层

/**
 * 平台适配器接口。
 * Tauri 实现调用 invoke()，Web 实现调用 HTTP API。
 */

let adapter = null;

export function setAdapter(impl) {
  adapter = impl;
}

export function getAdapter() {
  if (!adapter) throw new Error('Platform adapter not initialized');
  return adapter;
}

// ----- Tauri Adapter -----
export class TauriAdapter {
  constructor() {
    this._tauri = null;
  }

  async init() {
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');
    this._invoke = invoke;
    this._convertFileSrc = convertFileSrc;
    this._listen = listen;
  }

  async invoke(cmd, args) {
    return this._invoke(cmd, args);
  }

  resolveImageUrl(path) {
    return this._convertFileSrc(path);
  }

  async listen(event, handler) {
    return this._listen(event, handler);
  }

  get isDesktop() { return true; }
  get isReadOnly() { return false; }
}

// ----- Web Viewer Adapter -----
export class WebViewerAdapter {
  constructor(baseUrl, projectData) {
    this.baseUrl = baseUrl;      // e.g. "https://cdn.example.com/projects/abc123"
    this.projectData = projectData; // pre-loaded board.json + metadata
  }

  async invoke(cmd, args) {
    // Map Tauri commands to local data or HTTP calls
    switch (cmd) {
      case 'scan_images':
        return this.projectData.images || [];
      case 'load_board_state':
        return this.projectData.boardState || null;
      case 'cmd_search_text':
        return this._localSearch(args.query);
      case 'cmd_get_all_tags':
        return this.projectData.tags || [];
      default:
        console.warn(`[WebViewer] Unsupported command: ${cmd}`);
        return null;
    }
  }

  resolveImageUrl(localPath) {
    // Convert local path to CDN URL
    // /Users/me/Documents/Deco/proj/images/photo.jpg → {baseUrl}/images/photo.jpg
    const filename = localPath.split('/').pop();
    return `${this.baseUrl}/images/${filename}`;
  }

  resolveThumbnailUrl(localPath) {
    const filename = localPath.split('/').pop();
    return `${this.baseUrl}/images/thumb/${filename}`;
  }

  async listen(event, handler) {
    // No-op for static viewer
    return () => {};
  }

  get isDesktop() { return false; }
  get isReadOnly() { return true; }

  _localSearch(query) {
    if (!query || !this.projectData.searchIndex) return [];
    const q = query.toLowerCase();
    return this.projectData.searchIndex.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
}
```

### 2.5 导出格式

从桌面端导出时生成的数据包：

```json
{
  "version": 2,
  "projectId": "uuid-here",
  "name": "Art Deco References",
  "exportedAt": "2026-02-17T10:00:00Z",
  "boardState": {
    "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
    "items": [
      {
        "type": "image",
        "name": "sculpture.jpg",
        "path": "images/sculpture.jpg",
        "x": 100, "y": 200,
        "width": 232, "height": 310,
        "zIndex": 1,
        "tags": ["art-deco", "sculpture"],
        "description": "Bronze art-deco dancer sculpture"
      }
    ],
    "groups": [],
    "annotations": []
  },
  "images": [
    {
      "name": "sculpture.jpg",
      "path": "images/sculpture.jpg",
      "sizeBytes": 245000,
      "thumbPath": "images/thumb/sculpture.jpg"
    }
  ],
  "searchIndex": [
    {
      "name": "sculpture.jpg",
      "path": "images/sculpture.jpg",
      "description": "Bronze art-deco dancer sculpture",
      "tags": ["art-deco", "sculpture", "bronze"],
      "style": ["geometric"],
      "mood": ["elegant"],
      "colors": ["#D4AF37"],
      "era": "1920s"
    }
  ],
  "tags": [
    { "tag": "art-deco", "count": 15 },
    { "tag": "sculpture", "count": 8 }
  ]
}
```

---

## 3. 技术难点清单

### 3.1 PixiJS 8 在纯浏览器中运行

**难度: 1/5 — 几乎无障碍**

PixiJS 8 是纯 JavaScript WebGL/WebGPU 库，天然支持浏览器。当前 canvas 模块 (`desktop/src/canvas/`) 的唯一外部依赖是：

| 依赖 | 出现位置 | 解决方案 |
|------|---------|---------|
| `convertFileSrc()` | `cards.js:5`, `toolbar.js` | adapter.resolveImageUrl() |
| `invoke()` | `toolbar.js` (loadProject, getBoardState) | adapter.invoke() |

canvas 核心模块（`state.js`, `renderer.js`, `selection.js`, `groups.js`, `shortcuts.js`）完全不依赖 Tauri。

### 3.2 图片加载: `asset://` → HTTP URLs

**难度: 2/5 — 需要 adapter 但改动集中**

当前图片加载流程：
```
本地路径 → convertFileSrc() → asset://localhost/{encoded-path} → WebView 加载
```

云端流程：
```
本地路径 → adapter.resolveImageUrl() → https://cdn.example.com/images/photo.jpg → 浏览器加载
```

关键文件：
- `/Users/metro/Projects/refboard/desktop/src/canvas/cards.js` 第 65 行：`card._textureUrl = convertFileSrc(imageInfo.path);`
- `/Users/metro/Projects/refboard/desktop/src/panels.js` 第 112 行：`thumb.src = convertFileSrc(card.data.path);`
- `/Users/metro/Projects/refboard/desktop/src/search.js` 第 333 行：`thumb.src = convertFileSrc(result.imagePath);`

所有这些调用需要替换为 `adapter.resolveImageUrl(path)`。

### 3.3 SQLite → 云端数据库

**难度: 3/5 — StorageProvider trait 已铺好路**

当前数据存储：
- 项目元数据: `{project}/.deco/search.db` (SQLite + FTS5)
- 画布状态: `{project}/.deco/board.json` (JSON 文件)
- 应用配置: `~/.deco/config.json` (JSON 文件)

**迁移路径选项：**

| 方案 | 优势 | 劣势 |
|------|------|------|
| **PostgreSQL + PostgREST** | SQL 兼容, 全文搜索成熟 | 需要服务器运维 |
| **Supabase (Postgres)** | 托管服务, 自带 Auth/Storage/Realtime | 增加云端依赖 |
| **Cloudflare D1 (SQLite)** | 与现有 SQLite schema 高度兼容 | edge 限制, 功能有限 |
| **Turso (libSQL)** | SQLite 兼容 + 嵌入式副本 | 较新, 生态小 |

**推荐方案：Supabase**
- PostgreSQL 全文搜索可替代 FTS5（`tsvector` + `ts_query`）
- `pgvector` 扩展可替代 BLOB embedding 存储
- 自带 Auth, Storage (替代 S3), Realtime (替代 WebSocket)
- 免费层足够 MVP

**实现方式：** 在 `desktop/src-tauri/src/storage/` 下新增 `cloud.rs`，实现 `StorageProvider` trait：

```rust
// desktop/src-tauri/src/storage/cloud.rs (概念代码)

use async_trait::async_trait;
use super::StorageProvider;

pub struct CloudStorage {
    client: reqwest::Client,
    base_url: String,     // e.g. "https://xyz.supabase.co"
    api_key: String,      // supabase anon key
    auth_token: Option<String>,
}

#[async_trait]
impl StorageProvider for CloudStorage {
    async fn save_board_state(
        &self,
        project_path: &str,
        state: &serde_json::Value,
    ) -> Result<(), String> {
        let url = format!("{}/rest/v1/boards?id=eq.{}", self.base_url, project_path);
        self.client
            .patch(&url)
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", self.auth_token.as_deref().unwrap_or(&self.api_key)))
            .json(&serde_json::json!({ "state": state }))
            .send()
            .await
            .map_err(|e| format!("Cloud save failed: {e}"))?;
        Ok(())
    }

    async fn load_board_state(
        &self,
        project_path: &str,
    ) -> Result<Option<serde_json::Value>, String> {
        let url = format!("{}/rest/v1/boards?id=eq.{}&select=state", self.base_url, project_path);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await
            .map_err(|e| format!("Cloud load failed: {e}"))?;
        // Parse response...
        Ok(None) // placeholder
    }

    // ... 其他 trait 方法类似
}
```

### 3.4 CLIP Embeddings 浏览器端运行

**难度: 4/5 — 可行但性能差距大**

| 方案 | 性能 | 模型大小 | 兼容性 |
|------|------|---------|--------|
| **ONNX Runtime Web (WASM)** | ~5-10x 慢于原生 | ~150MB 下载 | 所有现代浏览器 |
| **ONNX Runtime Web (WebGPU)** | ~2-3x 慢于原生 | ~150MB 下载 | Chrome/Edge 限定 |
| **Transformers.js** | ~3-5x 慢于原生 | ~150MB 下载 | 封装好, 易用 |
| **服务端 API** | 等于原生 | 0 客户端负担 | 需要服务器 |

**推荐：云端 Viewer 不需要本地 CLIP。** 
- 桌面端生成 embeddings → 导出时包含向量数据
- Web Viewer 做相似搜索时，直接用导出的向量做客户端 cosine similarity
- 如需在 Web 端生成新 embedding，调用服务端 API

### 3.5 认证与授权

**难度: 2/5 — 标准方案，不涉及核心架构**

| 层级 | 方案 |
|------|------|
| **匿名查看** | 分享链接 + token (e.g. `https://app.deco.art/view/abc123?token=xyz`) |
| **注册用户** | Supabase Auth / Auth0 / 自建 JWT |
| **项目权限** | owner / editor / viewer 三级权限 |
| **API 保护** | Bearer token + rate limiting |

**Hook 点（当前需要预留）：**

在 `StorageProvider` trait 中添加 auth 相关方法：

```rust
// 新增到 StorageProvider trait
async fn authenticate(&self, credentials: AuthCredentials) -> Result<AuthToken, String>;
async fn check_permission(&self, project_id: &str, action: &str) -> Result<bool, String>;
```

在前端 adapter 中添加：

```javascript
// adapter 中添加
async getAuthToken() { return null; }  // Local 不需要
async setAuthToken(token) {}
async checkPermission(projectId, action) { return true; }
```

---

## 4. 架构重构建议

### 4.1 当前架构优劣分析

**已有的良好抽象（保留并扩展）：**

1. **`StorageProvider` trait** (`/Users/metro/Projects/refboard/desktop/src-tauri/src/storage/mod.rs`)
   - 已经定义了 25+ 个 async 方法
   - `LocalStorage` 实现完整
   - 直接新增 `CloudStorage` 实现即可

2. **`AiVisionProvider` trait** (`/Users/metro/Projects/refboard/desktop/src-tauri/src/ai.rs:213`)
   - AI 分析已抽象为 trait
   - 3 个 provider 实现完备
   - 云端可直接复用

3. **HTTP API** (`/Users/metro/Projects/refboard/desktop/src-tauri/src/api.rs`)
   - 15 个端点已定义，覆盖 CRUD + 搜索 + 嵌入
   - 响应格式标准化（JSON）
   - 可直接作为云端 API 的基础

**需要新增的抽象：**

### 4.2 前端平台抽象层

```
desktop/src/
├── platform/
│   ├── adapter.js          # 接口定义 + factory
│   ├── tauri-adapter.js    # Tauri 实现 (invoke, convertFileSrc, listen)
│   └── web-adapter.js      # Web 实现 (fetch, HTTP URLs, EventSource)
├── canvas/                  # 不变 — 纯 PixiJS，无平台依赖
├── main.js                  # 改为：import adapter → init canvas → load project
├── main-viewer.js           # 新增：只读 Web 入口
├── panels.js                # 改为使用 adapter
├── search.js                # 改为使用 adapter
└── collection.js            # 改为使用 adapter
```

### 4.3 需要修改的文件清单

**高优先级（Phase 1 — 只读 Viewer 需要）：**

| 文件 | 当前状态 | 需要改动 |
|------|---------|---------|
| `desktop/src/canvas/cards.js` | 直接调用 `convertFileSrc` | 改为 `adapter.resolveImageUrl()` |
| `desktop/src/canvas/toolbar.js` | 直接调用 `invoke` | 改为 `adapter.invoke()` |
| `desktop/src/panels.js` | 大量 `invoke()` + `convertFileSrc()` | 改为 adapter；只读模式隐藏编辑 UI |
| `desktop/src/search.js` | 直接调用 `invoke` | 改为 adapter；Web 端用客户端过滤 |
| `desktop/src/main.js` | Tauri 事件监听 | 拆分为 desktop/viewer 两个入口 |

**中优先级（Phase 2 — 云端存储需要）：**

| 文件 | 需要改动 |
|------|---------|
| `desktop/src-tauri/src/storage/mod.rs` | 新增 `CloudStorage` 变体 |
| `desktop/src-tauri/src/storage/` | 新增 `cloud.rs` |
| `desktop/src-tauri/src/lib.rs` | Storage 初始化支持选择 local/cloud |
| `desktop/src-tauri/src/api.rs` | CORS 支持；可选认证中间件 |

**低优先级（Phase 3 — 实时协作需要）：**

| 文件 | 需要改动 |
|------|---------|
| `desktop/src/canvas/state.js` | 状态管理接入 CRDT |
| `desktop/src/canvas/selection.js` | 多用户光标显示 |
| `desktop/src/canvas/renderer.js` | 远程用户操作渲染 |

### 4.4 存储抽象层设计

在后端，已有的 `StorageProvider` trait 需要扩展以下方法来支持云端：

```rust
// 新增到 StorageProvider trait (storage/mod.rs)

/// 获取图片的可访问 URL（本地返回 file path，云端返回 CDN URL）
async fn resolve_image_url(
    &self,
    project_path: &str,
    image_path: &str,
) -> Result<String, String>;

/// 上传图片到存储（本地为 fs::copy，云端为 S3 upload）
async fn upload_image(
    &self,
    project_path: &str,
    filename: &str,
    data: Vec<u8>,
) -> Result<String, String>;

/// 导出项目为 Web Viewer 格式
async fn export_for_web(
    &self,
    project_path: &str,
) -> Result<serde_json::Value, String>;

/// 获取项目的分享链接
async fn get_share_url(
    &self,
    project_path: &str,
) -> Result<Option<String>, String>;
```

---

## 5. 需要预留的接口

### 5.1 前端接口预留

**立即可做（不影响现有功能）：**

1. **统一 `convertFileSrc` 调用点**

   当前 `convertFileSrc` 散落在多个文件中。建议现在就封装为一个工具函数：

   ```javascript
   // src/utils/image-url.js
   import { convertFileSrc } from '@tauri-apps/api/core';

   /**
    * 将本地图片路径转换为可加载的 URL。
    * 未来这里会根据运行环境切换策略。
    */
   export function resolveImageUrl(localPath) {
     return convertFileSrc(localPath);
   }

   export function resolveThumbnailUrl(localPath) {
     // 未来可以返回缩略图 CDN URL
     return convertFileSrc(localPath);
   }
   ```

   然后在 `cards.js`, `panels.js`, `search.js` 中替换直接调用。

2. **统一 `invoke` 调用点**

   ```javascript
   // src/utils/backend.js
   import { invoke as tauriInvoke } from '@tauri-apps/api/core';

   /**
    * 调用后端命令。
    * 未来可切换为 HTTP API 调用。
    */
   export async function invoke(cmd, args) {
     return tauriInvoke(cmd, args);
   }
   ```

3. **Board State 序列化格式标准化**

   当前 `getBoardState()` 返回的 JSON 结构需要文档化，因为 Web Viewer 依赖它：

   ```typescript
   // board-state.d.ts — 类型定义（文档用途）
   interface BoardState {
     version: 2;
     viewport: { x: number; y: number; zoom: number };
     items: BoardItem[];
     groups: BoardGroup[];
     annotations: Annotation[];
   }

   interface BoardItem {
     type: 'image' | 'text' | 'shape';
     name: string;
     path?: string;     // 图片路径（image type）
     x: number;
     y: number;
     width: number;
     height: number;
     zIndex: number;
     // Image-specific
     tags?: string[];
     description?: string;
     style?: string[];
     mood?: string[];
     colors?: string[];
     era?: string;
     // Text-specific
     text?: string;
     fontSize?: number;
     color?: number;
     // Shape-specific
     shapeType?: 'rect' | 'ellipse' | 'line';
     strokeWidth?: number;
     hasFill?: boolean;
     lineStyle?: 'solid' | 'dashed';
   }

   interface BoardGroup {
     id: string;
     name?: string;
     memberNames: string[];
   }
   ```

### 5.2 后端接口预留

**StorageProvider trait 扩展建议（现在添加空实现）：**

```rust
// 在 StorageProvider trait 中添加，LocalStorage 返回默认值

/// Check if this storage backend supports cloud features.
async fn is_cloud(&self) -> bool { false }

/// Get the public URL for viewing a project (cloud only).
async fn get_share_url(&self, _project_path: &str) -> Result<Option<String>, String> {
    Ok(None)
}

/// Export project data for the web viewer.
async fn export_for_web(&self, project_path: &str) -> Result<serde_json::Value, String>;

/// Resolve an image path to a loadable URL.
/// Local: returns the file path as-is (frontend uses convertFileSrc).
/// Cloud: returns a signed CDN URL.
async fn resolve_image_url(
    &self,
    project_path: &str,
    image_path: &str,
) -> Result<String, String> {
    Ok(image_path.to_string()) // default: return as-is
}
```

### 5.3 HTTP API 扩展预留

当前 API (`/Users/metro/Projects/refboard/desktop/src-tauri/src/api.rs`) 只绑定 `127.0.0.1`。

**云端需要的 API 变化：**

```
# 当前端点（保留）
GET  /api/status
GET  /api/projects
GET  /api/list?project=PATH
GET  /api/search?project=PATH&q=QUERY
GET  /api/tags?project=PATH
POST /api/import
DELETE /api/delete

# 新增端点（未来）
POST   /api/auth/login           # 认证
POST   /api/auth/register        # 注册
GET    /api/projects/:id/share   # 获取分享链接
POST   /api/projects/:id/share   # 创建分享链接
GET    /api/view/:shareToken     # 只读查看数据
GET    /api/images/:hash         # CDN 图片代理
WS     /api/ws/:projectId        # WebSocket (实时协作)
```

---

## 6. 数据同步方案

### 6.1 方案对比

| 维度 | 简单云备份 | Operational Transform | CRDT (Yjs) | CRDT (Automerge) |
|------|-----------|----------------------|------------|------------------|
| **复杂度** | 低 | 高 | 中 | 中 |
| **离线支持** | 差（需在线） | 差 | 优秀 | 优秀 |
| **冲突处理** | 后写入胜 | 服务端仲裁 | 自动合并 | 自动合并 |
| **实时性** | 手动同步 | 毫秒级 | 毫秒级 | 毫秒级 |
| **适合场景** | 备份/导出 | 文档编辑 | 画布协作 | 画布协作 |
| **Rust 支持** | N/A | 需自实现 | 无（仅 JS） | 有（automerge-rs） |
| **JS 支持** | N/A | 需自实现 | 优秀 | 良好 |
| **社区成熟度** | N/A | Google Docs 验证 | Figma/tldraw 级别 | 学术背景，工业化中 |
| **新增依赖** | 无 | 大量自研 | `yjs` npm 包 | `automerge` npm + Rust crate |

### 6.2 推荐路径

**Phase 1 (只读查看):** 简单云备份 — 导出 JSON + 图片到云存储，无需同步

**Phase 2 (云端存储):** 简单同步 — 用版本号 + last-write-wins 策略
```
桌面端修改 → save(board, version: N+1) → 云端存储
另一设备 → load() → 检查 version → 若落后则下载最新
```

**Phase 3 (实时协作):** **推荐 Yjs** 而非 Automerge

理由：
1. **Yjs 是画布类应用的事实标准** — tldraw、Excalidraw、BlockNote 都使用 Yjs
2. **更轻量** — 打包体积约 20KB (gzip)，Automerge 约 200KB
3. **生态更成熟** — y-websocket, y-webrtc, y-indexeddb 等配套库完善
4. **性能更好** — 在大量并发操作的 benchmark 中 Yjs 持续领先

**Yjs 数据模型映射（概念设计）：**

```javascript
// 画布状态映射到 Yjs 类型
import * as Y from 'yjs';

const doc = new Y.Doc();

// 画布项（图片/文字/图形）用 Y.Map 存储
const items = doc.getMap('items');        // Map<string, Y.Map>
const groups = doc.getMap('groups');      // Map<string, Y.Map>
const viewport = doc.getMap('viewport');  // { x, y, zoom } per user

// 添加一个图片卡片
const card = new Y.Map();
card.set('type', 'image');
card.set('name', 'photo.jpg');
card.set('x', 100);
card.set('y', 200);
card.set('width', 232);
card.set('height', 310);
items.set('card-id-123', card);

// 监听远程变更
items.observe(event => {
  for (const [key, change] of event.changes.keys) {
    if (change.action === 'add') {
      // 远程新增了卡片 → 在 PixiJS 中创建
      const cardData = items.get(key).toJSON();
      addImageCard(cardData, cardData.x, cardData.y);
    } else if (change.action === 'update') {
      // 远程移动/修改了卡片 → 更新 PixiJS 位置
    } else if (change.action === 'delete') {
      // 远程删除了卡片 → 从 PixiJS 移除
    }
  }
});
```

### 6.3 Automerge 替代方案（如果需要 Rust 端同步）

如果未来需要在 Rust 后端做同步逻辑（而非仅前端 JS），Automerge 是更好的选择：

```rust
// Cargo.toml
// automerge = "0.5"

use automerge::{AutoCommit, ObjType, ROOT};

let mut doc = AutoCommit::new();
let items = doc.put_object(ROOT, "items", ObjType::Map).unwrap();

// 添加卡片
let card = doc.put_object(&items, "card-123", ObjType::Map).unwrap();
doc.put(&card, "type", "image").unwrap();
doc.put(&card, "x", 100.0).unwrap();
doc.put(&card, "y", 200.0).unwrap();

// 生成同步消息
let sync_state = automerge::sync::State::new();
let message = doc.generate_sync_message(&mut sync_state);
```

---

## 7. 参考案例分析

### 7.1 Figma — 从本地到云原生

**架构特点：**
- **自研 CRDT**：不使用现成库，自研基于 object-level OT 的冲突解决
- **服务端权威**：所有操作通过服务端排序，客户端乐观更新
- **增量同步**：只传输变更（delta），不传输完整文档
- **二进制协议**：自定义二进制格式，非 JSON，极小传输体积
- **WebGL 渲染**：与 Deco 的 PixiJS 类似，通过 WebGL 渲染画布

**对 Deco 的启示：**
- Figma 的方案过于复杂，不建议模仿
- 但其 "客户端渲染 + 服务端数据" 的分离思路值得借鉴
- Deco 的 PixiJS 画布 + HTTP API 数据已经具备这种分离

### 7.2 Excalidraw — 开源，本地 + 云端并存

**架构特点：**
- **本地优先**：默认数据存 localStorage/IndexedDB
- **可选云端**：Excalidraw+ 提供云端同步，使用 Firebase
- **协作模式**：使用 WebSocket rooms，所有操作实时广播
- **导出格式**：.excalidraw (JSON) 文件，可自由分享
- **无需后端**：完整功能可在纯浏览器运行

**对 Deco 的启示：**
- **导出 JSON + 静态托管 = 最低成本只读分享**
- 协作用 WebSocket rooms，不需要复杂 CRDT
- 如果画布操作简单（拖拽、缩放），"最后写入胜" 可以接受

### 7.3 tldraw — 开源画布 + 多人协作

**架构特点：**
- **Yjs 驱动**：使用 Yjs CRDT 做状态同步
- **自定义 store**：`@tldraw/store` 管理所有画布状态
- **React 渲染**：用 React + SVG/Canvas 渲染（不是 PixiJS）
- **同步层可替换**：支持 y-websocket、y-webrtc、Cloudflare DO

**对 Deco 的启示：**
- tldraw 的 "store + sync adapter" 模式值得学习
- 将 `canvas/state.js` 升级为可观察 store，方便接入 Yjs
- 他们的做法证明：Yjs + 画布 = 可行的协作方案

### 7.4 Linear — Local-first 同步

**架构特点：**
- **IndexedDB 本地数据库**：完整数据集驻留客户端
- **增量同步**：通过 WebSocket 推送 delta
- **离线支持**：完全离线可用，上线后自动合并
- **事务模型**：操作按序号排列，冲突时服务端仲裁

**对 Deco 的启示：**
- 对于 "非实时但需同步" 的场景（如跨设备查看），Linear 模式最合适
- 简单的版本号 + 增量同步 > 复杂的 CRDT

---

## 8. 实施路线图

### Phase 0: 接口预留（现在，0.5-1 天）

**目标：** 在不改变任何功能的前提下，统一调用入口，为未来改造铺路。

- [ ] 创建 `desktop/src/utils/image-url.js`，封装 `convertFileSrc()`
- [ ] 创建 `desktop/src/utils/backend.js`，封装 `invoke()`
- [ ] 在 `cards.js`, `panels.js`, `search.js`, `collection.js` 中替换直接调用
- [ ] 文档化 `board.json` schema（TypeScript 类型定义）
- [ ] 在 `StorageProvider` trait 中添加 `export_for_web()` 方法签名（`LocalStorage` 返回空）

**风险：** 零。纯重构，不改变行为。

### Phase 1: 只读 Web Viewer MVP（2-3 周）

**目标：** 从桌面端导出项目，生成可在浏览器中查看的静态页面。

- [ ] 实现 `export_for_web` Rust 命令（导出 JSON + 压缩图片）
- [ ] 创建 `WebViewerAdapter`（`platform/web-adapter.js`）
- [ ] 创建 `main-viewer.js` 入口（只读 PixiJS 画布）
- [ ] Vite 配置：build 时生成 viewer.html + JS bundle
- [ ] 图片懒加载（thumbnail 先加载，滚动到视口时加载大图）
- [ ] 基本搜索（客户端 JSON 过滤）
- [ ] 部署：上传到 Cloudflare Pages / Vercel / S3 static hosting

**交付物：** `deco export --web` CLI 命令 + 可托管的静态文件夹

### Phase 2: 云端存储（4-6 周）

**目标：** 项目数据存储在云端，支持跨设备访问。

- [ ] 选择云端方案（推荐 Supabase）
- [ ] 实现 `CloudStorage` (`storage/cloud.rs`)
- [ ] 图片上传到 Supabase Storage / S3
- [ ] 认证系统（Supabase Auth）
- [ ] 项目分享链接（public/private）
- [ ] 桌面端设置页添加 "登录 / 同步" 选项
- [ ] 冲突处理：简单版本号 + last-write-wins

**交付物：** 登录后项目自动同步到云端；分享链接可查看

### Phase 3: 实时协作（3-6 月）

**目标：** 多人同时编辑同一画布。

- [ ] 引入 Yjs (`npm install yjs y-websocket`)
- [ ] 将 `canvas/state.js` 重构为 Yjs-backed store
- [ ] 实现操作同步：拖拽、创建、删除、修改
- [ ] 远程用户光标显示
- [ ] 冲突合并 UI（当自动合并不够时）
- [ ] WebSocket 服务端（y-websocket 或自建）
- [ ] 性能优化：500+ 图片场景下的同步效率

**交付物：** 多人同时编辑；离线编辑 + 自动合并

---

## 附录

### A. 当前 Tauri API 使用点汇总

```
文件                          Tauri API                    调用次数
----                          ---------                    --------
desktop/src/main.js           invoke                       ~15
                              convertFileSrc               2
                              listen                       3
                              getCurrentWindow             3
desktop/src/panels.js         invoke                       ~10
                              convertFileSrc               3
desktop/src/search.js         invoke                       ~8
                              convertFileSrc               2
desktop/src/collection.js     invoke                       ~5
                              convertFileSrc               ~3
desktop/src/canvas/cards.js   convertFileSrc               1
desktop/src/canvas/toolbar.js invoke                       ~5
desktop/src/home.js           invoke                       ~5
desktop/src/compress.js       (none — pure JS)             0
desktop/src/shortcuts.js      (none — pure JS)             0
desktop/src/icons.js          (none — pure JS)             0
```

### B. 新增 Rust Crate 依赖（各阶段）

| Phase | Crate | 用途 | 大小影响 |
|-------|-------|------|---------|
| Phase 1 | 无新增 | 导出用现有 serde_json | 无 |
| Phase 2 | `jsonwebtoken` | JWT token 验证 | ~50KB |
| Phase 2 | `tower-http` (cors) | CORS 中间件 | ~100KB |
| Phase 3 | `automerge` (可选) | Rust 端 CRDT | ~2MB |

### C. 新增 npm 依赖（各阶段）

| Phase | Package | 用途 | Bundle 大小 |
|-------|---------|------|------------|
| Phase 1 | 无新增 | 静态 Viewer 用现有代码 | 无 |
| Phase 3 | `yjs` | CRDT 核心 | ~20KB gzip |
| Phase 3 | `y-websocket` | WebSocket 同步 | ~5KB gzip |
| Phase 3 | `y-indexeddb` | 离线持久化 | ~3KB gzip |

---

*本文档为架构研究，非开发计划。实际开发前需要 Team Lead 评审确认。*
