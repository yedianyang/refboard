# Research: Grounding DINO + SAM Integration

## Summary
Integrating Grounding DINO and SAM into the Deco Tauri app is feasible via ONNX Runtime (`ort` crate, already an indirect dependency through `fastembed`). Total model download ~440MB with FP16 quantization.

## ONNX Model Availability

### Grounding DINO (Swin-T)
- Community ONNX exports: `onnx-community/grounding-dino-tiny-ONNX` on HuggingFace
- Variants: FP32 (719MB), FP16 (360MB), INT8 (204MB), Q4F16 (151MB)
- ~200M parameters, accepts image + tokenized text, outputs 900 candidate boxes
- Recommended: FP16 at 360MB

### SAM (Segment Anything)
- Meta officially supports ONNX export
- Architecture split: Image Encoder (heavy, ~180MB FP16) + Mask Decoder (lightweight, ~16MB)
- SAM ViT-B: 93.7M params
- SAM2 variants available:

| Variant | Parameters | FPS (GPU) |
|---------|-----------|-----------|
| SAM2-Tiny | 38.9M | 91.2 |
| SAM2-Small | 46M | 84.8 |
| SAM2-Base+ | 80.8M | 64.1 |
| SAM2-Large | 224.4M | 39.5 |

Recommended: SAM2-Tiny (38.9M params, ~80MB FP16)

## Rust Integration: `ort` + ONNX (Recommended)

Already depends on `ort v2.0.0-rc.9` via `fastembed`. Just add as direct dependency:

```toml
ort = { version = "2.0.0-rc.9", features = ["coreml"] }
tokenizers = "0.20"  # BERT tokenizer for Grounding DINO
```

CoreML/ANE acceleration automatic on Apple Silicon.

### Performance Estimates (Apple Silicon)

| Model | M1 | M2 Pro | M3 Max |
|-------|-----|--------|--------|
| Grounding DINO (FP16) | ~200-400ms | ~100-200ms | ~50-100ms |
| SAM encoder (FP16) | ~300-500ms | ~150-300ms | ~80-150ms |
| SAM decoder (per prompt) | ~10-20ms | ~5-10ms | ~3-5ms |

## Alternative Approaches

| Approach | Detection Quality | Model Size | Rust Ready |
|----------|------------------|-----------|-----------|
| **Grounding DINO + SAM** | Best (48.4 mAP) | ~440-560MB | ONNX via ort |
| **YOLO-World + SAM** | Good (37-47 mAP) | ~200-300MB | ONNX via ort |
| **Florence-2 + SAM** | Good (34.7 mAP) | ~400MB+ | No Rust impl |

## Proposed API

```rust
pub struct Detection {
    pub label: String,
    pub score: f32,
    pub bbox: [f32; 4],  // normalized 0-1
}

pub struct SegmentationMask {
    pub bbox: [f32; 4],
    pub mask_rle: Vec<u32>,  // RLE encoded
    pub mask_area: u32,
    pub score: f32,
}

pub struct GroundedSegment {
    pub detection: Detection,
    pub mask: SegmentationMask,
}

// Tauri commands
cmd_detect_objects(image_path, text_prompt, box_threshold, text_threshold)
cmd_segment_object(image_path, bbox)
cmd_grounded_segment(image_path, text_prompt)
```

## Implementation Plan

1. Add `ort` + `tokenizers` as direct dependencies
2. Create `vision/` module: `grounding_dino.rs` + `sam.rs` + `mod.rs`
3. Implement pre/post-processing (tokenization, NMS, RLE encoding)
4. Lazy model download with progress indicator (same pattern as CLIP)
5. CoreML execution provider for Apple Silicon
6. Tauri commands + frontend integration
7. Settings UI for model selection

## References
- Grounding DINO: https://arxiv.org/abs/2303.05499
- SAM: https://arxiv.org/abs/2304.02643
- SAM2: https://arxiv.org/abs/2408.00714
- ONNX Grounding DINO: https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX
- ort crate: https://github.com/pykeio/ort
- candle SAM: https://github.com/huggingface/candle/tree/main/candle-examples/examples/segment-anything

Date: 2026-02-18
