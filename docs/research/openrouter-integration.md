# OpenRouter Integration Research — RefBoard

> Date: 2026-02-15
> Researcher: Metro

---

## 1. Summary

**OpenRouter** 是一个 AI 模型聚合 API 服务，提供统一的 OpenAI 兼容接口访问 300+ 模型。对于 RefBoard，这意味着**只需实现一个 adapter，即可访问所有主流 Vision 模型**。

---

## 2. 核心价值

| 特性 | 说明 |
|------|------|
| **统一 API** | 100% OpenAI 兼容格式，现有代码几乎无需修改 |
| **300+ 模型** | GPT-4o、Claude、Gemini、Llama、DeepSeek、MiniMax... |
| **按需付费** | 无月费，直接转发到底层 provider，0% 加价 |
| **自动 Fallback** | 某模型不可用时自动切换备选 |
| **统一账单** | 一个 API key，一份账单 |
| **免费额度** | 部分模型有免费 tier |

---

## 3. API 格式（100% OpenAI 兼容）

```javascript
// 只需改 baseURL 和 apiKey
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Vision 请求格式完全相同
const response = await openai.chat.completions.create({
  model: 'openai/gpt-4o-mini',  // 模型名加 provider 前缀
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
    ]
  }]
});
```

---

## 4. Vision 模型价格对比

| 模型 | Input $/M | Output $/M | 单图成本 | 备注 |
|------|----------|-----------|---------|------|
| **google/gemini-2.0-flash** | $0.10 | $0.40 | ~$0.00027 | ⭐ 最便宜 |
| **openai/gpt-4o-mini** | $0.15 | $0.60 | ~$0.00040 | 性价比之王 |
| **deepseek/deepseek-chat** | $0.14 | $0.28 | ~$0.00030 | 国产便宜 |
| minimax/minimax-01 | $0.20 | $1.10 | ~$0.00063 | |
| anthropic/claude-3.5-haiku | $0.80 | $4.00 | ~$0.00200 | |
| google/gemini-2.0-pro | $1.25 | $5.00 | ~$0.00300 | 高质量 |
| anthropic/claude-3.5-sonnet | $3.00 | $15.00 | ~$0.00900 | 最佳质量 |

**注：** 单图成本按 ~1500 input tokens + 300 output tokens 估算

---

## 5. 认证方式

```bash
# 获取 API Key
# 1. 注册 https://openrouter.ai
# 2. 创建 API Key
# 3. 设置环境变量
export OPENROUTER_API_KEY="sk-or-..."
```

**可选 Headers（用于排行榜）：**
- `HTTP-Referer`: 应用 URL
- `X-Title`: 应用名称

---

## 6. 速率限制

| 类型 | 限制 |
|------|------|
| 免费用户 | 20 req/min, 200 req/day |
| 付费用户 | 按模型不同，通常 500+ req/min |
| 并发 | 无明确限制 |

---

## 7. 优缺点对比

### 优点 ✅
- **一个 adapter 搞定所有模型** — 极大简化代码
- **OpenAI 格式** — RefBoard 已有 OpenAI adapter，改几行即可
- **灵活切换** — 用户可自由选择模型
- **价格透明** — 和直连价格相同，无加价
- **Fallback** — 自动故障转移

### 缺点 ❌
- **多一跳延迟** — 请求经 OpenRouter 中转，增加 50-100ms
- **依赖第三方** — OpenRouter 挂了就都挂了
- **某些模型不全** — 如 Anthropic 最新模型可能延迟上线

---

## 8. RefBoard 集成建议

### 方案 A：新增 OpenRouter Adapter（推荐）

```javascript
// ai-provider.js
class OpenRouterProvider extends OpenAIProvider {
  constructor(config) {
    super({
      ...config,
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
    });
  }

  // 模型名映射
  normalizeModel(model) {
    // 如果已有前缀，直接用
    if (model.includes('/')) return model;
    // 否则加默认前缀
    return `openai/${model}`;
  }
}
```

### 方案 B：作为 OpenAI Adapter 的选项

```json
// refboard.json
{
  "ai": {
    "provider": "openai",
    "baseURL": "https://openrouter.ai/api/v1",
    "apiKey": "sk-or-...",
    "model": "google/gemini-2.0-flash"
  }
}
```

**推荐方案 B** — 无需新代码，用户自行配置 baseURL 即可使用 OpenRouter。

---

## 9. 推荐配置

### 日常使用（最便宜）
```json
{
  "ai": {
    "baseURL": "https://openrouter.ai/api/v1",
    "model": "google/gemini-2.0-flash"
  }
}
```

### 平衡性价比
```json
{
  "ai": {
    "baseURL": "https://openrouter.ai/api/v1",
    "model": "openai/gpt-4o-mini"
  }
}
```

### 最佳质量
```json
{
  "ai": {
    "baseURL": "https://openrouter.ai/api/v1",
    "model": "anthropic/claude-3.5-sonnet"
  }
}
```

---

## 10. 结论

**OpenRouter 是 RefBoard 的理想选择：**

1. ✅ 无需为每个 provider 写 adapter
2. ✅ 用户可自由选择 300+ 模型
3. ✅ 价格最低可达 $0.00027/图（Gemini Flash）
4. ✅ 现有 OpenAI adapter 改 baseURL 即可使用

**行动建议：**
- 在 README 中说明 OpenRouter 配置方法
- 默认推荐 `google/gemini-2.0-flash` 或 `openai/gpt-4o-mini`

---

## References

- [OpenRouter Docs](https://openrouter.ai/docs)
- [OpenRouter Models](https://openrouter.ai/models)
- [OpenRouter Pricing](https://openrouter.ai/pricing)
