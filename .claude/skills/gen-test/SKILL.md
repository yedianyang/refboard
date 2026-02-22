---
name: gen-test
description: Generate test scaffolds for Rust and JS modules with full coverage patterns
disable-model-invocation: false
---

# gen-test — 自动生成测试骨架

给定一个源文件，生成完整的测试骨架（不是空壳，包含具体场景）。

## 流程

1. 读取目标源文件
2. 识别所有 public 函数/commands
3. 为每个函数生成 4 类测试：
   - **Happy path** — 正常输入 → 预期输出
   - **Boundary** — 空值、零值、极大值、空数组
   - **Error** — 无效输入、文件不存在、网络超时
   - **Concurrency** — 快速重复调用（如适用）
4. 输出到正确位置

## Rust 模块 (`*.rs`)

输出位置：源文件末尾的 `#[cfg(test)]` 块

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_函数名_happy_path() {
        // Setup
        // Act
        // Assert
    }

    #[test]
    fn test_函数名_empty_input() {
        // Boundary test
    }

    #[test]
    fn test_函数名_invalid_path() {
        // Error test — expect specific error
    }
}
```

**规则：**
- 用 `tempfile::tempdir()` 测试文件操作
- 用 `assert!(result.is_err())` 测试错误路径
- `#[tauri::command]` 函数：测试内部逻辑函数，不测 command wrapper
- 不 mock 数据库——用内存 SQLite (`:memory:`)

## JS 模块 (`*.js`)

输出位置：同目录 `模块名.test.js`

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('模块名', () => {
  describe('函数名', () => {
    it('should handle normal input', () => {
      // Happy path
    });

    it('should handle empty input', () => {
      // Boundary
    });

    it('should throw on invalid input', () => {
      // Error
    });
  });
});
```

**规则：**
- Mock `window.__TAURI__` 的 `invoke` 调用
- Mock PixiJS 对象（Application, Container, Sprite）
- 不测 DOM 交互——只测逻辑函数
- `vi.fn()` mock 外部依赖

## 命名约定

- Rust: `test_{函数名}_{场景}` (snake_case)
- JS: `should {预期行为}` (自然语言)
