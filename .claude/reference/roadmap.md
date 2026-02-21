# 开发重点与进度 (2026-02)

## P1 待开始
- [ ] CLI 命令补全（还有 10 个命令待实现）
- [ ] 截图/GIF（README 演示素材）
- [ ] DMG 打包签名

## 已完成里程碑

### M5 Polish & Ship (最新)
- [x] Agent Team 架构升级（内建 TaskList/Mailbox/delegate mode）
- [x] UI 词汇表文档（docs/ui-vocabulary.md）
- [x] Node connections 功能（bezier 路径、端口检测、curvature 调节）
- [x] canvas.js 模块化拆分（8 个模块）

### M4 Web Collection
- [x] BUG-012 单击拖拽误触发修复（4px dead zone）
- [x] BUG-011 图片被 bg 遮盖修复（texture 加载后清除 fill）
- [x] BUG-010 Connector 工具修复（card pointerdown 拦截）
- [x] BUG-009 finishRename 防重入

### M3 Organization
- [x] 导入后自动 index + embed（spawn_auto_index）
- [x] main.js 模块化拆分（5 个独立模块）
- [x] AI Vision 模型扩展（+3 Providers）
- [x] OpenClaw 深度集成方案（调研文档）
- [x] HTTP API ↔ CLI 同步（ops.rs + 3 个 CLI 命令）
- [x] 浮动工具栏上下文感知（data-context 属性系统）
- [x] Group 行为修复（选中/拖拽/边框跟随）
- [x] 图标矢量化（emoji → Lucide SVG）
- [x] Frame 缩放裁剪（PixiJS mask）
- [x] Nav bar 重构（Lucide icons）

### M2 Search & Similarity
- [x] 浮动选择工具栏（基础版）
- [x] CLIP HTTP API（5 个端点）
- [x] AI Vision 配置面板（Settings UI + 后端 wiring）
- [x] 文本标注 + 图形框

### M1 AI Integration
- [x] Home 主页
- [x] 拖拽/粘贴图片导入
- [x] CLIP 模型预热
- [x] 空项目处理
- [x] 创建项目流程修复

### M0 Foundation
- [x] Tauri shell + PixiJS canvas + 基础 UI
