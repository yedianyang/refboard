# AI Vision Models 调研报告

> 更新日期: 2026-02-16
> 调研目的: 为 RefBoard AI Vision 功能选型，对比各 Provider 的图片分析能力、价格、API 兼容性

## 模型对比表

> 价格假设: 每张图片 ~1000 input tokens + ~200 output tokens

| Provider | Model | API 格式 | Base URL | 质量 | 速度 | 价格/千张 | 中文 | 免费额度 | 集成难度 |
|----------|-------|---------|----------|------|------|-----------|------|---------|---------|
| **OpenAI** | gpt-4o | OpenAI | `api.openai.com/v1` | ★★★★★ | ★★★★ | ~$4.50 | ★★★★ | 无 | ★☆☆☆☆ |
| **OpenAI** | gpt-4o-mini | OpenAI | `api.openai.com/v1` | ★★★★ | ★★★★★ | ~$0.27 | ★★★★ | 无 | ★☆☆☆☆ |
| **Anthropic** | claude-sonnet-4-5 | Anthropic | `api.anthropic.com/v1` | ★★★★★ | ★★★★ | ~$6.00 | ★★★★★ | 无 | ★☆☆☆☆ |
| **Anthropic** | claude-haiku-4-5 | Anthropic | `api.anthropic.com/v1` | ★★★★ | ★★★★★ | ~$2.00 | ★★★★★ | 无 | ★☆☆☆☆ |
| **Google** | gemini-2.0-flash | OpenAI 兼容 | `generativelanguage.googleapis.com/v1beta/openai` | ★★★★ | ★★★★★ | ~$0.18 | ★★★★ | 1000次/天 | ★★☆☆☆ |
| **Google** | gemini-2.5-pro | OpenAI 兼容 | 同上 | ★★★★★ | ★★★ | ~$3.25 | ★★★★ | 50次/天 | ★★☆☆☆ |
| **Moonshot** | kimi-k2.5 | OpenAI 兼容 | `api.moonshot.cn/v1` | ★★★★ | ★★★★ | ~$1.20 | ★★★★★ | 充值送 $5 | ★★☆☆☆ |
| **Qwen** | qwen-vl-max | OpenAI 兼容 | `dashscope-intl.aliyuncs.com/compatible-mode/v1` | ★★★★ | ★★★★ | ~$1.44 | ★★★★★ | 1M tokens | ★★☆☆☆ |
| **Qwen** | qwen-vl-plus | OpenAI 兼容 | 同上 | ★★★ | ★★★★★ | ~$0.38 | ★★★★★ | 1M tokens | ★★☆☆☆ |
| **Qwen** | qwen3-vl-flash | OpenAI 兼容 | 同上 | ★★★ | ★★★★★ | ~$0.14 | ★★★★★ | 1M tokens | ★★☆☆☆ |
| **Together AI** | qwen3-vl-32b | OpenAI 兼容 | `api.together.xyz/v1` | ★★★★ | ★★★★ | ~$0.80 | ★★★★ | 有限免费 | ★★☆☆☆ |
| **Groq** | llama-4-scout-17b | OpenAI 兼容 | `api.groq.com/openai/v1` | ★★★ | ★★★★★ | ~$0.18 | ★★ | 免费额度 | ★★☆☆☆ |
| **Groq** | llama-4-maverick-17b | OpenAI 兼容 | `api.groq.com/openai/v1` | ★★★★ | ★★★★★ | ~$0.65 | ★★★ | 免费额度 | ★★☆☆☆ |
| **DeepSeek** | deepseek-chat (V3) | OpenAI 兼容 | `api.deepseek.com` | ★★★ | ★★★★ | ~$0.54 | ★★★★★ | 有限 | ★★☆☆☆ |
| **OpenRouter** | 聚合 200+ 模型 | OpenAI 兼容 | `openrouter.ai/api/v1` | 取决于模型 | 取决于模型 | 透传原价 | 取决于模型 | $1 新用户 | ★★☆☆☆ |
| **Ollama** | llava / bakllava | Ollama | `localhost:11434` | ★★★ | ★★ | 免费 | ★★ | 无限 | ★☆☆☆☆ |
| **Ollama** | moondream | Ollama | `localhost:11434` | ★★ | ★★★ | 免费 | ★ | 无限 | ★☆☆☆☆ |

> 集成难度: ★ = 最容易（已实现），★★ = 改 baseUrl 即可，★★★+ = 需要新代码

---

## 每个 Provider 详情

### OpenAI

- **API 格式:** OpenAI 原生（`/v1/chat/completions`）
- **认证:** `Authorization: Bearer sk-xxx`
- **图片传输:** base64 data URI + URL 两种方式
- **请求格式:** `messages[].content[]` 数组，包含 `{type: "text"}` 和 `{type: "image_url"}` 对象
- **图片 Token 计算:**
  - Low detail: 固定 85 tokens（512x512 缩略图）
  - High detail: 按 32x32 patch 计算，1024x1024 约 765 tokens
- **限制:** 付费即可用，无免费额度；rate limit 按 tier 递增
- **RefBoard 现状:** **已实现** (`AiProviderKind::Openai`)

**定价详情 (USD/1M tokens):**

| Model | Input | Output | 上下文 |
|-------|-------|--------|--------|
| gpt-4o | $2.50 | $10.00 | 128K |
| gpt-4o-mini | $0.15 | $0.60 | 128K |
| gpt-4-turbo | $10.00 | $30.00 | 128K (legacy) |

**推荐模型:** `gpt-4o-mini` — 性价比最高，质量足够 RefBoard 打标签用途。

---

### Anthropic (Claude)

- **API 格式:** Anthropic 原生（`/v1/messages`），**非 OpenAI 兼容**
- **认证:** `x-api-key: sk-ant-xxx` + `anthropic-version: 2023-06-01`
- **图片传输:** 仅 base64（raw data，不带 data: 前缀）
- **请求格式:** `messages[].content[]` 数组，包含 `{type: "image", source: {type: "base64", ...}}` 和 `{type: "text"}`
- **图片 Token 计算:** `tokens = (width * height) / 750`，1024x1024 约 1400 tokens
- **限制:** 最多 100 张图/请求（API），20 张/请求（claude.ai）
- **RefBoard 现状:** **已实现** (`AiProviderKind::Anthropic`)

**定价详情 (USD/1M tokens):**

| Model | Input | Output | 上下文 |
|-------|-------|--------|--------|
| claude-sonnet-4-5 | $3.00 | $15.00 | 200K |
| claude-haiku-4-5 | $1.00 | $5.00 | 200K |
| claude-haiku-3-5 | $0.80 | $4.00 | 200K |
| claude-opus-4-5 | $5.00 | $25.00 | 200K |

**推荐模型:** `claude-haiku-4-5` — 速度快、中文好、视觉理解强。

---

### Google Gemini

- **API 格式:** OpenAI 兼容 endpoint 可用
- **认证:** `Authorization: Bearer GEMINI_API_KEY`（通过 OpenAI 兼容模式时）
- **Base URL:** `https://generativelanguage.googleapis.com/v1beta/openai/`
- **图片传输:** base64 data URI + URL
- **图片 Token 计算:** 每张图约 258 tokens（标准尺寸）
- **限制:** inline 数据限制 20MB/请求；免费额度极其慷慨
- **RefBoard 集成:** 可复用 OpenAI provider，仅改 `baseUrl` + `apiKey`

**定价详情 (USD/1M tokens):**

| Model | Input | Output | 免费额度 |
|-------|-------|--------|---------|
| gemini-2.0-flash | $0.10 | $0.40 | 1000次/天 |
| gemini-2.5-flash | $0.15 | $0.60 | 1000次/天 |
| gemini-2.5-pro | $1.25 | $10.00 | 50次/天 |
| gemini-2.5-flash-lite | $0.10 | $0.40 | 1000次/天 |

**推荐模型:** `gemini-2.0-flash` — 超便宜 + 免费额度 + OpenAI 兼容 = 最佳入门选择。

---

### Moonshot / Kimi

- **API 格式:** OpenAI 兼容
- **认证:** `Authorization: Bearer sk-xxx`
- **Base URL:** `https://api.moonshot.cn/v1`
- **图片传输:** base64 data URI + URL
- **中文能力:** 原生中文模型，中文输出最自然
- **限制:** 需充值激活（最低 $1）；图片需 URL 或 base64
- **RefBoard 集成:** 可复用 OpenAI provider，改 `baseUrl`

**定价详情 (USD/1M tokens):**

| Model | Input | Output | Context Caching |
|-------|-------|--------|----------------|
| kimi-k2.5 (multimodal) | $0.60 | $3.00 | $0.15 cached |
| kimi-k2 | $0.60 | $2.50 | $0.15 cached |
| moonshot-v1-8k | $0.20 | $2.00 | — |

**推荐模型:** `kimi-k2.5` — 中文打标签效果极佳，原生多模态。

---

### Qwen (Alibaba Cloud / 通义千问)

- **API 格式:** OpenAI 兼容 (DashScope)
- **认证:** `Authorization: Bearer sk-xxx`（DashScope API Key）
- **Base URL (国际):** `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- **Base URL (国内):** `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **图片传输:** base64 data URI + URL
- **中文能力:** 原生中文模型，中文理解顶尖
- **限制:** 国际版 1M 免费 tokens（90 天内）；国内版价格更低 70-85%
- **RefBoard 集成:** 可复用 OpenAI provider，改 `baseUrl`

**定价详情 — 国际版 (USD/1M tokens):**

| Model | Input | Output | 备注 |
|-------|-------|--------|------|
| qwen-vl-max | $0.80 | $3.20 | 旗舰模型，质量最高 |
| qwen-vl-plus | $0.21 | $0.63 | 性价比优秀 |
| qwen3-vl-flash | $0.05~$0.12 | $0.40~$0.96 | 超低价，阶梯定价 |
| qwen2.5-vl-72b | $2.80 | $8.40 | 开源模型最大规格 |
| qwen2.5-vl-7b | $0.35 | $1.05 | 轻量级 |

**推荐模型:** `qwen-vl-plus` — 中文最好 + 价格低 + OpenAI 兼容。

---

### DeepSeek

- **API 格式:** OpenAI 兼容
- **认证:** `Authorization: Bearer sk-xxx`
- **Base URL:** `https://api.deepseek.com`
- **图片传输:** base64 data URI
- **视觉支持:** DeepSeek V3 支持视觉输入（2026 年更新）；Janus Pro 7B 开源但需自部署
- **限制:** 官方 API 视觉支持有限；Janus Pro 主要通过 DeepInfra 等第三方托管
- **RefBoard 集成:** 可复用 OpenAI provider，但视觉支持需验证

**定价详情 (USD/1M tokens):**

| Model | Input | Output | 备注 |
|-------|-------|--------|------|
| deepseek-chat (V3) | $0.30 | $1.20 | 主力模型 |
| deepseek-reasoner (R1) | $0.70 | $2.50 | 推理增强 |
| Janus-Pro-7B (DeepInfra) | ~$0.20 | ~$0.20 | 第三方托管 |

**评估:** 视觉能力不是 DeepSeek 的强项，不推荐作为主力视觉 provider。

---

### Together AI

- **API 格式:** OpenAI 兼容
- **认证:** `Authorization: Bearer xxx`
- **Base URL:** `https://api.together.xyz/v1`
- **图片传输:** base64 data URI
- **特色:** 200+ 开源模型聚合平台，支持 Llama Vision、Qwen-VL 等
- **免费额度:** Llama 3.2 11B Vision 免费版可用
- **RefBoard 集成:** 可复用 OpenAI provider，改 `baseUrl`

**定价详情 (USD/1M tokens):**

| Model | Input | Output | 备注 |
|-------|-------|--------|------|
| Qwen3-VL-32B-Instruct | $0.50 | $1.50 | 视觉+中文 |
| Llama-Vision-Free (11B) | 免费 | 免费 | 有限制但免费 |

**推荐:** 适合原型开发和测试，免费 Llama Vision 可用于开发调试。

---

### Groq

- **API 格式:** OpenAI 兼容
- **认证:** `Authorization: Bearer gsk_xxx`
- **Base URL:** `https://api.groq.com/openai/v1`
- **图片传输:** base64 data URI + URL
- **特色:** 极速推理（LPU 加速），延迟极低
- **限制:** 单请求最多 5 张图；base64 最大 4MB；图片最大 33MP
- **免费额度:** 有免费 tier（低速率限制）
- **RefBoard 集成:** 可复用 OpenAI provider，改 `baseUrl`

**定价详情 (USD/1M tokens):**

| Model | Input | Output | 备注 |
|-------|-------|--------|------|
| Llama 4 Scout 17B | $0.11 | $0.34 | 视觉 + 工具调用 |
| Llama 4 Maverick 17B | $0.50 | $0.77 | 更强视觉 |

**推荐:** `llama-4-scout` — 超便宜 + 极速，适合批量分析。

---

### OpenRouter

- **API 格式:** OpenAI 兼容（聚合 200+ Provider）
- **认证:** `Authorization: Bearer sk-or-xxx`
- **Base URL:** `https://openrouter.ai/api/v1`
- **特色:** 一个 API Key 访问所有模型；透传原价不加价；自动路由和 fallback
- **RefBoard 集成:** 可复用 OpenAI provider，改 `baseUrl`。**最灵活的集成方式。**
- **RefBoard 已有测试:** `ai.rs` 中有单元测试验证 OpenRouter endpoint 配置

**使用方式:** 用户在 RefBoard 选择 `openai` provider，填入 OpenRouter 的 API key 和 base URL，即可使用任何模型。例如：
```json
{
  "provider": "openai",
  "apiKey": "sk-or-xxx",
  "endpoint": "https://openrouter.ai/api/v1",
  "model": "google/gemini-2.0-flash"
}
```

---

### Ollama (本地)

- **API 格式:** Ollama 原生（`/api/chat`），**非 OpenAI 兼容**
- **认证:** 无需认证
- **Base URL:** `http://localhost:11434`
- **图片传输:** 纯 base64（不带 data: 前缀，不带 MIME type）
- **可用模型:** llava, bakllava, moondream, llava-phi3, llava-llama3 等
- **限制:** 需用户自行安装 Ollama + 下载模型；GPU 加速需 Metal (macOS)
- **RefBoard 现状:** **已实现** (`AiProviderKind::Ollama`)

**模型对比:**

| Model | 大小 | 质量 | 速度 | 中文 | 适用场景 |
|-------|------|------|------|------|---------|
| llava 1.6 (13B) | 8GB | ★★★ | ★★ | ★★ | 通用视觉分析 |
| bakllava (7B) | 4.5GB | ★★★ | ★★★ | ★ | Mistral 基底 |
| moondream (1.8B) | 1GB | ★★ | ★★★★ | ★ | 边缘设备/快速预览 |
| llava-phi3 (3.8B) | 2.5GB | ★★ | ★★★★ | ★ | 轻量级 |

**推荐模型:** `llava` — 最成熟、社区支持最好。

---

## 推荐方案

### 性价比最高: Google Gemini 2.0 Flash

- **$0.18/千张**，且有 **1000 次/天免费额度**
- OpenAI 兼容，RefBoard 零代码改动
- 配置: `provider=openai`, `endpoint=https://generativelanguage.googleapis.com/v1beta/openai/`, `model=gemini-2.0-flash`

### 中文最好: Qwen VL Plus / Kimi K2.5

- **Qwen VL Plus** ($0.38/千张): 阿里原生中文模型，中文标签最准确
- **Kimi K2.5** ($1.20/千张): 月之暗面原生多模态，中文描述最自然
- 两者都 OpenAI 兼容，零代码改动

### 本地/免费首选: Ollama + LLaVA

- 完全本地运行，零成本，无隐私顾虑
- 已在 RefBoard 中实现
- 缺点: 需要 GPU，速度慢，中文能力弱

### RefBoard 默认推荐: GPT-4o-mini

- **$0.27/千张**，质量-价格平衡最好
- 已在 RefBoard 中实现，开箱即用
- 中英文都不错，JSON 输出稳定
- 用户群体最大，文档最多

---

## 集成建议

### 可直接复用 OpenAI Provider (仅改 baseUrl)

以下 provider 都使用 OpenAI 兼容 API，RefBoard 现有的 `OpenAIProvider` 代码无需修改，用户只需在设置中填写不同的 endpoint 和 API key：

| Provider | Base URL | 备注 |
|----------|----------|------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | 免费额度最多 |
| OpenRouter | `https://openrouter.ai/api/v1` | 一键接入 200+ 模型 |
| Together AI | `https://api.together.xyz/v1` | 开源模型聚合 |
| Groq | `https://api.groq.com/openai/v1` | 极速推理 |
| Qwen (DashScope) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 中文最好 |
| Moonshot/Kimi | `https://api.moonshot.cn/v1` | 中文多模态 |
| DeepSeek | `https://api.deepseek.com` | 便宜但视觉弱 |

### 需要独立适配

| Provider | 原因 |
|----------|------|
| Anthropic | 使用私有 API 格式（已实现） |
| Ollama | 使用私有 API 格式（已实现） |

### 建议的 UI 改进

1. **预设 Provider 列表:** 在 Settings > AI Vision 中提供下拉菜单，选择 provider 后自动填充 Base URL
2. **"自定义 OpenAI 兼容"选项:** 允许用户输入任意 base URL，覆盖更多长尾 provider
3. **连接测试按钮:** 已实现 (`cmd_test_ai_vision`)，保持现状即可
4. **模型建议:** 根据选择的 provider 显示推荐模型列表

### 推荐优先级 (RefBoard 默认)

1. **Ollama** — 检测到本地 Ollama 时自动推荐（免费、隐私）
2. **GPT-4o-mini** — 已有 OpenAI key 的用户默认选择
3. **Gemini 2.0 Flash** — 推荐给预算敏感用户（免费额度 + 超低价）
4. **Claude Haiku 4.5** — 推荐给追求质量的用户

---

## 参考来源

- [OpenAI API Pricing](https://platform.openai.com/docs/pricing)
- [OpenAI Vision Guide](https://platform.openai.com/docs/guides/images-vision)
- [Anthropic Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Gemini OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Alibaba Cloud Model Studio Pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [Moonshot / Kimi API Pricing](https://costgoat.com/pricing/kimi-api)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Together AI Pricing](https://www.together.ai/pricing)
- [Groq Pricing](https://groq.com/pricing)
- [Groq Vision Docs](https://console.groq.com/docs/vision)
- [OpenRouter Pricing](https://openrouter.ai/pricing)
- [Ollama Vision Models](https://ollama.com/search?c=vision)
- [PricePerToken.com](https://pricepertoken.com/)
