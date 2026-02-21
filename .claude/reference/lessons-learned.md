# 踩坑经验 (Lessons Learned)

> ⚠️ **重要：** 每次迭代发现的问题和解决方案必须记录在这里，避免重复踩坑！

## Tauri / Rust

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 前端调用 Rust 命令失败 | 命令名不匹配（前端用 `cmd_xxx`，Rust 用 `xxx`）| 统一命名：Rust 用 `#[tauri::command] fn xxx()`，前端 `invoke('xxx')` |
| 参数缺失导致调用失败 | 前端传的参数和 Rust 定义不一致 | 检查两边参数名和类型完全匹配 |
| CLIP 模型阻塞 UI | 模型加载在主线程 | 启动后 3 秒延迟 warmup，或用 `spawn_blocking` |
| `asset://` 路径无法加载 | Tauri 2.0 需要转换路径 | 使用 `convertFileSrc(path)` |

## 前端 / PixiJS

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 空项目卡在 loading | `loadProject()` 返回 `undefined` | 返回 `{ loaded: 0, total: 0 }`，显示空状态提示 |
| 纹理内存泄漏 | 切换项目没销毁旧纹理 | `texture.destroy(true)` 销毁 baseTexture |
| 拖拽事件穿透 | 子元素没设置 `eventMode` | 设置 `eventMode = 'static'` |
| Group 纯视觉无法交互 | Group 只是画了边框，没有选中/拖拽逻辑 | 需要 `editingGroup` 状态 + `updateGroupBounds()` + group-aware click/drag |
| Frame 缩放变形 | 直接缩放 sprite 导致图片拉伸 | 用 PixiJS mask 裁剪，sprite 保持原始尺寸 |
| 快捷键冲突 | canvas.js 和 main.js 都监听同一快捷键 | 功能区分：Cmd+G=Group, Cmd+Shift+G=Generate |
| 卡片 pointerdown 阻断 stage handler | card 的 eventMode='static' 先触发，stage 的 `if(e.target!==stage) return` 过滤 | 在 startCardDrag() 开头拦截特殊工具（如 connector） |
| 图片被不透明 bg 遮盖 | createPlaceholderCard 画了 fill，texture 加载后 bg 未清除 | texture 加载后 bg.clear() 只留 stroke，resizeCardTo 同理 |
| 单击误触发拖拽 | globalpointermove 任何移动即设 moved=true | 加 DRAG_THRESHOLD=4px dead zone，squared distance 判断 |

## 团队协作

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 重复导出错误 | 同一函数既在声明时 export 又在文件末尾 export | 只用一种方式导出 |
| 命令处理函数未定义 | 注册了命令但忘写实现 | 先写空函数骨架，再填逻辑 |
| Tester 改了源码 | 权限没限制 | Tester 只改测试文件，源码 bug @对应角色修 |

## 设计 / UI

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| emoji 不同平台显示不一致 | 系统 emoji 渲染差异 | 使用 Lucide Icons SVG |
| 磨砂玻璃效果不生效 | 没设置背景色透明 | `background: rgba(30,30,30,0.8)` + `backdrop-filter` |
| 深色模式颜色错 | 硬编码颜色 | 使用 CSS 变量 `var(--bg-color)` |

## 新增经验模板

```markdown
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| [描述问题] | [根本原因] | [解决方法] |
```
