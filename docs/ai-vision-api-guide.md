# AI Vision API Integration Guide for Rust (Deco 2.0)

> Rust code examples for calling vision APIs from the Tauri backend.
> Covers Anthropic Claude, OpenAI GPT-4o, and Ollama local models.

---

## Table of Contents

1. [Rust HTTP Client Setup](#1-rust-http-client-setup)
2. [Shared Types](#2-shared-types)
3. [Anthropic Claude Vision](#3-anthropic-claude-vision)
4. [OpenAI GPT-4o Vision](#4-openai-gpt-4o-vision)
5. [Ollama Local Vision](#5-ollama-local-vision)
6. [Structured JSON Output](#6-structured-json-output)
7. [Provider Abstraction Trait](#7-provider-abstraction-trait)
8. [Analysis Prompt](#8-analysis-prompt)
9. [Tauri Command Integration](#9-tauri-command-integration)
10. [Trade-offs & Recommendations](#10-trade-offs--recommendations)

---

## 1. Rust HTTP Client Setup

### Recommendation: `reqwest` via `tauri-plugin-http`

Tauri 2 ships an HTTP plugin that re-exports `reqwest`. This is the best choice:

- Already compatible with Tauri's async runtime (Tokio)
- Handles TLS via the system's native stack (no extra OpenSSL bundling on macOS)
- Zero additional binary size — the plugin is likely needed for frontend HTTP anyway
- Full async/await support, streaming, JSON serialization via serde

**Alternatives considered:**

| Crate | Pros | Cons | Verdict |
|-------|------|------|---------|
| `tauri-plugin-http` (reqwest) | Native Tauri integration, async, TLS built-in | Adds ~1.5 MB to binary | **Use this** |
| `reqwest` (standalone) | Same as above | Possible TLS conflicts with Tauri plugin | Avoid if using the plugin |
| `ureq` | Blocking, simple, tiny binary | No async — blocks Tauri IPC thread | Not suitable |
| `hyper` | Low-level, fast | Too much boilerplate for simple API calls | Overkill |

### Cargo.toml

```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-fs = "2"
tauri-plugin-http = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.22"
tokio = { version = "1", features = ["fs"] }
```

### Plugin Registration

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())  // <-- enables reqwest re-export
        .invoke_handler(tauri::generate_handler![
            // ... commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Using reqwest from Rust

```rust
use tauri_plugin_http::reqwest;

// The plugin re-exports reqwest — use it directly:
let client = reqwest::Client::new();

let resp = client
    .post("https://api.anthropic.com/v1/messages")
    .header("x-api-key", api_key)
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("HTTP error: {e}"))?;

let data: serde_json::Value = resp
    .json()
    .await
    .map_err(|e| format!("JSON parse error: {e}"))?;
```

---

## 2. Shared Types

These types represent the unified analysis output from any provider, matching the PRD Section 4.2 spec.

```rust
use serde::{Deserialize, Serialize};

/// Unified analysis result returned by all AI providers.
/// Maps to PRD Section 4.2 "Analysis output per image".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub description: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub style: Vec<String>,
    #[serde(default)]
    pub mood: Vec<String>,
    #[serde(default)]
    pub colors: Vec<String>,
    #[serde(default)]
    pub era: Option<String>,
}

/// AI provider configuration stored in project settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderConfig {
    pub provider: AiProviderKind,
    pub api_key: Option<String>,
    #[serde(default = "default_endpoint")]
    pub endpoint: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProviderKind {
    Anthropic,
    Openai,
    Ollama,
}

fn default_endpoint() -> String {
    "https://api.anthropic.com/v1".to_string()
}

/// Helper: read an image file and return (base64_data, mime_type)
fn encode_image(path: &std::path::Path) -> Result<(String, String), String> {
    use base64::Engine as _;

    let bytes = std::fs::read(path)
        .map_err(|e| format!("Cannot read image {}: {e}", path.display()))?;

    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    let mime = match ext.as_str() {
        "png"          => "image/png",
        "gif"          => "image/gif",
        "webp"         => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        _              => "image/jpeg",
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok((b64, mime.to_string()))
}
```

---

## 3. Anthropic Claude Vision

### API Reference

- **Endpoint:** `POST https://api.anthropic.com/v1/messages`
- **Auth header:** `x-api-key: <key>`
- **Version header:** `anthropic-version: 2023-06-01`
- **Models:** `claude-sonnet-4-5-20250929` (recommended for vision — fast, capable, cost-effective), `claude-opus-4-6` (highest quality)
- **Image format:** base64 in a structured `source` block (NOT a data URI)
- **Supported media types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- **Limits:** 5 MB per image (API), max 100 images per request, 8000x8000 px max

### Key difference from OpenAI

Anthropic uses `{ "type": "image", "source": { "type": "base64", "media_type": "...", "data": "..." } }` — **not** a `data:` URI in an `image_url` field.

### Request Types

```rust
use serde::Serialize;

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum AnthropicContent {
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
    #[serde(rename = "text")]
    Text { text: String },
}

#[derive(Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,   // always "base64"
    media_type: String,    // e.g. "image/jpeg"
    data: String,          // raw base64 string (no data: prefix)
}
```

### Response Types

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseBlock>,
    model: String,
    usage: AnthropicUsage,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum AnthropicResponseBlock {
    #[serde(rename = "text")]
    Text { text: String },
}

#[derive(Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}
```

### Complete Example

```rust
use tauri_plugin_http::reqwest;

async fn analyze_with_anthropic(
    client: &reqwest::Client,
    api_key: &str,
    image_path: &std::path::Path,
    prompt: &str,
) -> Result<AnalysisResult, String> {
    let (b64_data, mime) = encode_image(image_path)?;

    let body = AnthropicRequest {
        model: "claude-sonnet-4-5-20250929".to_string(),
        max_tokens: 1024,
        system: None,
        messages: vec![AnthropicMessage {
            role: "user".to_string(),
            content: vec![
                AnthropicContent::Image {
                    source: AnthropicImageSource {
                        source_type: "base64".to_string(),
                        media_type: mime,
                        data: b64_data,
                    },
                },
                AnthropicContent::Text {
                    text: prompt.to_string(),
                },
            ],
        }],
    };

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({status}): {text}"));
    }

    let result: AnthropicResponse = resp
        .json()
        .await
        .map_err(|e| format!("Anthropic response parse error: {e}"))?;

    // Extract text content
    let text = result.content.iter()
        .find_map(|block| match block {
            AnthropicResponseBlock::Text { text } => Some(text.clone()),
        })
        .unwrap_or_default();

    parse_analysis_json(&text)
}
```

---

## 4. OpenAI GPT-4o Vision

### API Reference

- **Endpoint:** `POST https://api.openai.com/v1/chat/completions`
- **Auth header:** `Authorization: Bearer <key>`
- **Models:** `gpt-4o` (recommended), `gpt-4o-mini` (cheaper, still good vision)
- **Image format:** data URI string in `image_url.url` field: `"data:image/jpeg;base64,<data>"`
- **Limits:** 20 MB per image (base64), multiple images per message

### Key difference from Anthropic

OpenAI uses `{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }` — a data URI embedded in a URL field. Anthropic separates the base64 data, media type, and source type into distinct fields.

### Request Types

```rust
use serde::Serialize;

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: Vec<OpenAIContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum OpenAIContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAIImageUrl },
}

#[derive(Serialize)]
struct OpenAIImageUrl {
    url: String,   // "data:image/jpeg;base64,<base64_data>"
}
```

### Response Types

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Deserialize)]
struct OpenAIResponseMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}
```

### Complete Example

```rust
use tauri_plugin_http::reqwest;

async fn analyze_with_openai(
    client: &reqwest::Client,
    api_key: &str,
    image_path: &std::path::Path,
    prompt: &str,
) -> Result<AnalysisResult, String> {
    let (b64_data, mime) = encode_image(image_path)?;
    let data_uri = format!("data:{mime};base64,{b64_data}");

    let body = OpenAIRequest {
        model: "gpt-4o".to_string(),
        max_tokens: 1024,
        messages: vec![OpenAIMessage {
            role: "user".to_string(),
            content: vec![
                OpenAIContent::Text {
                    text: prompt.to_string(),
                },
                OpenAIContent::ImageUrl {
                    image_url: OpenAIImageUrl { url: data_uri },
                },
            ],
        }],
    };

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({status}): {text}"));
    }

    let result: OpenAIResponse = resp
        .json()
        .await
        .map_err(|e| format!("OpenAI response parse error: {e}"))?;

    let text = result.choices
        .first()
        .and_then(|c| c.message.content.clone())
        .unwrap_or_default();

    parse_analysis_json(&text)
}
```

---

## 5. Ollama Local Vision

### API Reference

- **Endpoint:** `POST http://localhost:11434/api/chat` (chat) or `/api/generate` (single-turn)
- **No auth required** (local server)
- **Models:** `llava` (7b/13b/34b), `llama3.2-vision`, `moondream`
- **Image format:** array of raw base64 strings in `images` field (NOT data URIs)
- **JSON mode:** set `"format": "json"` to constrain output to valid JSON

### Key differences

- Images go in an `images: [...]` array on the message, not in a content block
- Base64 strings are raw (no `data:` prefix, no mime type wrapper)
- The `format: "json"` parameter forces the model to output valid JSON

### Request Types (Chat Endpoint)

```rust
use serde::Serialize;

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,   // "json" for structured output
}

#[derive(Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,  // raw base64 strings (no data: prefix)
}
```

### Response Types

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaResponseMessage,
    done: bool,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    eval_duration: Option<u64>,
}

#[derive(Deserialize)]
struct OllamaResponseMessage {
    role: String,
    content: String,
}
```

### Complete Example

```rust
use tauri_plugin_http::reqwest;

async fn analyze_with_ollama(
    client: &reqwest::Client,
    endpoint: &str,   // e.g. "http://localhost:11434"
    model: &str,      // e.g. "llava"
    image_path: &std::path::Path,
    prompt: &str,
) -> Result<AnalysisResult, String> {
    let (b64_data, _mime) = encode_image(image_path)?;
    // Ollama takes raw base64 — no data: URI wrapper, no mime type

    let body = OllamaChatRequest {
        model: model.to_string(),
        stream: false,   // wait for complete response
        format: Some("json".to_string()),
        messages: vec![OllamaMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
            images: Some(vec![b64_data]),
        }],
    };

    let resp = client
        .post(format!("{endpoint}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama API error ({status}): {text}"));
    }

    let result: OllamaChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Ollama response parse error: {e}"))?;

    parse_analysis_json(&result.message.content)
}

/// Check if Ollama is running locally.
async fn check_ollama_available(client: &reqwest::Client, endpoint: &str) -> bool {
    client.get(format!("{endpoint}/api/tags"))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}
```

### Ollama Embeddings

Ollama also supports embeddings via `/api/embed` (useful for vector similarity search):

```rust
#[derive(Serialize)]
struct OllamaEmbedRequest {
    model: String,        // e.g. "nomic-embed-text" or "mxbai-embed-large"
    input: Vec<String>,   // texts to embed
}

#[derive(Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

async fn compute_embedding_ollama(
    client: &reqwest::Client,
    endpoint: &str,
    model: &str,
    text: &str,
) -> Result<Vec<f32>, String> {
    let body = OllamaEmbedRequest {
        model: model.to_string(),
        input: vec![text.to_string()],
    };

    let resp = client
        .post(format!("{endpoint}/api/embed"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama embed failed: {e}"))?;

    let result: OllamaEmbedResponse = resp
        .json()
        .await
        .map_err(|e| format!("Ollama embed parse error: {e}"))?;

    result.embeddings.into_iter().next()
        .ok_or_else(|| "No embedding returned".to_string())
}
```

---

## 6. Structured JSON Output

All three providers need to return consistent `AnalysisResult` JSON. The strategies differ:

### Approach Comparison

| Provider | Best strategy | Reliability |
|----------|--------------|-------------|
| Anthropic | Prompt-based JSON (or structured outputs beta for Sonnet 4.5/Opus 4.1) | High — Claude follows JSON instructions well |
| OpenAI | `response_format: { type: "json_object" }` | High — enforced at token level |
| Ollama | `"format": "json"` parameter | Medium — depends on model quality |

### OpenAI JSON Mode

Add `response_format` to the request:

```rust
#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<OpenAIResponseFormat>,
}

#[derive(Serialize)]
struct OpenAIResponseFormat {
    #[serde(rename = "type")]
    format_type: String,  // "json_object"
}

// Usage:
let body = OpenAIRequest {
    model: "gpt-4o".to_string(),
    max_tokens: 1024,
    response_format: Some(OpenAIResponseFormat {
        format_type: "json_object".to_string(),
    }),
    messages: vec![/* ... */],
};
```

### Shared JSON Parser

All providers use the same fallback parser to extract `AnalysisResult` from model output:

```rust
/// Parse the AI model's text response into a structured AnalysisResult.
/// Handles both clean JSON and JSON embedded in markdown/text.
fn parse_analysis_json(text: &str) -> Result<AnalysisResult, String> {
    // Try direct parse first
    if let Ok(result) = serde_json::from_str::<AnalysisResult>(text) {
        return Ok(result);
    }

    // Try extracting JSON from markdown code block: ```json ... ```
    if let Some(start) = text.find("```json") {
        let json_start = start + 7;
        if let Some(end) = text[json_start..].find("```") {
            let json_str = text[json_start..json_start + end].trim();
            if let Ok(result) = serde_json::from_str::<AnalysisResult>(json_str) {
                return Ok(result);
            }
        }
    }

    // Try extracting first { ... } block
    if let Some(start) = text.find('{') {
        // Find the matching closing brace
        let mut depth = 0;
        let mut end = start;
        for (i, ch) in text[start..].char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = start + i + 1;
                        break;
                    }
                }
                _ => {}
            }
        }
        let json_str = &text[start..end];
        if let Ok(result) = serde_json::from_str::<AnalysisResult>(json_str) {
            return Ok(result);
        }
    }

    // Last resort: wrap plain text as description with empty tags
    Ok(AnalysisResult {
        description: text.to_string(),
        tags: Vec::new(),
        style: Vec::new(),
        mood: Vec::new(),
        colors: Vec::new(),
        era: None,
    })
}
```

---

## 7. Provider Abstraction Trait

A trait-based abstraction lets the Tauri commands work with any provider:

```rust
use std::path::Path;

/// Trait for AI vision providers. All providers must implement image analysis.
#[async_trait::async_trait]
pub trait AiVisionProvider: Send + Sync {
    /// Analyze an image and return structured metadata.
    async fn analyze_image(
        &self,
        image_path: &Path,
        prompt: &str,
    ) -> Result<AnalysisResult, String>;

    /// Provider display name (for UI).
    fn name(&self) -> &str;
}
```

> **Note:** The `async_trait` crate is needed because async fns in traits are not
> yet fully stabilized with dyn dispatch. Add `async-trait = "0.1"` to Cargo.toml.

### Provider Implementations

```rust
pub struct AnthropicProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "claude-sonnet-4-5-20250929".to_string()),
        }
    }
}

#[async_trait::async_trait]
impl AiVisionProvider for AnthropicProvider {
    async fn analyze_image(&self, image_path: &Path, prompt: &str) -> Result<AnalysisResult, String> {
        analyze_with_anthropic(&self.client, &self.api_key, image_path, prompt).await
    }
    fn name(&self) -> &str { "Claude Vision" }
}

// -------

pub struct OpenAIProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "gpt-4o".to_string()),
        }
    }
}

#[async_trait::async_trait]
impl AiVisionProvider for OpenAIProvider {
    async fn analyze_image(&self, image_path: &Path, prompt: &str) -> Result<AnalysisResult, String> {
        analyze_with_openai(&self.client, &self.api_key, image_path, prompt).await
    }
    fn name(&self) -> &str { "GPT-4o Vision" }
}

// -------

pub struct OllamaProvider {
    client: reqwest::Client,
    endpoint: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(endpoint: Option<String>, model: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            endpoint: endpoint.unwrap_or_else(|| "http://localhost:11434".to_string()),
            model: model.unwrap_or_else(|| "llava".to_string()),
        }
    }
}

#[async_trait::async_trait]
impl AiVisionProvider for OllamaProvider {
    async fn analyze_image(&self, image_path: &Path, prompt: &str) -> Result<AnalysisResult, String> {
        analyze_with_ollama(&self.client, &self.endpoint, &self.model, image_path, prompt).await
    }
    fn name(&self) -> &str { "Ollama (Local)" }
}
```

### Factory Function

```rust
/// Create the appropriate AI provider from configuration.
pub fn create_provider(config: &AiProviderConfig) -> Result<Box<dyn AiVisionProvider>, String> {
    match config.provider {
        AiProviderKind::Anthropic => {
            let key = config.api_key.clone()
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or("No Anthropic API key configured")?;
            Ok(Box::new(AnthropicProvider::new(key, config.model.clone())))
        }
        AiProviderKind::Openai => {
            let key = config.api_key.clone()
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or("No OpenAI API key configured")?;
            Ok(Box::new(OpenAIProvider::new(key, config.model.clone())))
        }
        AiProviderKind::Ollama => {
            Ok(Box::new(OllamaProvider::new(
                Some(config.endpoint.clone()),
                config.model.clone(),
            )))
        }
    }
}
```

---

## 8. Analysis Prompt

The same prompt works across all providers. It instructs the model to return consistent structured JSON matching `AnalysisResult`.

```rust
/// The system/analysis prompt for image analysis.
/// Replicates the v1 prompt from lib/ai-provider.js but adds style/mood/colors/era fields.
pub const ANALYSIS_PROMPT: &str = r#"Analyze this image for a visual reference board. Return ONLY a JSON object with these fields:

{
  "description": "A concise 1-2 sentence description of the image",
  "tags": ["tag1", "tag2", "tag3"],
  "style": ["style-descriptor1", "style-descriptor2"],
  "mood": ["mood1", "mood2"],
  "colors": ["#hex1", "#hex2", "#hex3"],
  "era": "time period or null"
}

Guidelines:
- tags: 3-8 lowercase hyphenated keywords (e.g. "art-deco", "bronze-sculpture")
- style: visual style descriptors (e.g. "geometric", "minimalist", "organic")
- mood: emotional/atmospheric qualities (e.g. "elegant", "energetic", "serene")
- colors: 2-5 dominant hex color codes from the image
- era: approximate time period if identifiable, or null
- Return ONLY the JSON object, no other text"#;
```

### Context-Aware Prompt (U8: tag suggestions reference existing board tags)

```rust
/// Build a context-aware prompt that references existing board tags.
/// This enables PRD user story U8: AI tag suggestions are context-aware.
pub fn build_analysis_prompt(existing_tags: &[String]) -> String {
    if existing_tags.is_empty() {
        return ANALYSIS_PROMPT.to_string();
    }

    let tag_list = existing_tags.join(", ");
    format!(
        r#"{ANALYSIS_PROMPT}

The board already uses these tags: [{tag_list}]
Prefer reusing existing tags when they apply. Only introduce new tags for concepts not covered."#
    )
}
```

---

## 9. Tauri Command Integration

### Tauri Command (IPC entry point)

```rust
use std::path::PathBuf;

/// Analyze a single image using the configured AI provider.
/// Called from frontend via: invoke('analyze_image', { imagePath, provider })
#[tauri::command]
async fn analyze_image(
    image_path: String,
    provider_config: AiProviderConfig,
    existing_tags: Vec<String>,
) -> Result<AnalysisResult, String> {
    let provider = create_provider(&provider_config)?;
    let prompt = build_analysis_prompt(&existing_tags);
    let path = PathBuf::from(&image_path);

    provider.analyze_image(&path, &prompt).await
}
```

### Register the Command

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            scan_images,
            read_metadata,
            write_metadata,
            create_project,
            list_projects,
            analyze_image,    // <-- new AI command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Frontend Invocation (JavaScript)

```javascript
// From the PixiJS canvas UI:
const result = await invoke('analyze_image', {
  imagePath: '/path/to/image.jpg',
  providerConfig: {
    provider: 'anthropic',
    apiKey: settings.anthropicKey,
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5-20250929',
  },
  existingTags: board.getAllTags(),
});
// result: { description, tags, style, mood, colors, era }
```

---

## 10. Trade-offs & Recommendations

### Provider Comparison for Deco

| Aspect | Anthropic Claude | OpenAI GPT-4o | Ollama (Local) |
|--------|-----------------|---------------|----------------|
| **Quality** | Excellent vision analysis, strong at art/design vocabulary | Excellent, broad knowledge | Good with llava-13b+, weaker on nuance |
| **Speed** | ~2-4s per image | ~2-4s per image | ~5-15s per image (depends on hardware) |
| **Cost** | ~$0.004/image (Sonnet) | ~$0.005/image (4o) | Free (local compute) |
| **Privacy** | Cloud — images sent to API | Cloud — images sent to API | Fully local, offline capable |
| **JSON reliability** | High (follows instructions well) | High (json_object mode enforced) | Medium (depends on model) |
| **Setup** | API key only | API key only | Ollama installed + model pulled |

### Recommendations

1. **Default to Anthropic Claude Sonnet** for cloud users — best quality/cost ratio for visual analysis, strong art/design vocabulary.

2. **Default to Ollama with `llava:13b`** for local users — best balance of quality and speed for consumer hardware. Suggest `llama3.2-vision` as alternative.

3. **Use `reqwest` via `tauri-plugin-http`** — no extra binary size, native TLS, full async support.

4. **Always use `stream: false` for Ollama** — simplifies response handling. Streaming adds complexity for a single analysis call with no UX benefit.

5. **Cache the `reqwest::Client`** — reuse a single client instance across calls for connection pooling. Consider storing it in Tauri's managed state:

    ```rust
    use std::sync::Arc;
    use tauri::Manager;

    struct AppState {
        http_client: reqwest::Client,
    }

    // In run():
    let state = AppState {
        http_client: reqwest::Client::new(),
    };
    tauri::Builder::default()
        .manage(Arc::new(state))
        // ...
    ```

6. **Provider selection logic** (matches PRD Section 5.4):
   - If user has cloud API key configured → use cloud provider
   - Else if Ollama is running locally → use Ollama
   - Else → prompt user to configure a provider

### Additional Cargo.toml Dependencies (Final)

```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-fs = "2"
tauri-plugin-http = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.22"
async-trait = "0.1"
```

---

## Appendix: Raw API Request/Response Examples

### Anthropic — curl

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "messages": [{
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQ..."
          }
        },
        {
          "type": "text",
          "text": "Analyze this image..."
        }
      ]
    }]
  }'
```

### OpenAI — curl

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 1024,
    "response_format": { "type": "json_object" },
    "messages": [{
      "role": "user",
      "content": [
        { "type": "text", "text": "Analyze this image..." },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQ..."
          }
        }
      ]
    }]
  }'
```

### Ollama — curl

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llava",
  "stream": false,
  "format": "json",
  "messages": [{
    "role": "user",
    "content": "Analyze this image...",
    "images": ["/9j/4AAQ..."]
  }]
}'
```
