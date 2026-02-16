//! AI Vision provider abstraction and analysis pipeline.
//!
//! Supports three providers:
//! - **Anthropic Claude** — cloud vision via Claude Sonnet/Opus
//! - **OpenAI GPT-4o** — cloud vision via GPT-4o
//! - **Ollama** — local vision via LLaVA or similar models
//!
//! Each provider implements `AiVisionProvider` and returns a unified
//! `AnalysisResult` struct matching the PRD Section 4.2 spec.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

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

/// AI provider configuration stored in ~/.deco/config.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub provider: AiProviderKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AiProviderKind {
    Anthropic,
    Openai,
    Ollama,
}

impl AiProviderKind {
    /// Default API endpoint for each provider.
    fn default_endpoint(&self) -> &str {
        match self {
            AiProviderKind::Anthropic => "https://api.anthropic.com/v1",
            AiProviderKind::Openai => "https://api.openai.com/v1",
            AiProviderKind::Ollama => "http://localhost:11434",
        }
    }
}

impl Default for AiProviderConfig {
    fn default() -> Self {
        Self {
            provider: AiProviderKind::Anthropic,
            api_key: None,
            endpoint: None,
            model: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Analysis Prompt
// ---------------------------------------------------------------------------

/// The analysis prompt for image analysis.
const ANALYSIS_PROMPT: &str = r##"Analyze this image for a visual reference board. Return ONLY a JSON object with these fields:

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
- Return ONLY the JSON object, no other text"##;

/// Build a context-aware prompt that references existing board tags.
/// Enables PRD user story U8: AI tag suggestions are context-aware.
fn build_analysis_prompt(existing_tags: &[String]) -> String {
    if existing_tags.is_empty() {
        return ANALYSIS_PROMPT.to_string();
    }

    let tag_list = existing_tags.join(", ");
    format!(
        "{ANALYSIS_PROMPT}\n\nThe board already uses these tags: [{tag_list}]\nPrefer reusing existing tags when they apply. Only introduce new tags for concepts not covered."
    )
}

// ---------------------------------------------------------------------------
// Image Encoding
// ---------------------------------------------------------------------------

/// Read an image file and return (base64_data, mime_type).
fn encode_image(path: &Path) -> Result<(String, String), String> {
    use base64::Engine as _;

    let bytes = std::fs::read(path)
        .map_err(|e| format!("Cannot read image {}: {e}", path.display()))?;

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "image/jpeg",
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok((b64, mime.to_string()))
}

// ---------------------------------------------------------------------------
// JSON Response Parser
// ---------------------------------------------------------------------------

/// Parse the AI model's text response into a structured AnalysisResult.
/// Handles clean JSON, JSON in markdown code blocks, and embedded JSON.
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

    // Try extracting first { ... } block with brace matching
    if let Some(start) = text.find('{') {
        let mut depth = 0i32;
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

    // Last resort: wrap plain text as description with empty metadata
    Ok(AnalysisResult {
        description: text.to_string(),
        tags: Vec::new(),
        style: Vec::new(),
        mood: Vec::new(),
        colors: Vec::new(),
        era: None,
    })
}

// ---------------------------------------------------------------------------
// Provider Trait
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Anthropic Provider
// ---------------------------------------------------------------------------

pub struct AnthropicProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
    endpoint: String,
}

impl AnthropicProvider {
    pub fn new(client: reqwest::Client, api_key: String, model: Option<String>, endpoint: String) -> Self {
        Self {
            client,
            api_key,
            model: model.unwrap_or_else(|| "claude-sonnet-4-5-20250929".to_string()),
            endpoint,
        }
    }
}

// Anthropic request types
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
    source_type: String,
    media_type: String,
    data: String,
}

// Anthropic response types
#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseBlock>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum AnthropicResponseBlock {
    #[serde(rename = "text")]
    Text { text: String },
}

#[async_trait::async_trait]
impl AiVisionProvider for AnthropicProvider {
    async fn analyze_image(
        &self,
        image_path: &Path,
        prompt: &str,
    ) -> Result<AnalysisResult, String> {
        let (b64_data, mime) = encode_image(image_path)?;

        let body = AnthropicRequest {
            model: self.model.clone(),
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

        let url = format!("{}/messages", self.endpoint.trim_end_matches('/'));
        let resp = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {e}"))?;

        let status = resp.status();
        let content_len = resp.content_length().unwrap_or(0);
        crate::log::log("AI", &format!("Response received: {status}, {content_len} bytes"));

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error ({status}): {text}"));
        }

        let result: AnthropicResponse = resp
            .json()
            .await
            .map_err(|e| format!("Anthropic response parse error: {e}"))?;

        let text = result
            .content
            .iter()
            .find_map(|block| match block {
                AnthropicResponseBlock::Text { text } => Some(text.clone()),
            })
            .unwrap_or_default();

        parse_analysis_json(&text)
    }

    fn name(&self) -> &str {
        "Claude Vision"
    }
}

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

pub struct OpenAIProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
    endpoint: String,
}

impl OpenAIProvider {
    pub fn new(client: reqwest::Client, api_key: String, model: Option<String>, endpoint: String) -> Self {
        Self {
            client,
            api_key,
            model: model.unwrap_or_else(|| "gpt-4o".to_string()),
            endpoint,
        }
    }
}

// OpenAI request types
#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<OpenAIResponseFormat>,
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
    url: String,
}

#[derive(Serialize)]
struct OpenAIResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

// OpenAI response types
#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Deserialize)]
struct OpenAIResponseMessage {
    content: Option<String>,
}

#[async_trait::async_trait]
impl AiVisionProvider for OpenAIProvider {
    async fn analyze_image(
        &self,
        image_path: &Path,
        prompt: &str,
    ) -> Result<AnalysisResult, String> {
        let (b64_data, mime) = encode_image(image_path)?;
        let data_uri = format!("data:{mime};base64,{b64_data}");

        let body = OpenAIRequest {
            model: self.model.clone(),
            max_tokens: 1024,
            response_format: Some(OpenAIResponseFormat {
                format_type: "json_object".to_string(),
            }),
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

        let url = format!("{}/chat/completions", self.endpoint.trim_end_matches('/'));
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {e}"))?;

        let status = resp.status();
        let content_len = resp.content_length().unwrap_or(0);
        crate::log::log("AI", &format!("Response received: {status}, {content_len} bytes"));

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({status}): {text}"));
        }

        let result: OpenAIResponse = resp
            .json()
            .await
            .map_err(|e| format!("OpenAI response parse error: {e}"))?;

        let text = result
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        parse_analysis_json(&text)
    }

    fn name(&self) -> &str {
        "GPT-4o Vision"
    }
}

// ---------------------------------------------------------------------------
// Ollama Provider
// ---------------------------------------------------------------------------

pub struct OllamaProvider {
    client: reqwest::Client,
    endpoint: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(client: reqwest::Client, endpoint: Option<String>, model: Option<String>) -> Self {
        Self {
            client,
            endpoint: endpoint.unwrap_or_else(|| "http://localhost:11434".to_string()),
            model: model.unwrap_or_else(|| "llava".to_string()),
        }
    }
}

// Ollama request types
#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
}

#[derive(Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
}

// Ollama response types
#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaResponseMessage,
}

#[derive(Deserialize)]
struct OllamaResponseMessage {
    content: String,
}

#[async_trait::async_trait]
impl AiVisionProvider for OllamaProvider {
    async fn analyze_image(
        &self,
        image_path: &Path,
        prompt: &str,
    ) -> Result<AnalysisResult, String> {
        let (b64_data, _mime) = encode_image(image_path)?;
        // Ollama takes raw base64 -- no data: URI wrapper, no mime type

        let body = OllamaChatRequest {
            model: self.model.clone(),
            stream: false,
            format: Some("json".to_string()),
            messages: vec![OllamaMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
                images: Some(vec![b64_data]),
            }],
        };

        let resp = self
            .client
            .post(format!("{}/api/chat", self.endpoint))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {e}"))?;

        let status = resp.status();
        let content_len = resp.content_length().unwrap_or(0);
        crate::log::log("AI", &format!("Response received: {status}, {content_len} bytes"));

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama API error ({status}): {text}"));
        }

        let result: OllamaChatResponse = resp
            .json()
            .await
            .map_err(|e| format!("Ollama response parse error: {e}"))?;

        parse_analysis_json(&result.message.content)
    }

    fn name(&self) -> &str {
        "Ollama (Local)"
    }
}

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

/// Create the appropriate AI provider from configuration.
fn create_provider(
    client: &reqwest::Client,
    config: &AiProviderConfig,
) -> Result<Box<dyn AiVisionProvider>, String> {
    // Resolve endpoint: use configured value or provider-specific default.
    let endpoint = config
        .endpoint
        .clone()
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| config.provider.default_endpoint().to_string());

    match config.provider {
        AiProviderKind::Anthropic => {
            let key = config
                .api_key
                .clone()
                .or_else(|| crate::keyring::get_secret(crate::keyring::AI_API_KEY))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or("No Anthropic API key configured. Set it in settings or ANTHROPIC_API_KEY env var.")?;
            Ok(Box::new(AnthropicProvider::new(
                client.clone(),
                key,
                config.model.clone(),
                endpoint,
            )))
        }
        AiProviderKind::Openai => {
            let key = config
                .api_key
                .clone()
                .or_else(|| crate::keyring::get_secret(crate::keyring::AI_API_KEY))
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or("No OpenAI API key configured. Set it in settings or OPENAI_API_KEY env var.")?;
            Ok(Box::new(OpenAIProvider::new(
                client.clone(),
                key,
                config.model.clone(),
                endpoint,
            )))
        }
        AiProviderKind::Ollama => Ok(Box::new(OllamaProvider::new(
            client.clone(),
            Some(endpoint),
            config.model.clone(),
        ))),
    }
}

// ---------------------------------------------------------------------------
// Config Persistence (~/.deco/config.json)
// ---------------------------------------------------------------------------

/// Full app config file structure.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    #[serde(default)]
    ai: Option<AiProviderConfig>,
}

fn config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    Path::new(&home).join(".deco").join("config.json")
}

fn load_app_config() -> AppConfig {
    let path = config_path();
    if !path.exists() {
        return AppConfig::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create config directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Cannot serialize config: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Cannot write config: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Analyze a single image and optionally save results to search DB.
/// Core logic shared by the Tauri command and batch analysis.
async fn do_analyze_image(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    image_path: &str,
    provider_config: &AiProviderConfig,
    existing_tags: &[String],
    project_path: Option<&str>,
) -> Result<AnalysisResult, String> {
    let filename = Path::new(image_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| image_path.to_string());
    let provider_name = format!("{:?}", provider_config.provider);

    crate::log::log("AI", &format!("Analyzing image: {filename} (provider: {provider_name})"));

    let provider = create_provider(client, provider_config)?;
    let prompt = build_analysis_prompt(existing_tags);
    let path = PathBuf::from(image_path);

    if !path.exists() {
        return Err(format!("Image file not found: {image_path}"));
    }

    let _ = app.emit("ai:analysis:start", image_path);

    let result = provider.analyze_image(&path, &prompt).await;

    match &result {
        Ok(analysis) => {
            let tag_count = analysis.tags.len();
            let desc_preview: String = analysis.description.chars().take(50).collect();
            crate::log::log("AI", &format!(
                "Analysis complete: {tag_count} tags, description: {desc_preview}..."
            ));

            // Auto-save to search DB if project_path is provided
            if let Some(proj) = project_path {
                let meta = crate::search::ImageMetadataRow {
                    image_path: image_path.to_string(),
                    name: filename.clone(),
                    description: Some(analysis.description.clone()),
                    tags: analysis.tags.clone(),
                    style: analysis.style.clone(),
                    mood: analysis.mood.clone(),
                    colors: analysis.colors.clone(),
                    era: analysis.era.clone(),
                };
                if let Err(e) = crate::search::update_image_metadata(proj, &meta) {
                    crate::log::log("AI", &format!("Warning: failed to save metadata to DB: {e}"));
                }
            }

            let _ = app.emit("ai:analysis:complete", image_path);
        }
        Err(e) => {
            crate::log::log("AI", &format!("Error: {e}"));
            let _ = app.emit("ai:analysis:error", e.as_str());
        }
    }

    result
}

/// Analyze a single image using the configured AI provider.
/// Called from frontend via: invoke('analyze_image', { imagePath, providerConfig, existingTags, projectPath })
#[tauri::command]
pub async fn analyze_image(
    app: tauri::AppHandle,
    image_path: String,
    provider_config: AiProviderConfig,
    existing_tags: Vec<String>,
    project_path: Option<String>,
) -> Result<AnalysisResult, String> {
    let provider_name = format!("{:?}", provider_config.provider);
    let model_name = provider_config.model.clone().unwrap_or_else(|| "default".to_string());
    crate::log::log("AI", &format!("Provider config: {provider_name} / {model_name}"));

    let client = reqwest::Client::new();
    do_analyze_image(
        &app,
        &client,
        &image_path,
        &provider_config,
        &existing_tags,
        project_path.as_deref(),
    )
    .await
}

/// Batch analysis result for a single image.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchAnalysisItem {
    pub image_path: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<AnalysisResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Batch analysis progress event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchProgress {
    current: usize,
    total: usize,
    image_path: String,
}

/// Analyze multiple images sequentially, emitting progress events.
#[tauri::command]
pub async fn cmd_analyze_batch(
    app: tauri::AppHandle,
    image_paths: Vec<String>,
    project_path: String,
    provider_config: AiProviderConfig,
    existing_tags: Vec<String>,
) -> Result<Vec<BatchAnalysisItem>, String> {
    let total = image_paths.len();
    let client = reqwest::Client::new();
    let mut results = Vec::with_capacity(total);

    // Collect tags as we go so later images benefit from earlier results
    let mut running_tags = existing_tags;

    for (i, img_path) in image_paths.iter().enumerate() {
        let _ = app.emit("ai:batch:progress", BatchProgress {
            current: i + 1,
            total,
            image_path: img_path.clone(),
        });

        match do_analyze_image(
            &app,
            &client,
            img_path,
            &provider_config,
            &running_tags,
            Some(&project_path),
        )
        .await
        {
            Ok(analysis) => {
                // Add new tags to running set for context-aware prompts
                for tag in &analysis.tags {
                    if !running_tags.contains(tag) {
                        running_tags.push(tag.clone());
                    }
                }
                results.push(BatchAnalysisItem {
                    image_path: img_path.clone(),
                    success: true,
                    result: Some(analysis),
                    error: None,
                });
            }
            Err(e) => {
                crate::log::log("AI", &format!("Batch error for {img_path}: {e}"));
                results.push(BatchAnalysisItem {
                    image_path: img_path.clone(),
                    success: false,
                    result: None,
                    error: Some(e),
                });
            }
        }
    }

    let _ = app.emit("ai:batch:complete", &results);
    Ok(results)
}

/// Get the current AI provider configuration.
#[tauri::command]
pub fn get_ai_config() -> Result<AiProviderConfig, String> {
    let mut config = load_app_config().ai.unwrap_or_default();

    // Hydrate api_key: Keychain → env var → None
    if config.api_key.is_none() {
        config.api_key = crate::keyring::get_secret(crate::keyring::AI_API_KEY);
    }
    if config.api_key.is_none() {
        let env_var = match config.provider {
            AiProviderKind::Anthropic => "ANTHROPIC_API_KEY",
            AiProviderKind::Openai => "OPENAI_API_KEY",
            AiProviderKind::Ollama => return Ok(config),
        };
        config.api_key = std::env::var(env_var).ok();
    }

    Ok(config)
}

/// Save AI provider configuration.
/// API key is stored in macOS Keychain, not in config.json.
#[tauri::command]
pub fn set_ai_config(config: AiProviderConfig) -> Result<(), String> {
    // Store API key in Keychain (if provided)
    if let Some(ref key) = config.api_key {
        if !key.is_empty() {
            crate::keyring::set_secret(crate::keyring::AI_API_KEY, key)?;
        }
    } else {
        let _ = crate::keyring::delete_secret(crate::keyring::AI_API_KEY);
    }

    // Save config WITHOUT api_key to JSON
    let mut sanitized = config;
    sanitized.api_key = None;

    let mut app_config = load_app_config();
    app_config.ai = Some(sanitized);
    save_app_config(&app_config)
}

/// Check if Ollama is available locally.
#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    let client = reqwest::Client::new();
    let available = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    Ok(available)
}

/// Test AI provider connection by sending a small text prompt.
/// Returns a success message with the model's reply, or an error.
#[tauri::command]
pub async fn cmd_test_ai_vision(
    provider_config: AiProviderConfig,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Cannot create HTTP client: {e}"))?;

    let endpoint = provider_config
        .endpoint
        .clone()
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| provider_config.provider.default_endpoint().to_string());
    let base = endpoint.trim_end_matches('/');

    match provider_config.provider {
        AiProviderKind::Anthropic => {
            let key = provider_config
                .api_key
                .clone()
                .or_else(|| crate::keyring::get_secret(crate::keyring::AI_API_KEY))
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
                .ok_or("No API key configured")?;
            let model = provider_config
                .model
                .unwrap_or_else(|| "claude-sonnet-4-5-20250929".to_string());

            let body = AnthropicRequest {
                model,
                max_tokens: 20,
                system: None,
                messages: vec![AnthropicMessage {
                    role: "user".to_string(),
                    content: vec![AnthropicContent::Text {
                        text: "Reply with exactly one word: OK".to_string(),
                    }],
                }],
            };

            let resp = client
                .post(format!("{base}/messages"))
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Connection failed: {e}"))?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("API error ({status}): {text}"));
            }

            let result: AnthropicResponse = resp
                .json()
                .await
                .map_err(|e| format!("Response parse error: {e}"))?;

            let text = result
                .content
                .iter()
                .find_map(|b| match b {
                    AnthropicResponseBlock::Text { text } => Some(text.clone()),
                })
                .unwrap_or_default();

            Ok(format!("Connection successful. Model replied: {text}"))
        }
        AiProviderKind::Openai => {
            let key = provider_config
                .api_key
                .clone()
                .or_else(|| crate::keyring::get_secret(crate::keyring::AI_API_KEY))
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or("No API key configured")?;
            let model = provider_config
                .model
                .unwrap_or_else(|| "gpt-4o".to_string());

            // Use simple JSON body (text-only, no vision) to test connection
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 20,
                "messages": [{"role": "user", "content": "Reply with exactly one word: OK"}]
            });

            let resp = client
                .post(format!("{base}/chat/completions"))
                .header("Authorization", format!("Bearer {key}"))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Connection failed: {e}"))?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("API error ({status}): {text}"));
            }

            let result: OpenAIResponse = resp
                .json()
                .await
                .map_err(|e| format!("Response parse error: {e}"))?;

            let text = result
                .choices
                .first()
                .and_then(|c| c.message.content.clone())
                .unwrap_or_default();

            Ok(format!("Connection successful. Model replied: {text}"))
        }
        AiProviderKind::Ollama => {
            let resp = client
                .get(format!("{base}/api/tags"))
                .send()
                .await
                .map_err(|e| format!("Cannot connect to Ollama at {base}: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("Ollama returned status {}", resp.status()));
            }

            let model = provider_config
                .model
                .unwrap_or_else(|| "llava".to_string());

            #[derive(Deserialize)]
            struct OllamaTagsResponse {
                models: Vec<OllamaModelInfo>,
            }
            #[derive(Deserialize)]
            struct OllamaModelInfo {
                name: String,
            }

            let tags: OllamaTagsResponse = resp
                .json()
                .await
                .map_err(|e| format!("Cannot parse Ollama response: {e}"))?;

            let available = tags.models.iter().any(|m| m.name.starts_with(&model));
            if available {
                Ok(format!("Connection successful. Model '{model}' is available."))
            } else {
                let names: Vec<_> = tags.models.iter().map(|m| m.name.as_str()).collect();
                Ok(format!(
                    "Connected to Ollama but model '{model}' not found. Available: {}",
                    names.join(", ")
                ))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Image Generation
// ---------------------------------------------------------------------------

/// Result returned from image generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerateResult {
    pub path: String,
    pub filename: String,
    pub width: u32,
    pub height: u32,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revised_prompt: Option<String>,
}

// OpenAI Images API response types
#[derive(Deserialize)]
struct ImageGenResponse {
    data: Vec<ImageGenData>,
}

#[derive(Deserialize)]
struct ImageGenData {
    url: Option<String>,
    #[serde(default)]
    revised_prompt: Option<String>,
}

/// Build a generation prompt that incorporates reference image metadata.
fn build_generation_prompt(
    user_prompt: &str,
    reference_paths: &[String],
    project_path: &str,
) -> String {
    let mut context_parts: Vec<String> = Vec::new();

    for ref_path in reference_paths {
        if let Ok(Some(meta)) = crate::search::get_image_metadata(project_path, ref_path) {
            let mut desc = Vec::new();
            if let Some(ref d) = meta.description {
                desc.push(d.clone());
            }
            if !meta.style.is_empty() {
                desc.push(format!("Style: {}", meta.style.join(", ")));
            }
            if !meta.mood.is_empty() {
                desc.push(format!("Mood: {}", meta.mood.join(", ")));
            }
            if !meta.tags.is_empty() {
                desc.push(format!("Tags: {}", meta.tags.join(", ")));
            }
            if let Some(ref era) = meta.era {
                desc.push(format!("Era: {era}"));
            }
            if !desc.is_empty() {
                context_parts.push(format!("[Reference: {}] {}", meta.name, desc.join(". ")));
            }
        }
    }

    if context_parts.is_empty() {
        return user_prompt.to_string();
    }

    format!(
        "Using these reference images as inspiration:\n{}\n\nGenerate: {}",
        context_parts.join("\n"),
        user_prompt
    )
}

/// Parse size string into (width, height). Defaults to 1024x1024.
fn parse_size(size: &str) -> (u32, u32) {
    match size {
        "1792x1024" => (1792, 1024),
        "1024x1792" => (1024, 1792),
        "512x512" => (512, 512),
        "256x256" => (256, 256),
        _ => (1024, 1024),
    }
}

/// Generate images using OpenAI-compatible Images API (DALL-E 3, etc).
#[tauri::command]
pub async fn cmd_generate_image(
    app: tauri::AppHandle,
    prompt: String,
    reference_paths: Vec<String>,
    project_path: String,
    model: Option<String>,
    size: Option<String>,
    count: Option<u32>,
) -> Result<Vec<ImageGenerateResult>, String> {
    let ai_config = load_app_config().ai.unwrap_or_default();

    let api_key = ai_config
        .api_key
        .clone()
        .or_else(|| crate::keyring::get_secret(crate::keyring::AI_API_KEY))
        .or_else(|| std::env::var("OPENAI_API_KEY").ok())
        .ok_or("No API key configured for image generation. Configure it in Settings > AI.")?;

    // Resolve endpoint — generation always uses OpenAI-compatible API
    let endpoint = ai_config
        .endpoint
        .clone()
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| AiProviderKind::Openai.default_endpoint().to_string());
    let base = endpoint.trim_end_matches('/');

    let gen_model = model.unwrap_or_else(|| "dall-e-3".to_string());
    let gen_size = size.unwrap_or_else(|| "1024x1024".to_string());
    let gen_count = count.unwrap_or(1).min(4).max(1);
    let (width, height) = parse_size(&gen_size);

    // Build prompt with reference context
    let full_prompt = build_generation_prompt(&prompt, &reference_paths, &project_path);
    crate::log::log("AI", &format!(
        "Generating {gen_count} image(s) with {gen_model}, size: {gen_size}"
    ));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Cannot create HTTP client: {e}"))?;

    let _ = app.emit("ai:generate:start", serde_json::json!({
        "prompt": prompt,
        "model": gen_model,
        "count": gen_count,
    }));

    // Create output directory
    let gen_dir = Path::new(&project_path).join("images").join("generated");
    std::fs::create_dir_all(&gen_dir)
        .map_err(|e| format!("Cannot create generated images dir: {e}"))?;

    let mut results = Vec::new();

    // DALL-E 3 only supports n=1, so loop for multiple images
    for i in 0..gen_count {
        let body = serde_json::json!({
            "model": gen_model,
            "prompt": full_prompt,
            "n": 1,
            "size": gen_size,
            "response_format": "url",
        });

        let resp = client
            .post(format!("{base}/images/generations"))
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Image generation request failed: {e}"))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Image generation API error ({status}): {text}"));
        }

        let gen_resp: ImageGenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Cannot parse generation response: {e}"))?;

        for item in &gen_resp.data {
            let url = item.url.as_deref()
                .ok_or("No URL in generation response")?;

            // Download the generated image
            let img_resp = client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("Cannot download generated image: {e}"))?;

            if !img_resp.status().is_success() {
                return Err(format!("Image download failed: {}", img_resp.status()));
            }

            let bytes = img_resp
                .bytes()
                .await
                .map_err(|e| format!("Cannot read image bytes: {e}"))?;

            // Save to disk
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let filename = format!("gen-{ts}-{i}.png");
            let dest = gen_dir.join(&filename);
            std::fs::write(&dest, &bytes)
                .map_err(|e| format!("Cannot save generated image: {e}"))?;

            let dest_str = dest.to_string_lossy().to_string();
            crate::log::log("AI", &format!("Generated image saved: {filename}"));

            results.push(ImageGenerateResult {
                path: dest_str,
                filename,
                width,
                height,
                prompt: prompt.clone(),
                revised_prompt: item.revised_prompt.clone(),
            });
        }

        // Emit per-image progress
        let _ = app.emit("ai:generate:progress", serde_json::json!({
            "current": i + 1,
            "total": gen_count,
        }));
    }

    let _ = app.emit("ai:generate:complete", &results);
    Ok(results)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_clean_json() {
        let json = r##"{"description":"A test image","tags":["test","image"],"style":["minimal"],"mood":["calm"],"colors":["#fff"],"era":"modern"}"##;
        let result = parse_analysis_json(json).unwrap();
        assert_eq!(result.description, "A test image");
        assert_eq!(result.tags, vec!["test", "image"]);
        assert_eq!(result.style, vec!["minimal"]);
        assert_eq!(result.colors, vec!["#fff"]);
        assert_eq!(result.era, Some("modern".to_string()));
    }

    #[test]
    fn test_parse_json_in_code_block() {
        let text = r##"Here is the analysis:
```json
{"description":"Art deco lamp","tags":["art-deco","lamp"],"style":["geometric"],"mood":["elegant"],"colors":["#D4AF37"],"era":"1920s"}
```
"##;
        let result = parse_analysis_json(text).unwrap();
        assert_eq!(result.description, "Art deco lamp");
        assert_eq!(result.tags, vec!["art-deco", "lamp"]);
    }

    #[test]
    fn test_parse_embedded_json() {
        let text = r#"The image shows: {"description":"A dancer","tags":["dancer","bronze"],"style":[],"mood":[],"colors":[],"era":null} which is interesting."#;
        let result = parse_analysis_json(text).unwrap();
        assert_eq!(result.description, "A dancer");
    }

    #[test]
    fn test_parse_plain_text_fallback() {
        let text = "This is just a plain description with no JSON.";
        let result = parse_analysis_json(text).unwrap();
        assert_eq!(result.description, text);
        assert!(result.tags.is_empty());
    }

    #[test]
    fn test_default_config() {
        let config = AiProviderConfig::default();
        assert_eq!(config.provider, AiProviderKind::Anthropic);
        assert!(config.endpoint.is_none());
        assert!(config.api_key.is_none());
    }

    #[test]
    fn test_provider_default_endpoints() {
        assert_eq!(AiProviderKind::Anthropic.default_endpoint(), "https://api.anthropic.com/v1");
        assert_eq!(AiProviderKind::Openai.default_endpoint(), "https://api.openai.com/v1");
        assert_eq!(AiProviderKind::Ollama.default_endpoint(), "http://localhost:11434");
    }

    #[test]
    fn test_config_with_custom_endpoint() {
        let json = r#"{"provider":"openai","apiKey":"sk-test","endpoint":"https://openrouter.ai/api/v1","model":"google/gemini-2.0-flash"}"#;
        let config: AiProviderConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.provider, AiProviderKind::Openai);
        assert_eq!(config.endpoint, Some("https://openrouter.ai/api/v1".to_string()));
    }

    #[test]
    fn test_config_without_endpoint() {
        let json = r#"{"provider":"openai","apiKey":"sk-test"}"#;
        let config: AiProviderConfig = serde_json::from_str(json).unwrap();
        assert!(config.endpoint.is_none());
    }

    #[test]
    fn test_build_prompt_no_tags() {
        let prompt = build_analysis_prompt(&[]);
        assert_eq!(prompt, ANALYSIS_PROMPT);
    }

    #[test]
    fn test_build_prompt_with_tags() {
        let tags = vec!["art-deco".to_string(), "sculpture".to_string()];
        let prompt = build_analysis_prompt(&tags);
        assert!(prompt.contains("art-deco, sculpture"));
        assert!(prompt.contains("Prefer reusing existing tags"));
    }

    #[test]
    fn test_provider_kind_serialization() {
        let json = serde_json::to_string(&AiProviderKind::Anthropic).unwrap();
        assert_eq!(json, r#""anthropic""#);

        let kind: AiProviderKind = serde_json::from_str(r#""ollama""#).unwrap();
        assert_eq!(kind, AiProviderKind::Ollama);
    }

    #[test]
    fn test_parse_size() {
        assert_eq!(parse_size("1024x1024"), (1024, 1024));
        assert_eq!(parse_size("1792x1024"), (1792, 1024));
        assert_eq!(parse_size("1024x1792"), (1024, 1792));
        assert_eq!(parse_size("512x512"), (512, 512));
        assert_eq!(parse_size("unknown"), (1024, 1024)); // default
    }

    #[test]
    fn test_build_generation_prompt_no_refs() {
        let prompt = build_generation_prompt("A cool painting", &[], "/tmp/fake");
        assert_eq!(prompt, "A cool painting");
    }

    #[test]
    fn test_image_generate_result_serialization() {
        let result = ImageGenerateResult {
            path: "/tmp/gen.png".to_string(),
            filename: "gen.png".to_string(),
            width: 1024,
            height: 1024,
            prompt: "test".to_string(),
            revised_prompt: Some("revised test".to_string()),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"revisedPrompt\""));
        assert!(json.contains("gen.png"));
    }
}
