# CLIP Inference Options for RefBoard 2.0 (Apple Silicon)

> Research date: 2026-02-14
> Decision: **`ort` + `fastembed-rs`** (ONNX Runtime native Rust with CoreML execution provider)

---

## Context

RefBoard 2.0 needs CLIP (Contrastive Language-Image Pre-training) to compute image embeddings for visual similarity search. The app is a Tauri 2.0 macOS desktop app targeting Apple Silicon. Zero-dependency distribution matters (open-source project).

---

## Options Evaluated

### Option 1: Candle (Pure Rust)

**Implementation**: Hugging Face's [candle](https://github.com/huggingface/candle) ML framework with a [CLIP example](https://github.com/huggingface/candle/tree/main/candle-examples/examples/clip). The `candle-transformers` crate includes CLIP ViT-B/32 support. Models loaded from safetensors via `hf-hub`.

**Maturity**: Good — 16k+ GitHub stars, 2M+ crate downloads, actively maintained by Hugging Face. CLIP example is less battle-tested than LLM inference paths.

| Metric | Value |
|--------|-------|
| Inference speed | ~10-30ms per image (Metal GPU) |
| GPU acceleration | Metal backend (`--features metal`) + Accelerate for CPU |
| Bundle size | ~20 MB binary + ~340 MB model weights |
| External dependencies | None |
| Integration code | ~300 LOC Rust |
| Packaging complexity | Low |

**Pros**: Smallest binary, pure Rust compilation, zero C/C++ dependencies.
**Cons**: More integration code, less mature docs, no Neural Engine access.

### Option 2: Python Sidecar

**Implementation**: [open-clip](https://github.com/mlfoundations/open_clip) or `transformers` via a PyInstaller-bundled Python process, using Tauri's [sidecar support](https://v2.tauri.app/develop/sidecar/).

**Maturity**: Excellent — reference implementations used across the ML ecosystem.

| Metric | Value |
|--------|-------|
| Inference speed | ~20-50ms per image (MPS GPU) |
| GPU acceleration | PyTorch MPS (Metal Performance Shaders) |
| Bundle size | **500 MB - 1 GB+** (PyInstaller + PyTorch) |
| External dependencies | None for user (bundled), but massive sidecar binary |
| Integration code | ~50 LOC Python + ~200 LOC Rust IPC |
| Packaging complexity | **High** (PyInstaller ARM64 quirks, codesigning every .dylib) |

**Pros**: Most mature ML ecosystem, reference implementation accuracy.
**Cons**: Disqualifying bundle size (500MB+), complex macOS ARM64 packaging.

### Option 3: WASM (ONNX Runtime Web)

**Implementation**: [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) with pre-converted ONNX CLIP models. [openai-clip-js](https://github.com/josephrocca/openai-clip-js) provides a reference.

**Maturity**: Moderate — ONNX Runtime Web is production-quality (Microsoft), but CLIP-specific JS wrappers are community projects. Quantized model accuracy concerns noted by maintainers.

| Metric | Value |
|--------|-------|
| Inference speed | **~300-500ms per image** (WASM CPU only) |
| GPU acceleration | **Blocked** — WebGPU unavailable in Tauri's WKWebView ([issue #6381](https://github.com/tauri-apps/tauri/issues/6381)) |
| Bundle size | ~20 MB WASM + 152-600 MB model |
| External dependencies | None |
| Integration code | ~50 LOC JavaScript |
| Packaging complexity | Low |

**Pros**: Simplest integration, runs in WebView.
**Cons**: 10x slower than native (no GPU), WebGPU blocked in WKWebView — dead on arrival.

### Option 4: `ort` + `fastembed-rs` (ONNX Runtime native Rust with CoreML) -- SELECTED

**Implementation**: [`ort` crate](https://github.com/pykeio/ort) (2k+ stars, v2.0.0-rc.11) wraps ONNX Runtime for Rust with CoreML execution provider. [`fastembed-rs`](https://github.com/Anush008/fastembed-rs) provides a high-level CLIP ViT-B/32 embedding API with automatic model downloading from [Qdrant/clip-ViT-B-32-vision](https://huggingface.co/Qdrant/clip-ViT-B-32-vision).

**Maturity**: Good — `ort` approaching stable 2.0, ONNX Runtime is production-grade from Microsoft. `fastembed-rs` actively maintained.

| Metric | Value |
|--------|-------|
| Inference speed | ~15-40ms per image (CoreML + Neural Engine) |
| GPU acceleration | CoreML EP dispatches to CPU, GPU, and **Apple Neural Engine** |
| Bundle size | ~50 MB runtime + 152-600 MB model |
| External dependencies | None |
| Integration code | **~50 LOC Rust** |
| Packaging complexity | Moderate (bundle `libonnxruntime.dylib`, codesign) |

**Pros**: Best Apple Silicon performance (Neural Engine), minimal code via fastembed-rs, ONNX model portability.
**Cons**: CoreML EP requires building ONNX Runtime from source or finding pre-built CoreML binaries. CPU-only fallback (~80-120ms) still acceptable.

**Integration example:**
```rust
use fastembed::{ImageEmbedding, ImageInitOptions, ImageEmbeddingModel};

let model = ImageEmbedding::try_new(
    ImageInitOptions::new(ImageEmbeddingModel::ClipVitB32)
)?;
let embeddings = model.embed(images, None)?;
```

### Option 5: CoreML Direct via Swift Bridge — REJECTED

Native Swift CoreML would give the best possible performance, but Tauri 2 [only supports Swift plugins on iOS, not macOS](https://github.com/tauri-apps/tauri/issues/12137). Rust-to-CoreML bridging crates (`coreml-rs`, `candle-coreml`) are experimental. The `ort` crate's CoreML EP achieves the same acceleration without maintaining a custom Swift bridge.

---

## Comparison Matrix

| Criterion | Candle (Rust) | Python Sidecar | WASM (ORT Web) | **ort + CoreML** |
|---|---|---|---|---|
| Inference speed | ~10-30ms (Metal) | ~20-50ms (MPS) | ~300-500ms (CPU) | **~15-40ms (ANE)** |
| GPU/ANE accel | Metal | MPS | No (blocked) | **CoreML + ANE** |
| Bundle size | ~20 MB + 340 MB | 500 MB - 1 GB+ | ~20 MB + 152-600 MB | ~50 MB + 152-600 MB |
| Zero dependencies | Yes | Yes (bundled) | Yes | Yes |
| Packaging complexity | Low | High | Low | Moderate |
| Integration code | ~300 LOC | ~250 LOC | ~50 LOC | **~50 LOC** |
| ViT-B/32 support | Yes | Yes | Yes | Yes (ONNX) |
| Batch processing | Good | Good | Poor | Good |
| Maturity | Good (HF) | Excellent | Good (MS) | Good |

---

## Decision

**`ort` + `fastembed-rs`** selected for RefBoard 2.0 because:

1. **Best performance ceiling** — CoreML dispatches to Apple Neural Engine, the fastest inference path on Apple Silicon
2. **Minimal integration effort** — `fastembed-rs` provides turnkey CLIP in ~10 lines of Rust with automatic model downloading
3. **Clean distribution** — zero external dependencies, bundles into Tauri .app
4. **ONNX portability** — easy to swap models (MobileCLIP, SigLIP) via the ONNX ecosystem
5. **CPU fallback** — even without CoreML EP, CPU-only prebuilt binaries deliver ~80-120ms/image (acceptable)

**Fallback plan**: If CoreML EP build complexity proves too painful, use Candle with Metal backend (~10-30ms/image, pure Rust, simpler build).

---

## Sources

- [huggingface/candle](https://github.com/huggingface/candle)
- [Candle CLIP example](https://github.com/huggingface/candle/tree/main/candle-examples/examples/clip)
- [GarthDB/metal-candle](https://github.com/GarthDB/metal-candle) — Metal backend benchmarks
- [pykeio/ort](https://github.com/pykeio/ort) — ONNX Runtime Rust bindings
- [ort documentation](https://ort.pyke.io/perf/execution-providers)
- [Anush008/fastembed-rs](https://github.com/Anush008/fastembed-rs)
- [Qdrant/clip-ViT-B-32-vision](https://huggingface.co/Qdrant/clip-ViT-B-32-vision) — Pre-converted ONNX model
- [ONNX Runtime CoreML EP](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- [Tauri WebGPU issue #6381](https://github.com/tauri-apps/tauri/issues/6381)
- [Tauri Sidecar docs](https://v2.tauri.app/develop/sidecar/)
- [openai-clip-js](https://github.com/josephrocca/openai-clip-js)
- [CLIP-ONNX benchmarks](https://github.com/Lednik7/CLIP-ONNX/blob/main/benchmark.md)
- [Queryable (MobileCLIP iOS)](https://github.com/mazzzystar/Queryable)
- [CLIP-Finder2](https://github.com/fguzman82/CLIP-Finder2)
- [apple/coreml-mobileclip](https://huggingface.co/apple/coreml-mobileclip)
- [Tauri Swift macOS plugin issue #12137](https://github.com/tauri-apps/tauri/issues/12137)

*Last updated: 2026-02-14*
