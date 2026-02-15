# Testing Skill — RefBoard

## 测试环境配置

### 首次设置（如果尚未配置）

```bash
cd desktop

# 安装 Vitest
npm install -D vitest @vitest/coverage-v8 jsdom

# package.json 添加脚本
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.test:coverage="vitest run --coverage"
```

创建 `desktop/vitest.config.js`：
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', '*.config.js']
    }
  }
});
```

## 测试框架

| 层级 | 框架 | 位置 |
|------|------|------|
| Rust 单元测试 | `cargo test` | `src-tauri/src/*.rs` 内 `#[cfg(test)]` |
| JS 单元测试 | Vitest | `desktop/src/**/*.test.js` |
| 集成测试 | Vitest | `desktop/tests/*.test.js` |
| E2E 测试 | Playwright (未来) | `e2e/*.spec.ts` |

## 文件约定

```
desktop/
├── src/
│   ├── canvas.js
│   ├── canvas.test.js        ← 与源文件同目录
│   ├── panels.js
│   └── panels.test.js
├── src-tauri/src/
│   ├── lib.rs                ← Rust 测试在文件内 #[cfg(test)] mod tests
│   ├── ai.rs
│   └── search.rs
└── tests/
    ├── helpers/              ← 测试工具/mock
    └── integration.test.js   ← 跨模块集成测试
```

## 编写规则

### Rust 测试
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_images_returns_empty_for_empty_dir() {
        // ...
    }

    #[test]
    fn test_scan_images_handles_invalid_path() {
        // ...
    }
}
```
- 测试函数命名：`test_<function>_<scenario>`
- 用 `tempfile` crate 创建临时目录
- 异步测试用 `#[tokio::test]`
- 错误路径必须测试 `Result::Err` 分支

### JavaScript 测试
```javascript
import { describe, it, expect, vi } from 'vitest';
import { loadProject } from './canvas.js';

describe('loadProject', () => {
  it('should return empty result for empty project', async () => {
    // ...
  });

  it('should handle missing metadata gracefully', async () => {
    // ...
  });
});
```
- 测试命名：`should + 动词` 格式
- 每个 `describe` 对应一个函数/模块
- 不用 `any` 类型 mock
- 异步用 `async/await`，不用 `done` callback
- 测试独立，不依赖执行顺序

## 覆盖范围

每个模块必须覆盖：

| 类型 | 说明 | 示例 |
|------|------|------|
| 正常路径 | 标准输入输出 | 有效图片目录 → 返回图片列表 |
| 边界条件 | 空值、极限值 | 空目录、0 张图、500+ 张图 |
| 类型错误 | 无效输入 | null、undefined、错误类型 |
| 错误处理 | 异常情况 | 文件不存在、权限不足、网络超时 |

## Mock 规范

### 必须 Mock
- **Tauri IPC:** `vi.mock('@tauri-apps/api')`
- **外部 API:** AI Provider、Brave Search
- **文件系统:** 使用 `memfs` 或 Rust `tempfile`
- **网络请求:** `vi.mock('fetch')` 或 `mockReqwest`

### 时间相关
```javascript
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-02-15'));
// ... 测试
vi.useRealTimers();
```

### 环境变量
```javascript
vi.stubEnv('OPENAI_API_KEY', 'test-key');
```

## 覆盖率要求

| 指标 | 目标 |
|------|------|
| 行覆盖率 | > 80% |
| 分支覆盖率 | > 70% |
| 新增代码 | 100% |

## 禁止事项

- ❌ `it.skip()` 或 `it.todo()` 提交到主分支
- ❌ Snapshot 测试用于逻辑验证（只用于 UI 组件渲染）
- ❌ Hardcode 绝对路径（用 `path.join` + 相对路径）
- ❌ `sleep()` / `setTimeout()` 做等待（用 `waitFor` 或轮询）
- ❌ 真实数据库/网络调用（必须 mock）
- ❌ 测试间共享可变状态

## 运行命令

```bash
# Rust 测试
cd desktop/src-tauri
cargo test                    # 全量测试
cargo test <test_name>        # 单个测试
cargo test -- --nocapture     # 显示 println 输出

# JavaScript 测试
cd desktop
npm test                      # 全量测试
npm test -- --watch           # 监听模式
npm run test:coverage         # 覆盖率报告
npm test -- canvas.test.js    # 单文件

# 验证全部通过
cd desktop/src-tauri && cargo test && cd .. && npm test
```

## Tester Agent 工作流

1. **读取源码** — 先理解被测模块的逻辑
2. **编写测试** — 按上述规范编写
3. **运行测试** — `cargo test` + `npm test`
4. **修复测试** — 只修复测试代码，不改源码
5. **发现 Bug** — 通过 TEAM.md @对应角色 报告
6. **全绿提交** — 确认全部通过后报告完成

## 当前测试状态

### Rust (src-tauri/src/)
| 模块 | 测试数 | 状态 |
|------|--------|------|
| ai.rs | 8 | ✅ |
| search.rs | 6 | ✅ |
| web.rs | 5 | ✅ |
| lib.rs | 0 | ⬜ 待补充 |
| embed.rs | 0 | ⬜ 待补充 |
| api.rs | 0 | ⬜ 待补充 |

### JavaScript (desktop/src/)
| 模块 | 测试数 | 状态 |
|------|--------|------|
| canvas.js | 0 | ⬜ 待补充 |
| main.js | 0 | ⬜ 待补充 |
| panels.js | 0 | ⬜ 待补充 |
| search.js | 0 | ⬜ 待补充 |
| collection.js | 0 | ⬜ 待补充 |
