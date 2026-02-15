# MiniMax AI Vision Research — RefBoard Integration Assessment

> Date: 2026-02-15
> Researcher: RefBoard Research Agent

---

## 1. Summary

MiniMax offers viable vision/multimodal models for image analysis at significantly lower cost than Anthropic and OpenAI. The **MiniMax-VL-01** (vision-language) and **MiniMax-Text-01** models support image understanding via a standard chat completions API with base64-encoded images. Pricing is **$0.20/M input + $1.10/M output tokens** — roughly **5-15x cheaper** than Claude Sonnet and **comparable to GPT-4o mini**. However, there are trade-offs in documentation quality, ecosystem maturity, and the non-standard image input format.

---

## 2. Model Landscape

### Available Vision-Capable Models

| Model | Parameters | Vision | Context | Released |
|-------|-----------|--------|---------|----------|
| **MiniMax-VL-01** | 456B (45.9B active) | Yes — ViT-MLP-LLM | 1M tokens | Jan 2025 |
| **MiniMax-Text-01** | 456B (45.9B active) | Yes (via docs) | 4M tokens | Jan 2025 |
| **MiniMax-M2.5** | 230B (10B active) | **No** — text only | 205K tokens | 2025 |
| **MiniMax-M2.1** | 230B (10B active) | **No** — text only | 200K tokens | 2025 |
| **MiniMax-M2** | — | **No** — text only | 200K tokens | 2025 |

**Key finding:** Only the **MiniMax-01 series** (VL-01 and Text-01) supports image input. The newer M2/M2.5 series are text-only despite marketing language about "native multimodal" capabilities (which refers to the broader MiniMax platform, not those specific models).

### VL-01 Architecture

- **Vision Transformer (ViT):** 303M parameters, trained on 694M image-caption pairs
- **MLP Projector:** 2-layer, bridges vision encoder to LLM
- **Base LLM:** MiniMax-Text-01 with Lightning Attention
- **Dynamic Resolution:** 336x336 to 2016x2016, with thumbnail preservation
- **Training:** 512B vision-language tokens across 4 stages

---

## 3. Pricing Comparison

### Per-Token Pricing (USD per 1M tokens)

| Provider / Model | Input | Output | Vision Support |
|-----------------|-------|--------|---------------|
| **MiniMax-VL-01** | $0.20 | $1.10 | Yes |
| **MiniMax-Text-01** | $0.20 | $1.10 | Yes |
| MiniMax-M2.5 | $0.30 | $1.20 | No |
| MiniMax-M2.1 | $0.27 | $0.95 | No |
| **GPT-4o mini** | $0.15 | $0.60 | Yes |
| **GPT-4o** | $2.50 | $10.00 | Yes |
| **Claude Haiku 4.5** | $1.00 | $5.00 | Yes |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | Yes |
| **Claude Opus 4.5** | $5.00 | $25.00 | Yes |

### Cost Analysis for RefBoard Use Case

Typical image analysis call (1 image + prompt → description + tags):
- Input: ~1,500 tokens (image ~1,200 + prompt ~300)
- Output: ~300 tokens (description + tags + style)

**Cost per image analysis:**

| Provider | Cost per Image | vs MiniMax VL-01 |
|----------|---------------|-----------------|
| MiniMax-VL-01 | **$0.00063** | baseline |
| GPT-4o mini | $0.00040 | 0.6x (cheaper) |
| GPT-4o | $0.00675 | 10.7x more |
| Claude Haiku 4.5 | $0.00300 | 4.8x more |
| Claude Sonnet 4.5 | $0.00900 | 14.3x more |

**Batch analysis (500 images):**

| Provider | Total Cost |
|----------|-----------|
| MiniMax-VL-01 | **$0.32** |
| GPT-4o mini | **$0.20** |
| GPT-4o | $3.38 |
| Claude Haiku 4.5 | $1.50 |
| Claude Sonnet 4.5 | $4.50 |

---

## 4. API Availability & Integration

### Endpoint

```
POST https://api.minimax.io/v1/chat/completions
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### Image Input Format (Non-Standard)

MiniMax uses a **proprietary inline format** for images, not the OpenAI-compatible `image_url` structure:

```python
import base64

with open("image.jpg", "rb") as f:
    img_base64 = base64.b64encode(f.read()).decode("utf-8")

payload = {
    "model": "MiniMax-Text-01",  # or "MiniMax-VL-01"
    "messages": [
        {
            "role": "system",
            "content": "You are an art reference analyst..."
        },
        {
            "role": "user",
            "content": f"Analyze this image: [Image base64:{img_base64}]"
        }
    ]
}
```

**Important:** The `[Image base64:{...}]` syntax is embedded directly in the text content string. This differs from OpenAI/Anthropic's structured `content` array with `type: "image_url"` objects.

### Third-Party Access

MiniMax-01 is also available on **OpenRouter** at the same pricing ($0.20/$1.10), which provides a standard OpenAI-compatible API format — potentially simplifying integration.

### Authentication

- API key from [platform.minimax.io](https://platform.minimax.io)
- Free tier available with signup
- Bearer token authentication

---

## 5. Image Analysis Capabilities

### Benchmark Performance (VL-01)

| Benchmark | Score | Category |
|-----------|-------|----------|
| DocVQA | 96.4% | Document understanding |
| ChartQA | 91.7% | Chart/diagram analysis |
| AI2D | 91.7% | Science diagram understanding |
| MMMU | 68.5% | Multi-discipline knowledge |
| MMMU-Pro | 52.7% | Advanced multi-discipline |
| MathVista | 68.6% | Mathematical reasoning |
| OCRBench | 865 | Text recognition in images |
| MEGA-Bench | 47.4% | General comprehension |

### RefBoard-Relevant Capabilities

Based on benchmarks and architecture:

| Capability | Assessment | Notes |
|-----------|-----------|-------|
| **Image description** | Good | Trained on 694M caption pairs |
| **Style detection** | Likely good | General visual understanding, but untested for art styles |
| **Tag generation** | Good | Strong general comprehension |
| **Color extraction** | Possible | Not specifically benchmarked |
| **Text in images** | Excellent | OCRBench 865, DocVQA 96.4% |
| **Art style classification** | Unknown | No art-specific benchmarks; needs testing |
| **Similar image reasoning** | N/A | No embedding endpoint available |

### Limitations

1. **No embedding endpoint** — MiniMax does not expose a `/v1/embeddings` API, so it cannot be used for CLIP-like similarity search. RefBoard must continue using a separate embedding provider.
2. **Art/design-specific quality unknown** — Benchmarks focus on documents, charts, and general knowledge. No published benchmarks for art style, color palette, or design element recognition.
3. **Non-standard image format** — The `[Image base64:...]` inline syntax requires a custom adapter, not compatible with existing OpenAI-format providers.

---

## 6. Rate Limits

### Text API (applies to VL-01)

| Metric | Limit |
|--------|-------|
| RPM (Requests/min) | 500 |
| TPM (Tokens/min) | 20,000,000 |

### Notes

- Free tier: reported as 1,000 requests/day, 100 RPM
- Paid tier: up to 500 RPM, 20M TPM
- Enterprise: custom limits via api@minimax.io
- No separate vision-specific rate limits documented
- Image generation (separate service): 10 RPM

For RefBoard's use case (analyzing images one at a time or in small batches), these limits are more than sufficient.

---

## 7. Documentation Quality

| Aspect | Rating | Notes |
|--------|--------|-------|
| API reference | Fair | Basic endpoint docs, missing some details |
| Code examples | Fair | Python examples for vision, but limited |
| Model comparison | Poor | Confusing which models support vision |
| Error handling | Poor | Limited error code documentation |
| SDKs | Poor | No official Node.js/Rust SDK |
| Community | Small | Primarily Chinese-language community |
| OpenRouter docs | Good | Standard OpenAI-compatible format |

**Overall documentation quality: 4/10** — Functional but significantly behind Anthropic (9/10) and OpenAI (9/10). The marketing conflates "MiniMax platform multimodal" with individual model capabilities, making it hard to determine which models actually support image input.

---

## 8. Recommendations for RefBoard

### Should RefBoard add MiniMax as an AI Provider?

**Verdict: Yes, but as a low-priority option via OpenRouter.**

### Recommended Approach

1. **Primary vision provider: GPT-4o mini** ($0.15/$0.60)
   - Cheapest per-image cost
   - Best documentation and SDK support
   - Standard OpenAI API format (already supported by RefBoard)
   - Sufficient quality for description + tagging

2. **Quality provider: Claude Haiku 4.5** ($1.00/$5.00)
   - Best subjective quality for art/design analysis
   - Anthropic API (already supported by RefBoard)
   - 5x more expensive but noticeably better for nuanced style detection

3. **Budget alternative: MiniMax-VL-01 via OpenRouter** ($0.20/$1.10)
   - Access through OpenRouter's OpenAI-compatible API
   - No custom adapter needed if using OpenRouter
   - Good fallback when primary providers are unavailable

### Integration Strategy

| Approach | Effort | Benefit |
|----------|--------|---------|
| **A) OpenRouter adapter** | Low | Access MiniMax + 100 other models via standard OpenAI format |
| **B) Direct MiniMax adapter** | Medium | Custom `[Image base64:...]` format, separate auth |
| **C) Skip MiniMax entirely** | None | GPT-4o mini is cheaper anyway |

**Recommendation: Option A** — Add an OpenRouter adapter to `ai-provider.js`. This gives access to MiniMax-VL-01 plus dozens of other vision models (Gemini, Llama, Mistral, etc.) through a single integration.

### What NOT to Do

- Don't build a custom MiniMax adapter for the proprietary image format — it's not worth the maintenance burden
- Don't use MiniMax for embeddings — they don't offer an embeddings endpoint
- Don't rely on M2.5 for vision — it's text-only despite the "multimodal" marketing

---

## 9. Competitive Positioning

```
                    Quality
                      ^
                      |
  Claude Sonnet 4.5   |   Claude Opus 4.5
         ●            |        ●
                      |
  GPT-4o  ●           |
                      |
  Claude Haiku 4.5 ●  |
                      |
  MiniMax VL-01  ●    |
                      |
  GPT-4o mini  ●      |
                      |
  ──────────────────────────────────> Cost
  $0.15/M                        $5.00/M
```

MiniMax-VL-01 sits between GPT-4o mini and Claude Haiku in both cost and quality. For RefBoard, GPT-4o mini offers better value unless MiniMax's specific strengths (1M context, OCR) are needed.

---

## 10. References

- [MiniMax Platform — Models](https://platform.minimax.io/docs/guides/models-intro)
- [MiniMax Platform — Pricing](https://platform.minimax.io/docs/guides/pricing)
- [MiniMax Platform — Rate Limits](https://platform.minimax.io/docs/guides/rate-limits)
- [MiniMax-VL-01 Model Card (GitHub)](https://github.com/MiniMax-AI/MiniMax-01/blob/main/MiniMax-VL-01-Model-Card.md)
- [MiniMax-VL-01 on HuggingFace](https://huggingface.co/MiniMaxAI/MiniMax-VL-01)
- [MiniMax-01 on OpenRouter](https://openrouter.ai/minimax/minimax-01)
- [MiniMax Photo Recognition API Example](https://platform.minimax.io/docs/solutions/learning)
- [MiniMax-01 arXiv Paper](https://arxiv.org/abs/2501.08313)
- [Anthropic Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Token Price Comparison](https://pricepertoken.com/pricing-page/provider/minimax)
