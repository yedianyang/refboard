# OpenClaw x Deco 集成指南

OpenClaw 操作面板通过 Deco 本地 HTTP API 实现对项目、图片、AI 分析和 CLIP 搜索的完整控制。

---

## 目录

1. [概述](#概述)
2. [前提条件](#前提条件)
3. [项目管理](#项目管理)
4. [图片操作](#图片操作)
5. [AI 分析](#ai-分析)
6. [CLIP 搜索与聚类](#clip-搜索与聚类)
7. [画布控制](#画布控制)
8. [配置](#配置)
9. [错误处理](#错误处理)
10. [端到端工作流示例](#端到端工作流示例)

---

## 概述

Deco 是一个 AI 驱动的视觉参考收集器 + Moodboard 工具。它在启动时会运行一个本地 HTTP API 服务（默认端口 `7890`），允许 OpenClaw 等外部工具通过标准 HTTP 请求实现：

- 发现并选择目标项目
- 导入图片（本地文件上传 / URL 下载）
- 删除、移动图片，更新元数据
- 触发 AI 视觉分析（自动打标签、描述、风格分类）
- 生成 CLIP 向量 embedding
- 按视觉相似度搜索、按文本语义搜索
- 自动聚类分组

所有端点仅监听 `127.0.0.1`（localhost），无需认证，适用于同一台机器上的可信工具调用。

### 端点一览

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/status` | 健康检查 |
| `GET` | `/api/projects` | 列出所有项目（名称、路径、图片数） |
| `POST` | `/api/import` | 导入图片（文件上传 / URL） |
| `DELETE` | `/api/delete` | 删除图片（含完整清理） |
| `POST` | `/api/move` | 移动画布上的图片位置 |
| `PATCH` | `/api/item` | 更新图片元数据 |
| `POST` | `/api/embed` | 生成单张图片的 CLIP embedding |
| `POST` | `/api/embed-batch` | 批量生成 CLIP embedding |
| `POST` | `/api/similar` | 按视觉相似度搜索 |
| `POST` | `/api/search-semantic` | 文本语义搜索（FTS5） |
| `POST` | `/api/cluster` | 自动视觉聚类 |

---

## 前提条件

1. **Deco 桌面端必须正在运行。** API 服务随 Deco 启动自动开启。
2. **默认地址：** `http://127.0.0.1:7890`
3. **验证服务可用：**

```bash
curl http://127.0.0.1:7890/api/status
```

**响应：**

```json
{
  "status": "ok",
  "version": "2.0.0",
  "port": 7890
}
```

如果连接失败，检查：
- Deco 是否已启动
- 端口是否被占用：`lsof -i :7890`
- 端口配置是否被修改（见[配置](#配置)章节）

---

## 项目管理

### 项目目录结构

每个 Deco 项目是磁盘上的一个目录，包含以下结构：

```
~/Documents/Deco/
├── art-deco/
│   ├── images/                # 图片存储目录
│   ├── thumbnails/            # 缩略图缓存
│   ├── metadata.json          # 项目元信息（名称、创建时间）
│   └── .deco/
│       ├── search.db          # SQLite 数据库（FTS5 索引 + 元数据 + CLIP embedding）
│       ├── board.json         # 画布状态（图片位置、分组、标注、z-order）
│       └── deco.json          # 项目配置（版本号）
├── cyberpunk/
│   ├── images/
│   └── .deco/
└── minimalism/
    ├── images/
    └── .deco/
```

### GET /api/projects — 列出所有项目

OpenClaw 应首先调用此接口获取用户的所有 Deco 项目，然后向用户提问"要操作哪个面板？"

```bash
curl http://127.0.0.1:7890/api/projects
```

**响应：**

```json
[
  { "name": "Art Deco", "path": "/Users/you/Documents/Deco/art-deco", "imageCount": 38 },
  { "name": "Cyberpunk", "path": "/Users/you/Documents/Deco/cyberpunk", "imageCount": 12 },
  { "name": "Minimalism", "path": "/Users/you/Documents/Deco/minimalism", "imageCount": 5 }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 项目名称 |
| `path` | string | 项目绝对路径（用作后续所有 API 的 `projectPath`） |
| `imageCount` | number | 当前图片数量 |

**典型用法：**

1. 调用 `GET /api/projects` 获取项目列表
2. 展示给用户选择（如下拉菜单或对话式选择）
3. 用户选定后，将 `path` 作为后续操作的 `projectPath`

> 仅返回目录仍存在的项目，已删除的目录会自动跳过。

### 备选方案：读取 recent.json

也可直接读取 `~/.deco/recent.json` 文件获取项目列表（无需 Deco 运行）：

```json
[
  { "name": "Art Deco", "path": "/Users/you/Documents/Deco/art-deco" },
  { "name": "Cyberpunk", "path": "/Users/you/Documents/Deco/cyberpunk" }
]
```

> 注意：读取文件方式不包含 `imageCount`，且可能包含已删除的项目路径。推荐优先使用 HTTP API。

---

## 图片操作

### POST /api/import -- 导入图片

支持两种导入方式：本地文件上传和 URL 下载。使用 `multipart/form-data` 格式。

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_path` | string | 是 | 目标项目的绝对路径 |
| `file` | binary | 否* | 图片文件（multipart 上传） |
| `url` | string | 否* | 图片下载 URL |
| `analyze` | boolean | 否 | 设为 `true` 触发 AI 分析（默认 `false`） |
| `position` | JSON | 否 | 画布放置坐标，格式 `{"x": 100, "y": 200}` |

*`file` 和 `url` 必须提供其一，不可同时提供。

**响应：**

```json
{
  "id": "sunset.jpg",
  "filename": "sunset.jpg",
  "path": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
  "position": { "x": 100, "y": 200 },
  "analysis": null
}
```

**说明：**
- 导入成功后，后台会自动为新图片生成 CLIP embedding 并索引到搜索数据库（异步，不阻塞响应）
- 前端通过 Tauri 事件 `api:image-imported` 实时更新画布
- 如果指定 `analyze=true`，AI 分析异步进行，`analysis` 字段在响应中始终为 `null`，结果通过 Tauri 事件通知前端

**示例：**

```bash
# 上传本地文件
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@/path/to/image.jpg"

# 从 URL 导入
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "url=https://example.com/reference/building.jpg"

# 导入 + 指定位置 + AI 分析
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "url=https://example.com/ref.png" \
  -F 'position={"x": 200, "y": 150}' \
  -F "analyze=true"
```

**支持的图片格式：** PNG, JPEG, GIF, WebP, SVG, BMP, AVIF, TIFF

### DELETE /api/delete -- 删除图片

从项目中完整删除一张图片。执行以下清理操作：

1. 删除 `images/` 目录中的原始图片文件
2. 删除 `thumbnails/` 目录中对应的缩略图
3. 删除 SQLite 数据库中的元数据记录（`images` 表）
4. 删除 SQLite 数据库中的 CLIP embedding（`embeddings` 表）

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "filename": "sunset.jpg"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `filename` | string | 是 | 要删除的图片文件名（`images/` 目录下的文件名） |

**响应：**

```json
{
  "success": true,
  "message": "Successfully deleted sunset.jpg"
}
```

**安全检查：**
- `filename` 不能包含 `..` 或绝对路径，防止路径遍历攻击
- 文件必须位于项目的 `images/` 目录内

**错误码：**

| HTTP 状态码 | 含义 |
|-------------|------|
| 400 | 路径无效或请求格式错误 |
| 403 | 检测到路径遍历（filename 包含 `..` 或绝对路径） |
| 404 | 文件不存在 |
| 500 | 删除操作失败（权限或磁盘错误） |

**示例：**

```bash
curl -X DELETE http://127.0.0.1:7890/api/delete \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "sunset.jpg"}'
```

前端通过 Tauri 事件 `api:image-deleted` 实时移除画布上的卡片。

### POST /api/move -- 移动图片位置

修改图片在画布上的坐标位置。直接更新 `board.json` 中对应 item 的 x/y 值。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "filename": "sunset.jpg",
  "x": 500,
  "y": 300
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `filename` | string | 是 | 图片文件名 |
| `x` | number | 是 | 新的 X 坐标 |
| `y` | number | 是 | 新的 Y 坐标 |

**响应：**

```json
{
  "status": "moved",
  "filename": "sunset.jpg",
  "x": 500.0,
  "y": 300.0
}
```

**示例：**

```bash
curl -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "sunset.jpg", "x": 500, "y": 300}'
```

前端通过 Tauri 事件 `api:item-moved` 更新卡片位置。

### PATCH /api/item -- 更新图片元数据

更新图片的标签、描述等元数据。只需传入要修改的字段，未传入的字段保持不变。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "filename": "sunset.jpg",
  "tags": ["art-deco", "gold", "geometric"],
  "description": "Art deco geometric pattern with gold accents",
  "styles": ["art-deco", "decorative"],
  "moods": ["luxurious", "elegant"],
  "era": "1920s",
  "artist": "Unknown"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `filename` | string | 是 | 图片文件名 |
| `title` | string | 否 | 显示标题 |
| `description` | string | 否 | 描述文本 |
| `tags` | string[] | 否 | 标签数组 |
| `styles` | string[] | 否 | 风格描述 |
| `moods` | string[] | 否 | 情绪描述 |
| `era` | string | 否 | 年代 |
| `artist` | string | 否 | 艺术家名称 |

**响应：**

```json
{
  "status": "updated",
  "filename": "sunset.jpg",
  "metadata": {
    "path": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
    "name": "sunset.jpg",
    "description": "Art deco geometric pattern with gold accents",
    "tags": ["art-deco", "gold", "geometric"],
    "style": ["art-deco", "decorative"],
    "mood": ["luxurious", "elegant"],
    "era": "1920s"
  }
}
```

**示例：**

```bash
curl -X PATCH http://127.0.0.1:7890/api/item \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "filename": "sunset.jpg",
    "tags": ["art-deco", "gold"],
    "description": "Art deco pattern"
  }'
```

前端通过 Tauri 事件 `api:item-updated` 刷新卡片显示。

---

## AI 分析

### 触发方式

在导入图片时设置 `analyze=true`：

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@/path/to/image.jpg" \
  -F "analyze=true"
```

### 分析流程

1. 图片先完成导入（保存到 `images/` 目录）
2. API 立即返回响应（`analysis: null`）
3. 后台异步触发 AI 视觉分析
4. AI 分析完成后，通过 Tauri 事件通知前端更新

### 分析结果

AI 分析会自动生成以下元数据，存入 SQLite 搜索数据库：

- **description** -- 图片内容描述
- **tags** -- 关键词标签
- **styles** -- 风格分类（如 art-deco, minimalist, brutalist）
- **moods** -- 情绪描述（如 calm, energetic, dark）
- **colors** -- 主色调
- **era** -- 年代估计

### 前提

- Deco 设置中必须配置至少一个 AI Provider（OpenAI / Anthropic / Ollama / OpenRouter）
- Provider API key 在 `~/.deco/config.json` 中配置
- 如果未配置 Provider，`analyze=true` 不会报错但分析不会执行

---

## CLIP 搜索与聚类

Deco 使用 CLIP 模型（fastembed ONNX）为图片生成视觉语义向量。这些向量存储在项目的 SQLite 数据库中，用于视觉相似度搜索和自动聚类。

**首次使用须知：** CLIP 模型在首次调用时自动下载（约 150MB），后续调用使用缓存。

### POST /api/embed -- 单张图片 Embedding

为指定图片生成 CLIP embedding。如果该图片已有缓存的 embedding，直接返回缓存结果。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "imagePath": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `imagePath` | string | 是 | 图片文件的绝对路径 |

**响应：**

```json
{
  "imagePath": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
  "dimensions": 512,
  "embedding": [0.0234, -0.0891, 0.1456, ...]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `imagePath` | string | 图片路径 |
| `dimensions` | number | 向量维度（通常为 512） |
| `embedding` | float[] | CLIP 向量（float32 数组） |

**示例：**

```bash
curl -X POST http://127.0.0.1:7890/api/embed \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "imagePath": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg"
  }'
```

### POST /api/embed-batch -- 批量 Embedding

为多张图片或整个项目批量生成 CLIP embedding。已有 embedding 的图片会被跳过。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "imagePaths": [
    "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
    "/Users/you/Documents/Deco/art-deco/images/building.png"
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `imagePaths` | string[] | 否 | 要处理的图片路径列表。省略或传空数组则处理整个项目 |

**响应：**

```json
{
  "embedded": 2,
  "totalImages": 15
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `embedded` | number | 本次新生成的 embedding 数量 |
| `totalImages` | number | 请求涉及的总图片数 |

**示例：**

```bash
# 处理指定图片
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "imagePaths": [
      "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
      "/Users/you/Documents/Deco/art-deco/images/building.png"
    ]
  }'

# 处理整个项目（省略 imagePaths）
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco"}'
```

### POST /api/similar -- 视觉相似度搜索

根据一张参考图片，在项目中查找视觉上最相似的图片。使用 CLIP embedding 的余弦相似度排序。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "imagePath": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
  "limit": 5
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `imagePath` | string | 是 | 参考图片的绝对路径 |
| `limit` | number | 否 | 返回结果数量上限（默认 10） |

**响应：**

```json
{
  "query": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
  "results": [
    {
      "imagePath": "/Users/you/Documents/Deco/art-deco/images/golden-gate.jpg",
      "name": "golden-gate.jpg",
      "score": 0.892,
      "description": "Golden Gate Bridge at sunset",
      "tags": ["bridge", "sunset", "san-francisco"]
    },
    {
      "imagePath": "/Users/you/Documents/Deco/art-deco/images/horizon.jpg",
      "name": "horizon.jpg",
      "score": 0.756,
      "description": null,
      "tags": ["landscape", "sky"]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | string | 查询图片路径 |
| `results[].imagePath` | string | 匹配图片路径 |
| `results[].name` | string | 文件名 |
| `results[].score` | number | 相似度分数（0.0 - 1.0，越高越相似） |
| `results[].description` | string? | 图片描述（如有 AI 分析结果） |
| `results[].tags` | string[] | 标签列表 |

**示例：**

```bash
curl -X POST http://127.0.0.1:7890/api/similar \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "imagePath": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
    "limit": 5
  }'
```

**注意：** 如果参考图片尚未生成 embedding，会先自动生成，再执行相似度搜索。

### POST /api/search-semantic -- 文本语义搜索

使用自然语言文本搜索项目中的图片。基于 SQLite FTS5 全文搜索引擎，匹配图片的 description、tags、style、mood 等元数据字段。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "query": "golden sunset landscape",
  "limit": 10
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `query` | string | 是 | 搜索关键词（支持 FTS5 语法：词组、AND、OR、NOT） |
| `limit` | number | 否 | 返回结果数量上限（默认 10） |

**响应格式与 `/api/similar` 相同：**

```json
{
  "query": "golden sunset landscape",
  "results": [
    {
      "imagePath": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
      "name": "sunset.jpg",
      "score": 0.95,
      "description": "Golden sunset over mountain landscape",
      "tags": ["sunset", "landscape", "golden"]
    }
  ]
}
```

**FTS5 查询语法示例：**

| 查询 | 含义 |
|------|------|
| `sunset` | 包含 "sunset" 的图片 |
| `sunset landscape` | 同时包含两个词 |
| `"art deco"` | 精确词组匹配 |
| `sunset OR sunrise` | 包含任一词 |
| `sunset NOT beach` | 包含 sunset 但不含 beach |

**示例：**

```bash
curl -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "query": "geometric gold pattern",
    "limit": 10
  }'
```

**注意：** 文本搜索依赖图片已有的元数据。未经 AI 分析或手动标注的图片不会出现在搜索结果中。建议先通过 `/api/import` 的 `analyze=true` 或 `/api/item` 确保图片有元数据。

### POST /api/cluster -- 自动视觉聚类

根据 CLIP embedding 的余弦相似度自动将项目中的图片分组。使用贪心凝聚聚类算法（greedy agglomerative clustering）。

**请求：**

```json
{
  "projectPath": "/Users/you/Documents/Deco/art-deco",
  "threshold": 0.7
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectPath` | string | 是 | 项目目录绝对路径 |
| `threshold` | number | 否 | 余弦相似度阈值（0.0 - 1.0），默认 `0.7`。值越高分组越严格 |

**响应：**

```json
{
  "clusterCount": 3,
  "ungrouped": 5,
  "clusters": [
    {
      "id": 0,
      "size": 4,
      "images": [
        "/Users/you/Documents/Deco/art-deco/images/sunset1.jpg",
        "/Users/you/Documents/Deco/art-deco/images/sunset2.jpg",
        "/Users/you/Documents/Deco/art-deco/images/sunrise.jpg",
        "/Users/you/Documents/Deco/art-deco/images/horizon.jpg"
      ]
    },
    {
      "id": 1,
      "size": 3,
      "images": [
        "/Users/you/Documents/Deco/art-deco/images/building1.jpg",
        "/Users/you/Documents/Deco/art-deco/images/building2.jpg",
        "/Users/you/Documents/Deco/art-deco/images/skyscraper.jpg"
      ]
    },
    {
      "id": 2,
      "size": 2,
      "images": [
        "/Users/you/Documents/Deco/art-deco/images/pattern1.png",
        "/Users/you/Documents/Deco/art-deco/images/pattern2.png"
      ]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `clusterCount` | number | 包含 2+ 张图片的聚类数量 |
| `ungrouped` | number | 未归入任何聚类的单独图片数量 |
| `clusters[].id` | number | 聚类编号（从 0 开始） |
| `clusters[].size` | number | 聚类中的图片数量 |
| `clusters[].images` | string[] | 聚类中的图片路径列表 |

**聚类算法说明：**
1. 选取第一张未分配的图片作为种子
2. 将所有与种子余弦相似度 >= threshold 的图片归入同一组
3. 重复步骤 1-2 直到所有图片都被处理
4. 只包含 1 张图片的组计入 `ungrouped`，不出现在 `clusters` 数组中

**threshold 调参建议：**

| 阈值 | 效果 |
|------|------|
| 0.5 | 宽松分组，视觉上大致相关的图片会归为一类 |
| 0.7 | 默认值，平衡分组粒度 |
| 0.85 | 严格分组，只有非常相似的图片才归为一类 |
| 0.95 | 近似重复检测 |

**前提：** 项目中的图片必须已经生成 CLIP embedding。如果未生成，先调用 `/api/embed-batch` 处理整个项目。

**示例：**

```bash
curl -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "threshold": 0.7}'
```

---

## 画布控制

### Board State 格式

画布状态存储在 `{project}/.deco/board.json`，格式版本为 2。结构如下：

```json
{
  "version": 2,
  "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
  "items": [
    {
      "name": "sunset.jpg",
      "path": "/Users/you/Documents/Deco/art-deco/images/sunset.jpg",
      "x": 100,
      "y": 200,
      "width": 400,
      "height": 300
    }
  ],
  "textAnnotations": [
    {
      "id": "text-abc123",
      "text": "Color References",
      "x": 50,
      "y": 50,
      "fontSize": 24,
      "color": "#ffffff"
    }
  ],
  "shapeAnnotations": [
    {
      "id": "shape-def456",
      "shapeType": "rect",
      "x": 0,
      "y": 0,
      "width": 800,
      "height": 600,
      "color": "#333333"
    }
  ],
  "groups": [
    {
      "id": "group-ghi789",
      "name": "Sunset Collection",
      "members": ["sunset.jpg", "sunrise.jpg"]
    }
  ],
  "zOrder": ["shape-def456", "sunset.jpg", "sunrise.jpg", "text-abc123"]
}
```

### 通过 API 操作画布

目前 API 支持的画布操作：

| 操作 | 端点 | 说明 |
|------|------|------|
| 移动图片 | `POST /api/move` | 更新 `items` 中指定图片的 x/y 坐标 |
| 添加图片 | `POST /api/import` | 新图片自动添加到画布 |
| 删除图片 | `DELETE /api/delete` | 从画布和磁盘移除 |

文本标注、图形标注和分组目前只能通过 Deco 桌面端 UI 操作。

---

## 配置

### API 端口

默认端口 `7890`。可在 `~/.deco/config.json` 中通过 `apiPort` 字段修改：

```json
{
  "apiPort": 8080,
  "anthropicKey": "sk-ant-...",
  "openaiKey": "sk-...",
  "braveSearchKey": "BSA..."
}
```

修改后需重启 Deco 生效。

### 安全

- HTTP API 仅绑定 `127.0.0.1`（localhost），不接受远程连接
- 无需认证（本地可信环境）
- 如需从其他机器访问，可通过 SSH 隧道：`ssh user@machine -L 7890:127.0.0.1:7890`

### OpenClaw 配置建议

在 OpenClaw 操作面板中配置 Deco 连接：

| 配置项 | 值 |
|--------|------|
| Deco API 地址 | `http://127.0.0.1:7890` |
| 健康检查端点 | `GET /api/status` |
| 项目列表来源 | `~/.deco/recent.json` |
| 默认 AI 分析 | `true`（推荐，确保图片可搜索） |

---

## 错误处理

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 请求无效（缺少字段、格式错误、路径不存在） |
| 403 | 安全拒绝（路径遍历） |
| 404 | 资源不存在（文件、画布 item） |
| 500 | 服务器内部错误（磁盘满、权限不足、CLIP 模型加载失败） |

### 错误响应格式

所有错误响应包含 JSON body：

```json
{
  "error": "具体错误信息"
}
```

### 常见错误与处理

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `Missing required field: project_path` | import 请求缺少 `project_path` 字段 | 确保 multipart 中包含该字段 |
| `Project path does not exist or is not a directory` | 项目路径无效 | 检查路径是否正确，项目是否已创建 |
| `File not found: xxx.jpg` | delete 的文件不存在 | 检查文件名拼写和是否已被删除 |
| `Either 'file' or 'url' field is required` | import 既没有文件也没有 URL | 必须提供 `file` 或 `url` 其一 |
| `Download failed: HTTP 404` | URL 下载失败 | 检查 URL 是否可访问 |
| `Embedding not found after generation` | CLIP embedding 生成失败 | 检查图片格式是否支持，查看 Deco 日志 |
| `Board state not found` | 项目没有 board.json | 在 Deco 中先打开该项目 |

### 重试建议

- 网络相关错误（URL 下载）：重试 2-3 次，间隔 1 秒
- CLIP 模型首次加载超时：等待 30 秒后重试（模型下载中）
- 其他 500 错误：查看 `~/.deco/debug.log` 获取详细日志

---

## 端到端工作流示例

以下是一个完整的 OpenClaw agent 控制 Deco 的工作流。

### 场景：收集参考图片 -> AI 分析 -> 搜索整理

```bash
# 1. 检查 Deco 是否在线
curl -s http://127.0.0.1:7890/api/status | jq .status
# "ok"

# 2. 发现可用项目（读取 recent.json）
cat ~/.deco/recent.json | jq '.[].name'
# "Art Deco"
# "Cyberpunk"

# 3. 选择目标项目
PROJECT="/Users/you/Documents/Deco/art-deco"

# 4. 导入多张参考图片（带 AI 分析）
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "url=https://example.com/ref1.jpg" \
  -F "analyze=true"

curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "url=https://example.com/ref2.jpg" \
  -F "analyze=true"

curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "url=https://example.com/ref3.jpg" \
  -F "analyze=true"

# 5. 等待 AI 分析完成（通常几秒）
sleep 5

# 6. 确保所有图片都有 CLIP embedding
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}"
# {"embedded": 3, "totalImages": 15}

# 7. 文本搜索：查找所有包含 "geometric" 的图片
curl -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"query\": \"geometric pattern\", \"limit\": 5}"

# 8. 视觉搜索：找到与某张图片视觉相似的图片
curl -X POST http://127.0.0.1:7890/api/similar \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT\",
    \"imagePath\": \"$PROJECT/images/ref1.jpg\",
    \"limit\": 5
  }"

# 9. 自动聚类：按视觉相似度分组
curl -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.7}"
# {"clusterCount": 3, "ungrouped": 2, "clusters": [...]}

# 10. 根据聚类结果，给每组图片批量打标签
curl -X PATCH http://127.0.0.1:7890/api/item \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT\",
    \"filename\": \"ref1.jpg\",
    \"tags\": [\"geometric\", \"cluster-0\"],
    \"styles\": [\"art-deco\"]
  }"

# 11. 整理画布布局：把同组图片移到相邻位置
curl -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"ref1.jpg\", \"x\": 0, \"y\": 0}"

curl -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"ref2.jpg\", \"x\": 450, \"y\": 0}"

# 12. 清理不需要的图片
curl -X DELETE http://127.0.0.1:7890/api/delete \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"unwanted.jpg\"}"
```

### 批量导入最佳实践

- 顺序导入（不要并行），每次间隔 100ms，确保稳定性
- 大批量导入时可先不开 `analyze=true`，全部导入后再手动触发 AI 分析
- 监控磁盘空间，大量高分辨率图片会快速消耗存储
- 导入完成后调用 `/api/embed-batch` 确保所有图片可搜索

---

## 附录

### 支持的图片格式

| 格式 | 扩展名 | MIME Type |
|------|--------|-----------|
| PNG | `.png` | `image/png` |
| JPEG | `.jpg`, `.jpeg` | `image/jpeg` |
| GIF | `.gif` | `image/gif` |
| WebP | `.webp` | `image/webp` |
| SVG | `.svg` | `image/svg+xml` |
| BMP | `.bmp` | `image/bmp` |
| AVIF | `.avif` | `image/avif` |
| TIFF | `.tiff` | -- |

URL 下载时的格式检测优先级：`Content-Type` 头 > URL 扩展名 > 默认 JPEG

文件上传时的格式检测优先级：文件名扩展名 > `Content-Type` 头 > 默认 PNG

### 前端事件参考

API 操作会触发 Tauri 事件通知 Deco 前端实时更新，OpenClaw 无需关心这些事件，仅供了解：

| 事件名 | 触发时机 | 载荷 |
|--------|----------|------|
| `api:image-imported` | 图片导入成功 | `{ image, position }` |
| `api:image-deleted` | 图片删除成功 | `{ filename, project }` |
| `api:item-moved` | 图片位置更新 | `{ filename, x, y }` |
| `api:item-updated` | 元数据更新 | `{ filename, metadata }` |
| `api:analyze-request` | AI 分析请求 | 图片路径字符串 |

### 日志

Deco 日志位于 `~/.deco/debug.log`，API 相关日志标记为 `[API]`。排查问题时可实时查看：

```bash
tail -f ~/.deco/debug.log | grep API
```
