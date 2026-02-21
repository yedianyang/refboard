# 工程流程

## Git 提交规范

| type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `style` | 样式/UI 调整 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `chore` | 构建/配置/杂项 |

**规则：**
- 每个 task 完成 + 测试通过 → 立即 commit
- 不积攒多个 task 一起提交
- 不提交未测试的代码

## 踩坑经验记录流程

遇到 bug/问题时更新 `.claude/reference/lessons-learned.md`：

```markdown
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| [描述问题] | [根本原因] | [解决方法] |
```

## 注意事项

### 必须遵守
- **不要修改** `~/.deco/config.json` 的结构（向后兼容）
- **HTTP API** 只监听 localhost (安全)
- **图片压缩** 必须保留 alpha 通道
- **CLIP 模型** 启动后 3 秒延迟加载（不阻塞 UI）

### 已知限制
- CLIP embedding 首次运行需下载模型 (~150MB)
- SQLite FTS5 不支持中文分词（可改进）
- Tauri 2.0 的 `asset://` 协议路径需要 `convertFileSrc()`

### 关键路径
- 项目存储：`~/Documents/Deco/{project}/`
- 全局配置：`~/.deco/config.json`
- 缩略图缓存：`{project}/.thumbnails/`
- 搜索数据库：`{project}/.deco/search.db`
