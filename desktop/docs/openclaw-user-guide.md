# OpenClaw x Deco 对话式用户指南

通过自然语言和 Deco 对话，像聊天一样管理你的视觉参考库。

本指南展示 OpenClaw 如何将用户的自然语言请求翻译为 Deco HTTP API 调用，并用友好的方式回复结果。

> **API 完整参考:** [openclaw-integration.md](./openclaw-integration.md)
>
> **任务导向使用手册:** [openclaw-usage-guide.md](./openclaw-usage-guide.md)

---

## 目录

1. [快速开始](#快速开始)
2. [对话场景示例](#对话场景示例)
3. [API 速查表](#api-速查表)
4. [常见问题](#常见问题)

---

## 快速开始

### Deco 是什么？

Deco 是一个 AI 驱动的视觉参考收集器 + Moodboard 工具。你可以把它理解为一块无限大的画布，上面贴满了你收集的参考图片。它能用 AI 自动分析图片内容、打标签，还能通过 CLIP 模型做视觉相似度搜索。

### OpenClaw 怎么和 Deco 配合？

Deco 启动后会在本地开一个 HTTP API 服务（默认 `http://127.0.0.1:7890`）。OpenClaw 作为你的 AI 助手，把你说的话翻译成 API 调用，帮你完成各种操作。你不需要记任何命令，像平时聊天一样说就行。

### 一句话健康检查

在开始之前，先确认 Deco 正在运行：

```bash
curl -s http://127.0.0.1:7890/api/status
```

看到这个就说明一切就绪：

```json
{ "status": "ok", "version": "2.0.0", "port": 7890 }
```

如果连接失败，请先打开 Deco 桌面应用。

---

## 对话场景示例

以下每个场景都展示一段完整的对话流程：用户说了什么，OpenClaw 做了什么，最后怎么回复用户。

---

### 场景 1: "帮我看看有哪些项目"

> **用户:** 帮我看看有哪些项目

**OpenClaw 执行:**

```bash
curl -s http://127.0.0.1:7890/api/projects
```

**API 返回:**

```json
[
  { "name": "Art Deco", "path": "/Users/you/Documents/Deco/art-deco", "imageCount": 38 },
  { "name": "Cyberpunk", "path": "/Users/you/Documents/Deco/cyberpunk", "imageCount": 12 },
  { "name": "Minimalism", "path": "/Users/you/Documents/Deco/minimalism", "imageCount": 5 }
]
```

> **OpenClaw:** 你现在有 3 个项目：
>
> 1. **Art Deco** -- 38 张图片
> 2. **Cyberpunk** -- 12 张图片
> 3. **Minimalism** -- 5 张图片
>
> 要操作哪个项目？

---

### 场景 2: "把这张图片加到 Art Deco 项目"

> **用户:** 把桌面上的 golden-pattern.jpg 加到 Art Deco 项目

**OpenClaw 执行:**

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@/Users/you/Desktop/golden-pattern.jpg"
```

**API 返回:**

```json
{
  "id": "golden-pattern.jpg",
  "filename": "golden-pattern.jpg",
  "path": "/Users/you/Documents/Deco/art-deco/images/golden-pattern.jpg",
  "position": { "x": 0, "y": 0 },
  "analysis": null
}
```

> **OpenClaw:** 已经把 golden-pattern.jpg 导入到 Art Deco 项目了，图片已经出现在画布上。需要我帮你 AI 分析一下这张图吗？

---

### 场景 3: "从这个网址导入图片"

> **用户:** 帮我从 https://example.com/ref/art-deco-ceiling.jpg 导入一张图到 Art Deco 项目

**OpenClaw 执行:**

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "url=https://example.com/ref/art-deco-ceiling.jpg"
```

**API 返回:**

```json
{
  "id": "art-deco-ceiling.jpg",
  "filename": "art-deco-ceiling.jpg",
  "path": "/Users/you/Documents/Deco/art-deco/images/art-deco-ceiling.jpg",
  "position": { "x": 0, "y": 0 },
  "analysis": null
}
```

> **OpenClaw:** 图片下载成功，已导入 art-deco-ceiling.jpg 到 Art Deco 项目。你可以在 Deco 画布上看到它了。

---

### 场景 4: "帮我分析这张图片"

> **用户:** 帮我分析一下刚才导入的那张天花板图片，看看它是什么风格

**OpenClaw 执行:**

```bash
# 重新导入并开启 AI 分析（针对已有图片，也可通过导入触发分析）
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@/Users/you/Documents/Deco/art-deco/images/art-deco-ceiling.jpg" \
  -F "analyze=true"
```

分析是异步的，等待几秒后验证结果：

```bash
# 等待 AI 分析完成
sleep 5

# 通过搜索确认分析结果已写入
curl -s -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "query": "art-deco-ceiling",
    "limit": 1
  }'
```

**搜索返回:**

```json
{
  "query": "art-deco-ceiling",
  "results": [
    {
      "imagePath": "/Users/you/Documents/Deco/art-deco/images/art-deco-ceiling.jpg",
      "name": "art-deco-ceiling.jpg",
      "score": 0.98,
      "description": "Ornate Art Deco ceiling with geometric patterns, gold leaf detailing, and radiating sunburst motifs",
      "tags": ["art-deco", "ceiling", "gold", "geometric", "sunburst", "ornamental"]
    }
  ]
}
```

> **OpenClaw:** AI 分析完成了！这张图是一个装饰性 Art Deco 风格的天花板，有这些特点：
>
> - **内容:** 几何图案的华丽天花板，配有金箔装饰和放射状太阳图案
> - **风格标签:** art-deco, ceiling, gold, geometric, sunburst, ornamental
>
> 这些标签已经自动保存，之后你可以通过搜索找到它。

---

### 场景 5: "搜索所有金色几何图案"

> **用户:** 帮我在 Art Deco 项目里搜一下所有金色几何图案的图片

**OpenClaw 执行:**

```bash
curl -s -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "query": "gold geometric pattern",
    "limit": 10
  }'
```

**API 返回:**

```json
{
  "query": "gold geometric pattern",
  "results": [
    {
      "name": "golden-pattern.jpg",
      "score": 0.95,
      "description": "Repeating geometric pattern with gold accents on dark background",
      "tags": ["geometric", "gold", "pattern", "art-deco"]
    },
    {
      "name": "art-deco-ceiling.jpg",
      "score": 0.88,
      "description": "Ornate Art Deco ceiling with geometric patterns and gold leaf",
      "tags": ["art-deco", "ceiling", "gold", "geometric"]
    },
    {
      "name": "gatsby-border.png",
      "score": 0.76,
      "description": "Art deco border design with gold chevrons",
      "tags": ["border", "gold", "chevron", "decorative"]
    }
  ]
}
```

> **OpenClaw:** 找到 3 张金色几何图案的图片：
>
> 1. **golden-pattern.jpg** (匹配度 95%) -- 深色背景上的重复几何金色图案
> 2. **art-deco-ceiling.jpg** (匹配度 88%) -- 带金箔的 Art Deco 几何天花板
> 3. **gatsby-border.png** (匹配度 76%) -- 金色人字纹的装饰边框
>
> 需要我对这些图做进一步操作吗？比如移到一起，或者打上统一标签。

---

### 场景 6: "找一些跟这张类似的图"

> **用户:** golden-pattern.jpg 这张我很喜欢，帮我找一些跟它视觉上相似的图片

**OpenClaw 执行:**

```bash
curl -s -X POST http://127.0.0.1:7890/api/similar \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "imagePath": "/Users/you/Documents/Deco/art-deco/images/golden-pattern.jpg",
    "limit": 5
  }'
```

**API 返回:**

```json
{
  "query": "/Users/you/Documents/Deco/art-deco/images/golden-pattern.jpg",
  "results": [
    {
      "name": "gatsby-border.png",
      "score": 0.892,
      "description": "Art deco border design with gold chevrons",
      "tags": ["border", "gold", "chevron"]
    },
    {
      "name": "art-deco-ceiling.jpg",
      "score": 0.845,
      "description": "Ornate Art Deco ceiling with geometric patterns",
      "tags": ["ceiling", "gold", "geometric"]
    },
    {
      "name": "tile-mosaic.jpg",
      "score": 0.721,
      "description": "Mosaic tile floor with geometric design",
      "tags": ["mosaic", "tile", "geometric"]
    }
  ]
}
```

> **OpenClaw:** 根据 golden-pattern.jpg 的视觉特征，找到 3 张相似的图片：
>
> 1. **gatsby-border.png** (相似度 89%) -- 金色人字纹边框，风格非常接近
> 2. **art-deco-ceiling.jpg** (相似度 85%) -- 几何天花板，有类似的金色调
> 3. **tile-mosaic.jpg** (相似度 72%) -- 几何拼贴地砖，图案结构有相似之处
>
> 这个搜索是基于 CLIP 视觉向量的，不依赖标签，所以哪怕图片还没被 AI 分析过也能找到。

---

### 场景 7: "帮我自动整理画板"

> **用户:** 我的 Art Deco 项目图片太乱了，帮我按视觉相似度自动分组整理一下

**OpenClaw 执行:**

第一步：确保所有图片都有 CLIP embedding。

```bash
curl -s -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco"}'
```

第二步：执行视觉聚类。

```bash
curl -s -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "threshold": 0.7}'
```

**聚类返回:**

```json
{
  "clusterCount": 3,
  "ungrouped": 5,
  "clusters": [
    { "id": 0, "size": 4, "images": [".../golden-pattern.jpg", ".../gatsby-border.png", ".../art-deco-ceiling.jpg", ".../tile-mosaic.jpg"] },
    { "id": 1, "size": 3, "images": [".../building-facade.jpg", ".../hotel-entrance.jpg", ".../skyscraper.jpg"] },
    { "id": 2, "size": 2, "images": [".../poster-1920.jpg", ".../vintage-ad.png"] }
  ]
}
```

第三步：按聚类结果在画布上重新排列，每组一行。

```bash
# 第 0 组: 几何图案 (y=0)
curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "golden-pattern.jpg", "x": 0, "y": 0}'

curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "gatsby-border.png", "x": 450, "y": 0}'

curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "art-deco-ceiling.jpg", "x": 900, "y": 0}'

curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "tile-mosaic.jpg", "x": 1350, "y": 0}'

# 第 1 组: 建筑 (y=400)
curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "building-facade.jpg", "x": 0, "y": 400}'

curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "hotel-entrance.jpg", "x": 450, "y": 400}'

curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "skyscraper.jpg", "x": 900, "y": 400}'

# 第 2 组: 复古海报 (y=800)
curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "poster-1920.jpg", "x": 0, "y": 800}'

curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "vintage-ad.png", "x": 450, "y": 800}'
```

> **OpenClaw:** 整理完成！我把 Art Deco 项目的图片按视觉相似度分成了 3 组，在画布上从上到下排列：
>
> - **第 1 行 (4 张):** 几何图案和纹样 -- golden-pattern, gatsby-border, ceiling, tile-mosaic
> - **第 2 行 (3 张):** 建筑外观 -- building-facade, hotel-entrance, skyscraper
> - **第 3 行 (2 张):** 复古海报 -- poster-1920, vintage-ad
>
> 另外还有 5 张图片比较独特，没有归入任何组，它们保持原位没动。打开 Deco 看看效果吧！

---

### 场景 8: "删掉这张不需要的图"

> **用户:** tile-mosaic.jpg 跟我的主题不太搭，删掉吧

**OpenClaw 执行:**

```bash
curl -X DELETE http://127.0.0.1:7890/api/delete \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "filename": "tile-mosaic.jpg"
  }'
```

**API 返回:**

```json
{
  "success": true,
  "message": "Successfully deleted tile-mosaic.jpg"
}
```

> **OpenClaw:** 已删除 tile-mosaic.jpg。原始图片文件、缩略图、数据库记录和 CLIP 向量都已经清理干净了。这个操作不可撤销，希望这是你的本意！

---

### 场景 9: "给这张图打上标签"

> **用户:** 帮我给 golden-pattern.jpg 打上"经典"和"收藏"的标签，顺便加一段描述

**OpenClaw 执行:**

```bash
curl -X PATCH http://127.0.0.1:7890/api/item \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "filename": "golden-pattern.jpg",
    "tags": ["art-deco", "gold", "geometric", "classic", "favorite"],
    "description": "Classic Art Deco gold geometric repeating pattern - personal favorite for project reference",
    "moods": ["luxurious", "elegant"]
  }'
```

**API 返回:**

```json
{
  "status": "updated",
  "filename": "golden-pattern.jpg",
  "metadata": {
    "name": "golden-pattern.jpg",
    "description": "Classic Art Deco gold geometric repeating pattern - personal favorite for project reference",
    "tags": ["art-deco", "gold", "geometric", "classic", "favorite"],
    "mood": ["luxurious", "elegant"]
  }
}
```

> **OpenClaw:** 已更新 golden-pattern.jpg 的元数据：
>
> - **新增标签:** classic, favorite（保留了原有的 art-deco, gold, geometric）
> - **描述:** Classic Art Deco gold geometric repeating pattern - personal favorite for project reference
> - **情绪:** luxurious, elegant
>
> 之后你搜索"经典"或"收藏"就能找到这张图了。

---

### 场景 10: "把所有图片生成向量"

> **用户:** 我刚导入了一批新图片，帮我把整个项目的向量都生成一遍，之后好搜索

**OpenClaw 执行:**

```bash
curl -s -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco"}'
```

**API 返回:**

```json
{
  "embedded": 12,
  "totalImages": 38
}
```

> **OpenClaw:** CLIP 向量生成完毕！处理结果：
>
> - 新生成了 **12 张** 图片的向量（就是你刚导入的那批）
> - 另外 26 张之前已经有向量了，自动跳过
> - 项目总计 **38 张** 图片，现在全部可以做视觉搜索和聚类了
>
> 想试试搜索功能吗？

---

### 场景 11: "找出重复的图片"

> **用户:** 我感觉项目里有些图片是重复的，帮我查一下

**OpenClaw 执行:**

先确保所有图片有向量：

```bash
curl -s -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco"}'
```

然后用高阈值聚类来检测近似重复：

```bash
curl -s -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "threshold": 0.95}'
```

**API 返回:**

```json
{
  "clusterCount": 2,
  "ungrouped": 34,
  "clusters": [
    {
      "id": 0,
      "size": 2,
      "images": [
        "/Users/you/Documents/Deco/art-deco/images/sunset-beach.jpg",
        "/Users/you/Documents/Deco/art-deco/images/sunset-beach-copy.jpg"
      ]
    },
    {
      "id": 1,
      "size": 2,
      "images": [
        "/Users/you/Documents/Deco/art-deco/images/building-front.jpg",
        "/Users/you/Documents/Deco/art-deco/images/building-front-hd.jpg"
      ]
    }
  ]
}
```

> **OpenClaw:** 查到了，项目里有 **2 组** 疑似重复的图片：
>
> **第 1 组:**
> - sunset-beach.jpg
> - sunset-beach-copy.jpg
>
> **第 2 组:**
> - building-front.jpg
> - building-front-hd.jpg
>
> 其余 34 张图片都是独一无二的。要我帮你清理重复的吗？一般建议每组保留一张、删除其余。

---

### 场景 12: "把这几张图移到一起"

> **用户:** 把 golden-pattern.jpg、gatsby-border.png 和 art-deco-ceiling.jpg 这三张放到画布左上角，排成一排

**OpenClaw 执行:**

```bash
# 第一张放在 (0, 0)
curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "filename": "golden-pattern.jpg",
    "x": 0,
    "y": 0
  }'

# 第二张放在 (450, 0)，留出间距
curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "filename": "gatsby-border.png",
    "x": 450,
    "y": 0
  }'

# 第三张放在 (900, 0)
curl -s -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "filename": "art-deco-ceiling.jpg",
    "x": 900,
    "y": 0
  }'
```

**每次 API 返回:**

```json
{ "status": "moved", "filename": "golden-pattern.jpg", "x": 0.0, "y": 0.0 }
{ "status": "moved", "filename": "gatsby-border.png", "x": 450.0, "y": 0.0 }
{ "status": "moved", "filename": "art-deco-ceiling.jpg", "x": 900.0, "y": 0.0 }
```

> **OpenClaw:** 三张图已经排好了，从左到右依次是：
>
> 1. golden-pattern.jpg (0, 0)
> 2. gatsby-border.png (450, 0)
> 3. art-deco-ceiling.jpg (900, 0)
>
> 它们现在在画布左上角排成一排，每张之间留了 450px 的间距。切到 Deco 窗口按 F 键可以自动缩放到全局视图。

---

### 场景 13: "从网上批量收集一批参考图"

> **用户:** 我有 5 个 URL，帮我全部导入到 Cyberpunk 项目，顺便做 AI 分析

**OpenClaw 执行:**

逐个导入，每次间隔 200ms，确保稳定性：

```bash
# 导入第 1 张
curl -s -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/cyberpunk" \
  -F "url=https://example.com/neon-city.jpg" \
  -F "analyze=true"

sleep 0.2

# 导入第 2 张
curl -s -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/cyberpunk" \
  -F "url=https://example.com/rainy-street.jpg" \
  -F "analyze=true"

sleep 0.2

# 导入第 3 张
curl -s -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/cyberpunk" \
  -F "url=https://example.com/hologram-ad.png" \
  -F "analyze=true"

sleep 0.2

# 导入第 4 张
curl -s -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/cyberpunk" \
  -F "url=https://example.com/robot-alley.jpg" \
  -F "analyze=true"

sleep 0.2

# 导入第 5 张
curl -s -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/cyberpunk" \
  -F "url=https://example.com/skyline-night.jpg" \
  -F "analyze=true"

# 等待 AI 分析完成
sleep 5

# 批量生成 CLIP embedding
curl -s -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/cyberpunk"}'
```

> **OpenClaw:** 5 张图片全部导入成功：
>
> 1. neon-city.jpg
> 2. rainy-street.jpg
> 3. hologram-ad.png
> 4. robot-alley.jpg
> 5. skyline-night.jpg
>
> AI 分析已经在后台运行，CLIP 向量也生成好了。过几秒钟后所有图片就能被搜索和做相似度匹配了。Cyberpunk 项目现在有 17 张图片。

---

### 场景 14: "帮我看看这张图的详细信息"

> **用户:** golden-pattern.jpg 有哪些标签和描述？

**OpenClaw 执行:**

通过搜索文件名来获取元数据：

```bash
curl -s -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/you/Documents/Deco/art-deco",
    "query": "golden-pattern",
    "limit": 1
  }'
```

**API 返回:**

```json
{
  "query": "golden-pattern",
  "results": [
    {
      "imagePath": "/Users/you/Documents/Deco/art-deco/images/golden-pattern.jpg",
      "name": "golden-pattern.jpg",
      "score": 0.99,
      "description": "Classic Art Deco gold geometric repeating pattern - personal favorite for project reference",
      "tags": ["art-deco", "gold", "geometric", "classic", "favorite"]
    }
  ]
}
```

> **OpenClaw:** golden-pattern.jpg 的详细信息：
>
> - **描述:** Classic Art Deco gold geometric repeating pattern - personal favorite for project reference
> - **标签:** art-deco, gold, geometric, classic, favorite
> - **文件路径:** /Users/you/Documents/Deco/art-deco/images/golden-pattern.jpg
>
> 要修改这些信息吗？

---

## API 速查表

| 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|----------|
| `GET` | `/api/status` | 健康检查 | -- |
| `GET` | `/api/projects` | 列出所有项目 | -- |
| `POST` | `/api/import` | 导入图片 | `project_path`, `file`/`url`, `analyze`, `position` |
| `DELETE` | `/api/delete` | 删除图片 | `projectPath`, `filename` |
| `POST` | `/api/move` | 移动画布位置 | `projectPath`, `filename`, `x`, `y` |
| `PATCH` | `/api/item` | 更新元数据 | `projectPath`, `filename`, `tags`, `description`, ... |
| `POST` | `/api/embed` | 单张 CLIP embedding | `projectPath`, `imagePath` |
| `POST` | `/api/embed-batch` | 批量 CLIP embedding | `projectPath`, `imagePaths`(可选) |
| `POST` | `/api/similar` | 视觉相似搜索 | `projectPath`, `imagePath`, `limit` |
| `POST` | `/api/search-semantic` | 文本语义搜索 | `projectPath`, `query`, `limit` |
| `POST` | `/api/cluster` | 自动视觉聚类 | `projectPath`, `threshold` |

**格式注意:**
- `/api/import` 使用 `multipart/form-data`，参数名用下划线：`project_path`
- 其余端点使用 `application/json`，参数名用驼峰：`projectPath`

---

## 常见问题

### Deco 没启动怎么办？

**症状:** 调用任何 API 都报 `Connection refused`。

**解决:** 打开 Deco 桌面应用。API 服务随应用启动自动开启，不需要额外操作。如果 Deco 已经打开但仍然连不上，检查端口是否被占用：

```bash
lsof -i :7890
```

或者查看是否修改了默认端口（`~/.deco/config.json` 中的 `apiPort` 字段）。

### 搜索没结果？

文本搜索（`/api/search-semantic`）依赖图片的元数据。如果图片刚导入还没有被 AI 分析过，就不会有 description 和 tags，自然搜不到。

**解决方案（任选其一）:**
1. 导入图片时加 `analyze=true`，让 AI 自动打标签
2. 用 `PATCH /api/item` 手动给图片添加标签和描述
3. 确认 Deco 设置中已配置至少一个 AI Provider（OpenAI / Anthropic / Ollama / OpenRouter）

视觉相似搜索（`/api/similar`）不需要元数据，但需要 CLIP embedding。用 `/api/embed-batch` 给整个项目生成向量即可。

### 分析很慢？

AI 分析速度取决于你配置的 Provider：

| Provider | 速度 | 说明 |
|----------|------|------|
| Ollama (本地) | 较慢 | 取决于本地 GPU 性能 |
| OpenAI | 较快 | 需要网络，按量计费 |
| Anthropic | 较快 | 需要网络，按量计费 |
| OpenRouter | 视模型而定 | 聚合多个 Provider |

**优化建议:**
- 大批量导入时先不开 `analyze=true`，全部导入后再统一分析
- CLIP embedding 生成（`/api/embed-batch`）在本地完成，通常比 AI 分析快很多
- 首次使用 CLIP 需要下载模型（约 150MB），之后就是本地推理

### 项目路径报错？

`"Project path does not exist or is not a directory"` 通常是因为路径写错了。

**注意事项:**
- 必须用绝对路径，不能用 `~`（波浪号不会自动展开）
- 最靠谱的做法：先调 `GET /api/projects` 拿到准确路径，再用这个路径

### 删除操作能撤销吗？

不能。`DELETE /api/delete` 会彻底删除原始图片、缩略图、数据库记录和 CLIP 向量。请确认后再操作。

### CLIP 模型首次加载要多久？

首次调用 `/api/embed` 或 `/api/embed-batch` 时，CLIP 模型需要下载（约 150MB）并加载到内存。这个过程可能需要 10-30 秒。之后的调用使用缓存，速度会快很多。如果超时了，等 30 秒后重试即可。
