# OpenClaw x Deco 使用手册

面向 OpenClaw agent 开发者的实用指南。本手册以任务为导向，帮助你快速通过 HTTP API 操控 Deco 项目。

> **完整参数说明和响应格式请参考** [openclaw-integration.md](./openclaw-integration.md)
>
> **API 扩展规划和架构设计请参考** [openclaw-deep-integration.md](./openclaw-deep-integration.md)

---

## 目录

1. [快速开始](#1-快速开始)
2. [核心工作流](#2-核心工作流)
   - [项目管理](#a-项目管理)
   - [图片导入](#b-图片导入)
   - [图片管理](#c-图片管理)
   - [AI 分析](#d-ai-分析)
   - [搜索与发现](#e-搜索与发现)
   - [画布操作](#f-画布操作)
3. [实战范例](#3-实战范例)
4. [API 速查表](#4-api-速查表)
5. [常见问题](#5-常见问题)

---

## 1. 快速开始

### 前提条件

- Deco 桌面端必须正在运行（API 随应用启动自动开启）
- 默认地址：`http://127.0.0.1:7890`
- 所有请求均为 localhost，无需认证

### 健康检查

确认 Deco 在线：

```bash
curl -s http://127.0.0.1:7890/api/status | jq .
```

预期响应：

```json
{
  "status": "ok",
  "version": "2.0.0",
  "port": 7890
}
```

如果连接失败，参考 [常见问题](#连接被拒绝) 章节。

### 第一个 API 调用

获取所有项目列表，确认 API 工作正常：

```bash
curl -s http://127.0.0.1:7890/api/projects | jq '.[].name'
```

输出示例：

```
"Art Deco"
"Cyberpunk"
"Minimalism"
```

拿到项目路径后，就可以开始导入、搜索、整理图片了。

---

## 2. 核心工作流

### a) 项目管理

#### 列出所有项目

```bash
curl -s http://127.0.0.1:7890/api/projects | jq .
```

返回数组，每个项目包含 `name`、`path`、`imageCount`。后续所有操作都需要用 `path` 来指定目标项目。

#### 选择项目

典型的 agent 流程：

```bash
# 保存项目路径到变量，后续复用
PROJECT=$(curl -s http://127.0.0.1:7890/api/projects | jq -r '.[0].path')
echo "使用项目: $PROJECT"
```

如果用户有多个项目，应展示列表让用户选择，而不是自动取第一个。

#### 离线读取项目列表

不启动 Deco 也能读取项目信息：

```bash
cat ~/.deco/recent.json | jq '.[].name'
```

> 注意：离线方式不包含 `imageCount`，且可能包含已删除的项目。优先使用 HTTP API。

#### 创建新项目（计划中）

`POST /api/projects` 端点尚未实现，目前需要在 Deco UI 中手动创建项目。参见 [deep-integration.md](./openclaw-deep-integration.md) 的 Tier 1 路线图。

---

### b) 图片导入

使用 `POST /api/import`，支持本地文件上传和 URL 下载两种方式。请求格式为 `multipart/form-data`。

#### 上传本地文件

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "file=@/path/to/photo.jpg"
```

#### 从 URL 导入

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "url=https://example.com/reference.jpg"
```

#### 导入并触发 AI 分析

添加 `analyze=true`，导入后自动进行 AI 视觉分析（异步执行，不阻塞响应）：

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "url=https://example.com/building.jpg" \
  -F "analyze=true"
```

#### 导入到指定画布位置

通过 `position` 参数指定放置坐标：

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "file=@/path/to/image.png" \
  -F 'position={"x": 200, "y": 150}'
```

#### 批量导入最佳实践

批量导入时遵循以下原则：

1. **顺序执行**，每次间隔 100-200ms，不要并发请求
2. **大批量时先不分析**，全部导入后再调用 `/api/embed-batch` 生成 embedding
3. **监控响应**，如果出现错误立即停止，不要盲目继续

```bash
# 批量导入 URL 列表
URLS=(
  "https://example.com/ref1.jpg"
  "https://example.com/ref2.jpg"
  "https://example.com/ref3.jpg"
)

for url in "${URLS[@]}"; do
  echo "导入: $url"
  curl -s -X POST http://127.0.0.1:7890/api/import \
    -F "project_path=$PROJECT" \
    -F "url=$url" | jq .filename
  sleep 0.2
done

# 导入完成后，一次性生成所有 embedding
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}"
```

**支持的图片格式：** PNG, JPEG, GIF, WebP, SVG, BMP, AVIF, TIFF

---

### c) 图片管理

#### 删除图片

完整清理：删除原始文件、缩略图、数据库记录和 CLIP embedding。

```bash
curl -X DELETE http://127.0.0.1:7890/api/delete \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"unwanted.jpg\"}"
```

> 删除操作不可撤销。`filename` 只接受文件名（如 `photo.jpg`），不接受路径，且禁止包含 `..`。

#### 移动图片位置

修改图片在画布上的坐标：

```bash
curl -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"sunset.jpg\", \"x\": 500, \"y\": 300}"
```

#### 更新元数据

修改标签、描述、风格等信息。只传需要修改的字段，其余保持不变：

```bash
curl -X PATCH http://127.0.0.1:7890/api/item \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "'"$PROJECT"'",
    "filename": "building.jpg",
    "tags": ["brutalist", "concrete", "urban"],
    "description": "Brutalist concrete apartment block",
    "styles": ["brutalist"],
    "moods": ["imposing", "raw"]
  }'
```

可更新的字段：`title`、`description`、`tags`、`styles`、`moods`、`era`、`artist`。

---

### d) AI 分析

#### 触发方式

目前 AI 分析通过导入时设置 `analyze=true` 触发：

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "file=@/path/to/image.jpg" \
  -F "analyze=true"
```

分析异步执行，API 响应中 `analysis` 字段始终为 `null`。结果通过 Tauri 事件通知前端，agent 无法直接收到完成通知。

#### 分析结果包含哪些字段

AI 分析完成后，以下字段会自动写入 SQLite 数据库：

| 字段 | 说明 | 示例 |
|------|------|------|
| `description` | 图片内容描述 | "Art deco geometric pattern with gold accents" |
| `tags` | 关键词标签 | ["geometric", "gold", "pattern"] |
| `styles` | 风格分类 | ["art-deco", "decorative"] |
| `moods` | 情绪描述 | ["luxurious", "elegant"] |
| `colors` | 主色调 | ["gold", "black", "cream"] |
| `era` | 年代估计 | "1920s" |

这些字段写入后可通过 `/api/search-semantic` 进行文本搜索。

#### Provider 要求

- Deco 设置中必须配置至少一个 AI Provider（OpenAI / Anthropic / Ollama / OpenRouter）
- API key 存储在 `~/.deco/config.json`
- 未配置 Provider 时，`analyze=true` 不报错但分析不会执行

#### 确认分析是否完成

由于分析是异步的，agent 可以通过搜索间接验证：

```bash
# 导入并分析
curl -s -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=$PROJECT" \
  -F "file=@/path/to/image.jpg" \
  -F "analyze=true"

# 等待几秒
sleep 5

# 搜索该图片的描述，如果有结果说明分析完成
curl -s -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"query\": \"image.jpg\", \"limit\": 1}" | jq '.results[0].description'
```

---

### e) 搜索与发现

Deco 提供两种搜索方式：基于文本元数据的 FTS5 搜索，和基于 CLIP 向量的视觉相似度搜索。

#### 文本搜索（FTS5）

搜索图片的 description、tags、styles、moods 等元数据：

```bash
curl -s -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"query\": \"geometric gold pattern\", \"limit\": 10}" | jq .
```

FTS5 支持高级查询语法：

| 查询 | 含义 |
|------|------|
| `sunset` | 包含 "sunset" |
| `sunset landscape` | 同时包含两个词 |
| `"art deco"` | 精确词组匹配 |
| `sunset OR sunrise` | 包含任一词 |
| `sunset NOT beach` | 包含 sunset 但不含 beach |

> 前提：图片必须已有元数据（通过 AI 分析或手动 `PATCH /api/item` 添加）。未分析的图片不会出现在搜索结果中。

#### 视觉相似度搜索

基于 CLIP embedding 的余弦相似度，找到视觉上最相似的图片：

```bash
curl -s -X POST http://127.0.0.1:7890/api/similar \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT\",
    \"imagePath\": \"$PROJECT/images/reference.jpg\",
    \"limit\": 5
  }" | jq '.results[] | {name, score}'
```

返回结果按 `score` 降序排列（0.0-1.0，越高越相似）。如果参考图片没有 embedding，会自动生成。

#### 自动聚类

按视觉相似度将图片自动分组：

```bash
curl -s -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.7}" | jq .
```

`threshold` 参数控制分组严格程度：

| 阈值 | 效果 |
|------|------|
| 0.5 | 宽松 -- 大致相关的图片归为一类 |
| 0.7 | 默认 -- 平衡分组粒度 |
| 0.85 | 严格 -- 只有高度相似的图片才归组 |
| 0.95 | 近似重复检测 |

> 前提：项目中的图片必须已有 CLIP embedding。先调用 `/api/embed-batch` 处理整个项目。

#### 生成 CLIP Embedding

单张图片：

```bash
curl -X POST http://127.0.0.1:7890/api/embed \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT\",
    \"imagePath\": \"$PROJECT/images/photo.jpg\"
  }"
```

整个项目（已有 embedding 的图片自动跳过）：

```bash
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}"
```

> CLIP 模型首次调用会自动下载（约 150MB），后续使用缓存。首次加载可能需要 10-30 秒。

---

### f) 画布操作

#### board.json 格式概览

画布状态存储在 `{project}/.deco/board.json`，包含以下结构：

```json
{
  "version": 2,
  "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
  "items": [
    { "name": "sunset.jpg", "path": "/full/path/images/sunset.jpg", "x": 100, "y": 200, "width": 400, "height": 300 }
  ],
  "textAnnotations": [ ... ],
  "shapeAnnotations": [ ... ],
  "groups": [ ... ],
  "zOrder": [ ... ]
}
```

#### API 可控操作

| 操作 | 端点 | 说明 |
|------|------|------|
| 移动图片 | `POST /api/move` | 更新 x/y 坐标 |
| 添加图片 | `POST /api/import` | 自动添加到画布 |
| 删除图片 | `DELETE /api/delete` | 从画布和磁盘移除 |

文本标注、图形标注和分组目前只能通过 Deco UI 操作。

#### 网格布局策略

将图片按网格排列的常见模式：

```bash
# 假设每张图片卡片宽 420px，间距 30px
COL_WIDTH=450
ROW_HEIGHT=350
COLS=4
i=0

# 获取项目中的所有图片文件名（从 board.json）
ITEMS=$(cat "$PROJECT/.deco/board.json" | jq -r '.items[].name')

for name in $ITEMS; do
  col=$((i % COLS))
  row=$((i / COLS))
  x=$((col * COL_WIDTH))
  y=$((row * ROW_HEIGHT))

  curl -s -X POST http://127.0.0.1:7890/api/move \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$name\", \"x\": $x, \"y\": $y}"

  i=$((i + 1))
  sleep 0.05
done
```

#### 按聚类结果布局

先聚类，再把每组图片放到画布的不同区域：

```bash
# 1. 聚类
CLUSTERS=$(curl -s -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.7}")

# 2. 每个 cluster 一行，cluster 之间间隔 100px
CLUSTER_Y=0
echo "$CLUSTERS" | jq -c '.clusters[]' | while read cluster; do
  X=0
  echo "$cluster" | jq -r '.images[]' | while read img; do
    FILENAME=$(basename "$img")
    curl -s -X POST http://127.0.0.1:7890/api/move \
      -H "Content-Type: application/json" \
      -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$FILENAME\", \"x\": $X, \"y\": $CLUSTER_Y}"
    X=$((X + 450))
  done
  CLUSTER_Y=$((CLUSTER_Y + 400))
done
```

---

## 3. 实战范例

以下脚本可直接复制运行，只需修改 `PROJECT` 变量。

### 范例 1: 批量导入 10 个 URL 并分析

```bash
#!/bin/bash
PROJECT="/Users/you/Documents/Deco/my-project"
BASE_URL="http://127.0.0.1:7890"

# 检查 Deco 是否在线
STATUS=$(curl -s "$BASE_URL/api/status" | jq -r '.status' 2>/dev/null)
if [ "$STATUS" != "ok" ]; then
  echo "Deco 未运行，请先启动 Deco"
  exit 1
fi

# URL 列表
URLS=(
  "https://example.com/ref1.jpg"
  "https://example.com/ref2.jpg"
  "https://example.com/ref3.jpg"
  "https://example.com/ref4.jpg"
  "https://example.com/ref5.jpg"
  "https://example.com/ref6.jpg"
  "https://example.com/ref7.jpg"
  "https://example.com/ref8.jpg"
  "https://example.com/ref9.jpg"
  "https://example.com/ref10.jpg"
)

# 逐个导入（带 AI 分析）
for url in "${URLS[@]}"; do
  RESULT=$(curl -s -X POST "$BASE_URL/api/import" \
    -F "project_path=$PROJECT" \
    -F "url=$url" \
    -F "analyze=true")
  FILENAME=$(echo "$RESULT" | jq -r '.filename')
  echo "已导入: $FILENAME"
  sleep 0.2
done

# 等待 AI 分析完成
echo "等待 AI 分析..."
sleep 10

# 确保所有图片都有 CLIP embedding
curl -s -X POST "$BASE_URL/api/embed-batch" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}" | jq .

echo "完成！共导入 ${#URLS[@]} 张图片"
```

### 范例 2: 查找并删除重复图片

```bash
#!/bin/bash
PROJECT="/Users/you/Documents/Deco/my-project"
BASE_URL="http://127.0.0.1:7890"

# 1. 确保所有图片有 embedding
echo "生成 CLIP embedding..."
curl -s -X POST "$BASE_URL/api/embed-batch" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}" | jq .

# 2. 用高阈值聚类 -- 检测近似重复
echo "检测重复图片 (threshold=0.95)..."
DUPES=$(curl -s -X POST "$BASE_URL/api/cluster" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.95}")

CLUSTER_COUNT=$(echo "$DUPES" | jq '.clusterCount')
echo "发现 $CLUSTER_COUNT 组重复"

if [ "$CLUSTER_COUNT" -eq 0 ]; then
  echo "没有重复图片"
  exit 0
fi

# 3. 每组保留第一张，删除其余
echo "$DUPES" | jq -c '.clusters[]' | while read cluster; do
  KEEP=$(echo "$cluster" | jq -r '.images[0]')
  echo "保留: $(basename $KEEP)"

  echo "$cluster" | jq -r '.images[1:][]' | while read dupe; do
    FILENAME=$(basename "$dupe")
    echo "  删除: $FILENAME"
    curl -s -X DELETE "$BASE_URL/api/delete" \
      -H "Content-Type: application/json" \
      -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$FILENAME\"}" | jq -r '.message'
  done
done
```

### 范例 3: 按主题搜索并整理

```bash
#!/bin/bash
PROJECT="/Users/you/Documents/Deco/my-project"
BASE_URL="http://127.0.0.1:7890"

# 搜索特定主题的图片
THEME="geometric gold"
echo "搜索主题: $THEME"

RESULTS=$(curl -s -X POST "$BASE_URL/api/search-semantic" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"query\": \"$THEME\", \"limit\": 20}")

COUNT=$(echo "$RESULTS" | jq '.results | length')
echo "找到 $COUNT 张匹配图片"

# 将匹配图片排成一行
X=0
echo "$RESULTS" | jq -r '.results[].name' | while read name; do
  curl -s -X POST "$BASE_URL/api/move" \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$name\", \"x\": $X, \"y\": 0}"
  X=$((X + 450))

  # 顺便打上主题标签
  curl -s -X PATCH "$BASE_URL/api/item" \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$name\", \"tags\": [\"theme:geometric-gold\"]}"
done

echo "整理完成"
```

### 范例 4: 导出所有图片元数据

```bash
#!/bin/bash
PROJECT="/Users/you/Documents/Deco/my-project"
BASE_URL="http://127.0.0.1:7890"
OUTPUT="/tmp/deco-metadata-export.json"

# 获取项目中所有图片的元数据
# 方法：搜索空字符串，设置较大 limit
METADATA=$(curl -s -X POST "$BASE_URL/api/search-semantic" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"query\": \"*\", \"limit\": 1000}")

echo "$METADATA" | jq '.results' > "$OUTPUT"

COUNT=$(echo "$METADATA" | jq '.results | length')
echo "已导出 $COUNT 张图片的元数据到 $OUTPUT"

# 汇总统计
echo "--- 统计 ---"
echo "标签分布:"
cat "$OUTPUT" | jq -r '.[].tags[]?' | sort | uniq -c | sort -rn | head -20
```

### 范例 5: 按视觉聚类自动排版

```bash
#!/bin/bash
PROJECT="/Users/you/Documents/Deco/my-project"
BASE_URL="http://127.0.0.1:7890"

# 配置
COL_GAP=450        # 同组图片水平间距
ROW_GAP=400        # 组间垂直间距
LABEL_OFFSET=-40   # 组标签 Y 偏移

# 1. 生成 embedding（如已有则跳过）
echo "准备 CLIP embedding..."
curl -s -X POST "$BASE_URL/api/embed-batch" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}" | jq '{embedded, totalImages}'

# 2. 聚类
echo "执行视觉聚类..."
CLUSTERS=$(curl -s -X POST "$BASE_URL/api/cluster" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.72}")

CLUSTER_COUNT=$(echo "$CLUSTERS" | jq '.clusterCount')
UNGROUPED=$(echo "$CLUSTERS" | jq '.ungrouped')
echo "聚类结果: $CLUSTER_COUNT 组, $UNGROUPED 张未分组"

# 3. 按组排列到画布上
Y=0
echo "$CLUSTERS" | jq -c '.clusters[]' | while read cluster; do
  SIZE=$(echo "$cluster" | jq '.size')
  echo "排列聚类 (${SIZE} 张图片) 到 Y=$Y"

  X=0
  echo "$cluster" | jq -r '.images[]' | while read img; do
    FILENAME=$(basename "$img")
    curl -s -X POST "$BASE_URL/api/move" \
      -H "Content-Type: application/json" \
      -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$FILENAME\", \"x\": $X, \"y\": $Y}" > /dev/null
    X=$((X + COL_GAP))
  done

  Y=$((Y + ROW_GAP))
done

echo "排版完成"
```

---

## 4. API 速查表

| 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|----------|
| `GET` | `/api/status` | 健康检查 | -- |
| `GET` | `/api/projects` | 列出所有项目 | -- |
| `POST` | `/api/import` | 导入图片 | `project_path`, `file` / `url`, `analyze`, `position` |
| `DELETE` | `/api/delete` | 删除图片 | `projectPath`, `filename` |
| `POST` | `/api/move` | 移动画布位置 | `projectPath`, `filename`, `x`, `y` |
| `PATCH` | `/api/item` | 更新元数据 | `projectPath`, `filename`, `tags`, `description`, ... |
| `POST` | `/api/embed` | 单张 CLIP embedding | `projectPath`, `imagePath` |
| `POST` | `/api/embed-batch` | 批量 CLIP embedding | `projectPath`, `imagePaths`(可选) |
| `POST` | `/api/similar` | 视觉相似搜索 | `projectPath`, `imagePath`, `limit` |
| `POST` | `/api/search-semantic` | 文本语义搜索 | `projectPath`, `query`, `limit` |
| `POST` | `/api/cluster` | 自动视觉聚类 | `projectPath`, `threshold` |

**注意事项：**

- `/api/import` 使用 `multipart/form-data` 格式，参数名为 `project_path`（下划线）
- 其余端点使用 `application/json` 格式，参数名为 `projectPath`（驼峰）
- 完整参数说明和响应格式请参考 [openclaw-integration.md](./openclaw-integration.md)

---

## 5. 常见问题

### 连接被拒绝

**症状：** `curl: (7) Failed to connect to 127.0.0.1 port 7890`

**原因：** Deco 桌面端未运行。

**解决：**
1. 启动 Deco 应用
2. 确认端口：`lsof -i :7890`
3. 检查是否自定义了端口：查看 `~/.deco/config.json` 中的 `apiPort` 字段

### 搜索结果为空

**症状：** `/api/search-semantic` 返回空的 `results` 数组。

**原因：** 图片尚未被 AI 分析，没有元数据（description、tags 等）可供搜索。

**解决：**
1. 重新导入图片时加上 `analyze=true`
2. 或手动通过 `PATCH /api/item` 添加标签和描述
3. 确认 Deco 中已配置 AI Provider

### 视觉搜索/聚类无结果

**症状：** `/api/similar` 或 `/api/cluster` 返回空结果。

**原因：** 图片没有 CLIP embedding。

**解决：**

```bash
# 为整个项目生成 embedding
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}"
```

### CLIP 首次调用很慢

**症状：** 第一次调用 `/api/embed` 需要 10-30 秒才返回。

**原因：** CLIP 模型需要首次下载（约 150MB）并加载到内存。

**解决：** 这是正常现象，后续调用会使用缓存模型。如果超时，等待 30 秒后重试。

### 项目路径无效

**症状：** `"Project path does not exist or is not a directory"`

**解决：**
1. 确认路径是绝对路径（不要用 `~`，要展开为完整路径）
2. 用 `GET /api/projects` 获取正确的项目路径
3. 确认项目目录仍然存在

### 常见错误码

| HTTP 状态码 | 含义 | 常见场景 |
|-------------|------|----------|
| 400 | 请求无效 | 缺少必填字段、路径不存在 |
| 403 | 安全拒绝 | filename 包含 `..`（路径遍历） |
| 404 | 资源不存在 | 文件已删除、board.json 未创建 |
| 500 | 服务器错误 | 磁盘满、权限不足、CLIP 加载失败 |

### 调试日志

查看 Deco 的 API 日志：

```bash
tail -f ~/.deco/debug.log | grep API
```

### 重试策略

| 错误类型 | 建议 |
|----------|------|
| URL 下载失败 | 重试 2-3 次，间隔 1 秒 |
| CLIP 模型加载超时 | 等待 30 秒后重试 |
| 其他 500 错误 | 查看 `~/.deco/debug.log` 排查 |
