# RefBoard TODO

> Agent 协作任务清单 — 最后更新: 2026-02-14

## 完成状态图例
- ✅ 完成
- 🔄 进行中
- ⬜ 待开始
- ❌ 阻塞/取消

---

## Generator (@generator)

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ | 基础图片检测 | findImages, loadMetadata |
| ✅ | Base64 转换 | 内嵌图片到 HTML |
| ✅ | 自动布局算法 | autoLayout (网格) |
| ✅ | WebP/BMP 尺寸解析 | 原生 header 解析，无外部依赖 |
| ✅ | 拖拽位置持久化 | savePositions/loadPositions + CLI save-positions + 模板导出按钮 |
| ⬜ | 批量布局命令 | `refboard layout --grid/--cluster` |
| ✅ | **AI Provider 统一接口** | lib/ai-provider.js — 6 个 Provider Adapter + CLI 命令全部实现 |
| ✅ | 图片自动分析 | analyze / auto-tag / ask / search 命令已实现 |
| 🔄 | AI 双路径支持 | openclaw 代理 + 云端直连 |
| ⬜ | 修复 openclaw adapter | 对接 OpenClaw Gateway 正确 API |
| ⬜ | 修复 save-positions bug | 只保存部分位置的问题 |
| ⬜ | serve 命令 | 本地服务器 + 实时渲染 |

---

## AI/Agent 统一接口 (@generator) ⭐ 新增

> 目标：统一所有 AI 和 Agent 的调用入口

### 架构设计

```
refboard.json
├── ai:
│   ├── defaultProvider: "openclaw"
│   ├── providers:
│   │   ├── openclaw:
│   │   │   ├── endpoint: "http://localhost:18789"
│   │   │   └── features: [vision, chat, embedding]
│   │   ├── openai:
│   │   │   ├── apiKey: "sk-..."
│   │   │   ├── visionModel: "gpt-4o"
│   │   │   └── features: [vision, chat, embedding]
│   │   ├── anthropic:
│   │   │   ├── apiKey: "sk-ant-..."
│   │   │   ├── visionModel: "claude-sonnet-4"
│   │   │   └── features: [vision, chat]
│   │   ├── minimax:
│   │   │   ├── apiKey: "..."
│   │   │   ├── endpoint: "https://api.minimax.chat/v1"
│   │   │   └── features: [vision, chat]
│   │   ├── google:
│   │   │   ├── apiKey: "..."
│   │   │   ├── visionModel: "gemini-pro-vision"
│   │   │   └── features: [vision, chat]
│   │   └── custom:
│   │       ├── endpoint: "..."
│   │       └── headers: {...}
```

### 支持的 Vision 模型

| Provider | 模型 | 特点 |
|----------|------|------|
| OpenAI | gpt-4o, gpt-4-vision | 通用强，贵 |
| Anthropic | claude-sonnet-4 | 细节好 |
| MiniMax | abab6.5-chat | 中文优化，便宜 |
| Google | gemini-pro-vision | 免费额度大 |
| OpenClaw | 代理任意模型 | 统一入口 |

### 功能清单

| 状态 | 功能 | 说明 |
|------|------|------|
| ✅ | AI Provider 抽象层 | lib/ai-provider.js |
| ✅ | OpenClaw Adapter | 调用 OpenClaw Gateway API |
| ✅ | OpenAI Adapter | 直接调用 OpenAI |
| ✅ | 图片分析接口 | `refboard analyze <image>` |
| ✅ | 批量标签生成 | `refboard auto-tag --all` |
| ✅ | 相似图片搜索 | `refboard search` (文本) + `--similar` (embedding 框架) |
| ✅ | Agent 调用接口 | `refboard agent add/layout/export` |

### 双路径架构 ⭐

RefBoard AI 支持两种使用方式：

**路径 1：OpenClaw 代理模式**
```
RefBoard → OpenClaw Gateway (localhost:18789) → 任意 AI 模型
```
- 用户不需要管理 API key
- OpenClaw 统一代理所有 AI 调用
- 适合已安装 OpenClaw 的用户

**路径 2：云端 API 直连模式**
```
RefBoard → OpenAI / Anthropic / MiniMax / Google API
```
- 用户自己配置 endpoint + API key
- RefBoard 独立可用，不依赖 OpenClaw
- 适合独立使用 RefBoard 的用户

| Provider | 模式 | 配置 |
|----------|------|------|
| openclaw | 代理 | endpoint (默认 localhost:18789) |
| openai | 直连 | apiKey + visionModel |
| anthropic | 直连 | apiKey + visionModel |
| minimax | 直连 | apiKey + endpoint |
| google | 直连 | apiKey + visionModel |
| custom | 直连 | endpoint + apiKey + headers |

### CLI 命令

```bash
# 路径 1：用 OpenClaw 代理
refboard config ai.provider openclaw

# 路径 2：直连云端 API
refboard config ai.provider openai
refboard config ai.apiKey "sk-xxx"
refboard config ai.visionModel "gpt-4o"

# 使用 AI 功能
refboard analyze <image>           # 分析单张图片
refboard auto-tag --all            # 批量生成标签
refboard search --similar <image>  # 相似图片搜索
refboard ask "这些图片有什么共同点"  # 对 board 提问
```

### Agent 接口（供 OpenClaw 等调用）

```bash
# 外部 agent 可通过 CLI 操作 board
refboard agent add <image> --analyze
refboard agent layout --cluster-by tags
refboard agent export --format json
```

---

## Template (@template)

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ | 基础 HTML 模板 | Canvas 画布结构 |
| ✅ | 缩放/平移交互 | Wheel + Space+drag |
| ✅ | 卡片点击/hover | 基础效果 |
| ✅ | Figma 点阵网格 | 背景网格 |
| ✅ | 卡片动画 | 入场/hover transitions |
| ✅ | Minimap 点击导航 | 点击/拖拽 minimap 跳转视口 |
| ✅ | Pinch-zoom (触控) | 双指缩放+平移 |
| ✅ | 关键词过滤 UI | 侧边栏 tags 过滤 + 搜索 + 键盘快捷键 G |
| ⬜ | 文本框组件 | P1 |
| ⬜ | 图形框组件 | P2 |
| ⬜ | 深色/浅色主题切换 | |

---

## Docs (@docs)

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ | README.md | 英文文档（含 AI Provider、新命令、API、Agent 指南） |
| ✅ | LICENSE | MIT |
| ✅ | package.json | metadata, bin, files |
| ✅ | FEATURES.md | 功能规划 |
| ✅ | CHANGELOG.md | 版本记录（v0.0.1 ~ v1.1.0） |
| ✅ | index.js | 公共 API 入口 |
| ⬜ | 截图/GIF | 视觉演示 |
| ⬜ | npm 发布准备 | |

---

## Designer (@designer)

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ | 卡片视觉设计 | 图片+信息布局 |
| ✅ | 画布背景 | 点阵网格 |
| ✅ | 信息面板设计 | 图片预览+Creator+Description+Context+References+Attributes+Tags+Source+搜索按钮 |
| ✅ | 配色方案 | 深色/浅色主题切换 (D 键 / ◑ 按钮)，localStorage 持久化 |
| ✅ | 动效规范 | CSS token: --duration-fast/normal/slow/enter, --ease-out/in-out/bounce/spring |

---

## Researcher (@researcher)

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ | Figma 交互研究 | 画布导航、对象操作、智能辅助线、Auto Layout、快捷键 |
| ✅ | Miro 交互研究 | 协作画布、Mouse/Trackpad模式、Frame组织、工具栏 |
| ✅ | PureRef 研究 | 轻量参考板、Pack排列、标准化尺寸、窗口模式 |
| ✅ | Layout 算法研究 | Tidy Up / Pack All / 对齐分布对比 |
| ✅ | 研究报告输出 | docs/research.md (含交互对比+RefBoard建议) |

---

## Tester (@tester)

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ | CLI 命令测试 | init, build, add, import... |
| ⬜ | HTML 输出测试 | 图片嵌入、布局正确 |
| ⬜ | 交互功能测试 | 缩放、平移、点击 |
| ⬜ | 边界条件测试 | 空目录、大文件、特殊字符 |
| ⬜ | 测试报告 | docs/test-report.md |

---

## 优先级

**P0 (本周)**
- [x] 拖拽位置持久化 (@generator + @template)
- [x] 关键词过滤 (@template)
- [ ] 测试报告 (@tester)

**P1 (短期)**
- [x] 图片自动分析 (@generator)
- [ ] 文本框 (@template)
- [ ] npm 发布 (@docs)

**P2 (中期)**
- [ ] 图形框
- [ ] 聚合模式
- [ ] 深色/浅色主题

---

## v2.0 架构升级 🚀 ⭐ 新规划

> 目标：Figma 式本地应用，支持 macOS / iOS

### 技术选型

| 层 | 方案 | 理由 |
|---|---|---|
| **App Shell** | Tauri 2.0 | Rust 后端，体积小 (~10MB)，支持 macOS + iOS |
| **渲染引擎** | PixiJS (WebGL) | 无限画布，60fps，几千张图片不卡 |
| **后端** | Rust + HTTP Server | 文件系统操作 + API for CLI/Agent |
| **数据** | metadata.json | 保持本地文件，CLI/Agent 可读写 |

### 新架构

```
┌─────────────────────────────────────┐
│         Tauri App Shell            │
│  ┌─────────────────────────────┐    │
│  │   WebView (PixiJS 渲染)     │    │
│  │   - 无限画布               │    │
│  │   - 60fps 拖拽/缩放        │    │
│  │   - 实时响应数据变化       │    │
│  └──────────────│──────────────┘    │
│                 │ Tauri IPC         │
│  ┌──────────────│──────────────┐    │
│  │   Rust Backend              │    │
│  │   - 文件系统操作            │    │
│  │   - metadata.json 读写      │    │
│  │   - 图片处理 (resize/thumb) │    │
│  │   - HTTP Server (CLI API)   │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
         ↑
    CLI / OpenClaw / 外部 Agent
    （通过 HTTP API 操作）
```

### REST API 设计

```
GET    /api/items          → 获取所有 items
POST   /api/items          → 添加 item
PUT    /api/items/:id      → 更新 item (位置/metadata)
DELETE /api/items/:id      → 删除 item
GET    /api/images/:name   → 图片代理
POST   /api/analyze        → AI 分析图片
POST   /api/layout         → 自动布局
GET    /api/export         → 导出数据
```

### 版本规划

**v2.0 — macOS App**
| 状态 | 功能 |
|------|------|
| ⬜ | Tauri 项目初始化 |
| ⬜ | Rust 后端 - 文件系统 API |
| ⬜ | Rust 后端 - HTTP Server |
| ⬜ | PixiJS 渲染引擎 - 画布 |
| ⬜ | PixiJS 渲染引擎 - 卡片组件 |
| ⬜ | PixiJS 渲染引擎 - 拖拽/缩放 |
| ⬜ | 前端 UI - 工具栏 |
| ⬜ | 前端 UI - 侧边栏 (tags/layers) |
| ⬜ | 前端 UI - 信息面板 |
| ⬜ | AI 集成 - 分析/标签 |
| ⬜ | CLI 兼容 - HTTP API 调用 |
| ⬜ | 打包 .dmg |

**v2.1 — iOS App**
| 状态 | 功能 |
|------|------|
| ⬜ | Tauri Mobile 配置 |
| ⬜ | 触控手势优化 |
| ⬜ | iCloud 同步 |
| ⬜ | 相机/相册导入 |
| ⬜ | TestFlight / App Store |

### 团队分工

| 角色 | v2.0 任务 |
|------|----------|
| **Generator** | Rust 后端 + HTTP API + Tauri IPC |
| **Designer** | PixiJS 渲染引擎 + 画布交互 |
| **Template** | 前端 UI 组件 (工具栏/侧边栏/面板) |
| **Tester** | 集成测试 + 性能测试 |
| **Docs** | API 文档 + 用户手册 |
| **Researcher** | Tauri/PixiJS 最佳实践调研 |

### 迁移策略

1. **保持 v1.x 可用** — 当前 CLI + 静态 HTML 继续维护
2. **数据兼容** — v2.0 使用相同的 metadata.json 格式
3. **渐进迁移** — v2.0 App 内嵌 HTTP Server，CLI 无感切换

---

*Agents: 检查你负责的部分，更新状态，报告问题*
