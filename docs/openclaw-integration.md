# OpenClaw Gateway Integration Guide

> Deco <-> OpenClaw Gateway API 对接文档

## 1. 概述

OpenClaw 是一个自托管的个人 AI 助手平台。其 Gateway 进程运行在本地（默认端口 **18789**），通过 WebSocket 和 HTTP 复用端口。它暴露了 **OpenAI 兼容的 `/v1/chat/completions` HTTP 端点**，可供 Deco 等外部应用调用。

本地安装确认运行在 `http://127.0.0.1:18789`，配置文件位于 `~/.openclaw/openclaw.json`。

---

## 2. API 端点

### `/v1/chat/completions` (OpenAI 兼容)

- **状态**: 存在但 **默认禁用**
- **启用后**: 接受与 OpenAI Chat Completions API 格式完全一致的 `POST` 请求
- **流式**: 支持 `"stream": true`（SSE 格式）

### 无 `/v1/embeddings` 端点

OpenClaw **不暴露**独立的 embeddings HTTP 端点。Embeddings 仅在内部用于记忆/检索。当前 `ai-provider.js` 中的 `OpenClawAdapter.embed()` 调用 `/v1/embeddings` **不会生效**。

### 无专用 vision 端点

没有单独的 vision 端点。Vision 通过标准 `/v1/chat/completions` 使用 OpenAI 多模态消息格式（content 数组 + `image_url` 对象）处理。是否支持取决于 agent 配置的底层模型。

---

## 3. 认证

OpenClaw 使用 **Bearer Token 认证**，即使在 localhost 上也需要。

Gateway token 来源（`~/.openclaw/openclaw.json`）：
```json5
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "<your-gateway-token>"
    }
  }
}
```

**Header 格式**：
```
Authorization: Bearer <your-gateway-token>
```

Token 也可以通过 `OPENCLAW_GATEWAY_TOKEN` 环境变量传入，或从 `<STATE_DIR>/gateway.token` 自动生成读取。

---

## 4. 启用 HTTP Chat Completions 端点

在 `~/.openclaw/openclaw.json` 的 `"gateway"` 对象中添加：

```json5
{
  "gateway": {
    // ... 已有的 port, mode, bind, auth 设置 ...
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  }
}
```

添加后重启 OpenClaw Gateway（或等待热重载）。

**验证**：
```bash
curl -sS http://127.0.0.1:18789/v1/chat/completions \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"model":"openclaw","messages":[{"role":"user","content":"hi"}]}'
```

如果返回 `405 Method Not Allowed`，说明端点未启用。

---

## 5. Agent/Model 选择

OpenClaw 使用 `model` 字段选择 **agent**（而非直接选择 LLM 模型）：

| model 值 | 效果 |
|----------|------|
| `"openclaw"` | 使用默认 agent |
| `"openclaw:main"` | 使用 `main` agent |
| `"agent:main"` | 同上 |

也可以用 header：`x-openclaw-agent-id: main`

Agent 再根据自身配置选择底层模型。

---

## 6. 请求/响应示例

### 文本对话 — curl

```bash
curl -sS http://127.0.0.1:18789/v1/chat/completions \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -H 'x-openclaw-agent-id: main' \
  -d '{
    "model": "openclaw",
    "messages": [{"role": "user", "content": "Describe an art deco poster style"}]
  }'
```

### 文本对话 — Node.js

```javascript
async function chatCompletion(messages) {
  const OPENCLAW_URL = 'http://127.0.0.1:18789/v1/chat/completions';
  const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

  const res = await fetch(OPENCLAW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'x-openclaw-agent-id': 'main',
    },
    body: JSON.stringify({ model: 'openclaw', messages }),
  });

  if (!res.ok) throw new Error(`OpenClaw API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
```

### 图片分析 — Node.js

```javascript
import { readFileSync } from 'node:fs';

async function analyzeImage(imagePath, prompt) {
  const OPENCLAW_URL = 'http://127.0.0.1:18789/v1/chat/completions';
  const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

  const imageData = readFileSync(imagePath).toString('base64');
  const ext = imagePath.split('.').pop().toLowerCase();
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const mime = mimeMap[ext] || 'image/jpeg';

  const res = await fetch(OPENCLAW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'x-openclaw-agent-id': 'main',
    },
    body: JSON.stringify({
      model: 'openclaw',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Describe this image. Return JSON with "description" and "tags".' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageData}` } },
        ],
      }],
    }),
  });

  if (!res.ok) throw new Error(`OpenClaw API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
```

### 流式请求 — curl

```bash
curl -N http://127.0.0.1:18789/v1/chat/completions \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -H 'x-openclaw-agent-id: main' \
  -d '{"model":"openclaw","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

---

## 7. 错误处理

| HTTP 状态 | 含义 | 处理 |
|-----------|------|------|
| **405 Method Not Allowed** | chatCompletions 端点未启用 | 在 config 中启用（见 Section 4） |
| **401 Unauthorized** | 缺少或无效的 bearer token | 检查 `Authorization: Bearer <token>` header |
| **429 Too Many Requests** | 速率限制（认证失败过多） | 遵守 `Retry-After` header，指数退避 |
| **500 / 502** | Agent 执行错误或模型 provider 问题 | 解析错误体，重试 |
| **Connection refused** | Gateway 未运行 | 启动 OpenClaw（`openclaw gateway start` 或 macOS app） |

---

## 8. ai-provider.js OpenClawAdapter 修复建议

当前 `OpenClawAdapter`（lib/ai-provider.js L158-207）的问题：

### 问题 1: 缺少认证 headers
Adapter 未发送 `Authorization: Bearer <token>` header。

### 问题 2: 缺少 `x-openclaw-agent-id` header
未指定 agent，默认使用 `main`。

### 问题 3: Embeddings 端点不存在
`embed()` 方法调用的 `/v1/embeddings` 在 OpenClaw 上不存在。

### 问题 4: Token 发现
Adapter 应能从 `~/.openclaw/openclaw.json` 或 `OPENCLAW_GATEWAY_TOKEN` 环境变量读取 token。

### 建议修改

```javascript
class OpenClawAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'http://localhost:18789';
    this.token = config.apiKey
      || config.token
      || process.env.OPENCLAW_GATEWAY_TOKEN
      || this._readGatewayToken();
    this.agentId = config.agentId || 'main';
  }

  _readGatewayToken() {
    try {
      const configPath = join(process.env.HOME, '.openclaw', 'openclaw.json');
      if (existsSync(configPath)) {
        const ocConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        return ocConfig?.gateway?.auth?.token || null;
      }
    } catch {}
    return null;
  }

  _headers() {
    const headers = { 'x-openclaw-agent-id': this.agentId };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async analyzeImage(imagePath, prompt) {
    // ... 使用 this._headers() 发送请求
  }

  async chat(messages) {
    // ... 使用 this._headers() 发送请求
  }

  async embed(_text) {
    throw new Error(
      'OpenClaw does not expose an embeddings HTTP endpoint. '
      + 'Configure an OpenAI or other embedding provider instead.'
    );
  }
}
```

---

## 9. Deco 接入清单

使用 OpenClaw 前的检查项：

1. **启用 HTTP 端点** — 添加 `gateway.http.endpoints.chatCompletions.enabled: true` 到 `~/.openclaw/openclaw.json`
2. **确保 Gateway 运行** — OpenClaw macOS app 或 `openclaw gateway` 必须启动
3. **配置 Gateway token** — 通过 `deco.json`、`OPENCLAW_GATEWAY_TOKEN` 环境变量、或自动从 `~/.openclaw/openclaw.json` 读取
4. **确保 vision 能力** — 默认 agent 使用支持 vision 的模型（如 `anthropic/claude-sonnet-4`）
5. **不使用 OpenClaw 做 embeddings** — 需要 embeddings 时使用单独的 provider

---

## 参考文档

- [OpenClaw OpenAI Chat Completions Docs](https://docs.openclaw.ai/gateway/openai-http-api)
- [OpenClaw Security / Auth Docs](https://docs.openclaw.ai/gateway/security)
- [OpenClaw Gateway Configuration](https://docs.openclaw.ai/gateway/configuration)
- [OpenClaw Model Providers](https://docs.openclaw.ai/concepts/model-providers)
