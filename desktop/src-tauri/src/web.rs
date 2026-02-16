//! Web Collection module for Deco 2.0
//!
//! Provides:
//! - Brave Search API integration (image search + web search)
//! - AI-generated search queries from image analysis
//! - Image download with deduplication
//! - Download queue management

use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single web search result (image).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub title: String,
    pub source_url: String,
    pub image_url: String,
    pub thumbnail_url: String,
    pub source_domain: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Download result returned after saving an image locally.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub local_path: String,
    pub name: String,
    pub size_bytes: u64,
    pub source_url: String,
}

/// Web collection configuration stored in app config.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebCollectionConfig {
    #[serde(default)]
    pub brave_api_key: Option<String>,
    #[serde(default = "default_safe_search")]
    pub safe_search: String,
    #[serde(default = "default_results_count")]
    pub results_count: usize,
}

fn default_safe_search() -> String {
    "moderate".to_string()
}

fn default_results_count() -> usize {
    20
}

impl Default for WebCollectionConfig {
    fn default() -> Self {
        Self {
            brave_api_key: None,
            safe_search: default_safe_search(),
            results_count: default_results_count(),
        }
    }
}

// ---------------------------------------------------------------------------
// Brave Search API
// ---------------------------------------------------------------------------

/// Brave Image Search API response structures.
#[derive(Deserialize)]
struct BraveImageResponse {
    #[serde(default)]
    results: Vec<BraveImageResult>,
}

#[derive(Deserialize)]
struct BraveImageResult {
    #[serde(default)]
    title: String,
    url: String,
    #[serde(default)]
    #[allow(dead_code)]
    source: String,
    properties: Option<BraveImageProperties>,
    thumbnail: Option<BraveThumbnail>,
}

#[derive(Deserialize)]
struct BraveImageProperties {
    url: String,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

#[derive(Deserialize)]
struct BraveThumbnail {
    src: String,
}

/// Search Brave Image Search API.
async fn brave_image_search(
    client: &reqwest::Client,
    api_key: &str,
    query: &str,
    count: usize,
    safe_search: &str,
) -> Result<Vec<WebSearchResult>, String> {
    let url = format!(
        "https://api.search.brave.com/res/v1/images/search?q={}&count={}&safesearch={}",
        urlencoding::encode(query),
        count,
        safe_search
    );

    let resp = client
        .get(&url)
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Brave Search request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Brave Search API error ({status}): {text}"));
    }

    let data: BraveImageResponse = resp
        .json()
        .await
        .map_err(|e| format!("Brave Search response parse error: {e}"))?;

    let results = data
        .results
        .into_iter()
        .filter_map(|r| {
            let image_url = r.properties.as_ref().map(|p| p.url.clone())?;
            let thumbnail_url = r
                .thumbnail
                .as_ref()
                .map(|t| t.src.clone())
                .unwrap_or_else(|| image_url.clone());

            // Extract domain from source URL
            let source_domain = extract_domain(&r.url);

            Some(WebSearchResult {
                title: r.title,
                source_url: r.url,
                image_url,
                thumbnail_url,
                source_domain,
                width: r.properties.as_ref().and_then(|p| p.width),
                height: r.properties.as_ref().and_then(|p| p.height),
            })
        })
        .collect();

    Ok(results)
}

fn extract_domain(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("unknown")
        .to_string()
}

// ---------------------------------------------------------------------------
// AI Query Generation
// ---------------------------------------------------------------------------

/// Generate search queries from an image analysis result.
/// Uses the AI provider to create targeted search queries.
pub fn generate_queries_from_analysis(
    analysis: &crate::ai::AnalysisResult,
    refinement: Option<&str>,
) -> Vec<String> {
    let mut queries = Vec::new();

    // Primary query from description + style
    let desc = &analysis.description;
    let styles: Vec<&str> = analysis.style.iter().map(|s| s.as_str()).collect();
    let tags: Vec<&str> = analysis.tags.iter().map(|s| s.as_str()).collect();

    // Query 1: description-based
    if !desc.is_empty() {
        let mut q = desc.clone();
        if let Some(era) = &analysis.era {
            q = format!("{q} {era}");
        }
        queries.push(q);
    }

    // Query 2: tags + style combination
    if !tags.is_empty() {
        let tag_str = tags.iter().take(4).copied().collect::<Vec<_>>().join(" ");
        let style_str = styles.iter().take(2).copied().collect::<Vec<_>>().join(" ");
        if !style_str.is_empty() {
            queries.push(format!("{tag_str} {style_str}"));
        } else {
            queries.push(tag_str);
        }
    }

    // Query 3: mood + style for aesthetic match
    if !analysis.mood.is_empty() && !styles.is_empty() {
        let mood_str = analysis.mood.iter().take(2).map(|s| s.as_str()).collect::<Vec<_>>().join(" ");
        let style_str = styles.iter().take(2).copied().collect::<Vec<_>>().join(" ");
        queries.push(format!("{mood_str} {style_str} reference"));
    }

    // Apply refinement to all queries
    if let Some(refine) = refinement {
        queries = queries
            .into_iter()
            .map(|q| format!("{q} {refine}"))
            .collect();
    }

    // Deduplicate
    queries.dedup();
    queries.truncate(3); // Max 3 queries to stay within rate limits

    queries
}

// ---------------------------------------------------------------------------
// Image Download
// ---------------------------------------------------------------------------

/// Download an image from a URL and save it to the project's images directory.
/// Returns the local path and metadata.
async fn download_image_to_project(
    client: &reqwest::Client,
    image_url: &str,
    project_path: &str,
    source_url: &str,
) -> Result<DownloadResult, String> {
    let project_dir = Path::new(project_path);
    let images_dir = project_dir.join("images");
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Cannot create images directory: {e}"))?;

    // Download the image
    let resp = client
        .get(image_url)
        .header("User-Agent", "Deco/2.0 (Desktop Image Collector)")
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("Download HTTP error: {status}"));
    }

    // Determine filename from URL or content-disposition
    let filename = filename_from_url(image_url);

    // Check for duplicates by filename
    let mut final_path = images_dir.join(&filename);
    if final_path.exists() {
        // Add timestamp suffix to avoid overwrite
        let stem = final_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");
        let ext = final_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("jpg");
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        final_path = images_dir.join(format!("{stem}_{ts}.{ext}"));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Download read error: {e}"))?;

    let size = bytes.len() as u64;

    std::fs::write(&final_path, &bytes)
        .map_err(|e| format!("Cannot save image: {e}"))?;

    let name = final_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(DownloadResult {
        local_path: final_path.to_string_lossy().to_string(),
        name,
        size_bytes: size,
        source_url: source_url.to_string(),
    })
}

/// Extract a reasonable filename from a URL.
fn filename_from_url(url: &str) -> String {
    let path = url.split('?').next().unwrap_or(url);
    let name = path
        .rsplit('/')
        .next()
        .unwrap_or("image.jpg");

    // Clean up the filename
    let clean: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect();

    if clean.is_empty() || !clean.contains('.') {
        format!("web_image_{}.jpg", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis())
    } else if clean.len() > 100 {
        // Truncate very long filenames
        let ext = clean.rsplit('.').next().unwrap_or("jpg");
        format!("{}...{}", &clean[..80], ext)
    } else {
        clean
    }
}

// ---------------------------------------------------------------------------
// Config Persistence
// ---------------------------------------------------------------------------

fn load_web_config() -> WebCollectionConfig {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let path = Path::new(&home).join(".deco").join("config.json");
    if !path.exists() {
        return WebCollectionConfig::default();
    }

    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase", default)]
    struct FullConfig {
        web: Option<WebCollectionConfig>,
    }

    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<FullConfig>(&s).ok())
        .and_then(|c| c.web)
        .unwrap_or_default()
}

fn save_web_config(config: &WebCollectionConfig) -> Result<(), String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let path = Path::new(&home).join(".deco").join("config.json");

    // Read existing config, merge web section
    let mut full: serde_json::Value = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let web_value = serde_json::to_value(config)
        .map_err(|e| format!("Cannot serialize web config: {e}"))?;
    full["web"] = web_value;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&full)
        .map_err(|e| format!("Cannot serialize config: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Cannot write config: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Search for images on the web using Brave Search API.
#[tauri::command]
pub async fn cmd_web_search(
    app: tauri::AppHandle,
    query: String,
    refinement: Option<String>,
) -> Result<Vec<WebSearchResult>, String> {
    let config = load_web_config();
    let api_key = config
        .brave_api_key
        .or_else(|| crate::keyring::get_secret(crate::keyring::BRAVE_API_KEY))
        .or_else(|| std::env::var("BRAVE_API_KEY").ok())
        .ok_or("No Brave Search API key configured. Set it in settings or BRAVE_API_KEY env var.")?;

    let client = reqwest::Client::new();
    let full_query = match refinement {
        Some(ref r) if !r.is_empty() => format!("{query} {r}"),
        _ => query.clone(),
    };

    let _ = app.emit("web:search:start", &full_query);

    let results = brave_image_search(
        &client,
        &api_key,
        &full_query,
        config.results_count,
        &config.safe_search,
    )
    .await?;

    let _ = app.emit("web:search:complete", results.len());

    Ok(results)
}

/// Generate search queries from an image's AI analysis, then search.
#[tauri::command]
pub async fn cmd_find_more_like(
    app: tauri::AppHandle,
    image_path: String,
    refinement: Option<String>,
) -> Result<Vec<WebSearchResult>, String> {
    let config = load_web_config();
    let api_key = config
        .brave_api_key
        .or_else(|| crate::keyring::get_secret(crate::keyring::BRAVE_API_KEY))
        .or_else(|| std::env::var("BRAVE_API_KEY").ok())
        .ok_or("No Brave Search API key. Set it in Settings > Web Collection.")?;

    // Read image analysis from search index
    let project_path = Path::new(&image_path)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Get metadata from search DB
    let conn = crate::search::open_db(&project_path)?;
    let meta = conn
        .query_row(
            "SELECT description, tags, style, mood, era FROM images WHERE path = ?1",
            rusqlite::params![image_path],
            |row| {
                Ok(crate::ai::AnalysisResult {
                    description: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    tags: row.get::<_, String>(1)?
                        .split_whitespace()
                        .map(String::from)
                        .collect(),
                    style: row.get::<_, String>(2)?
                        .split_whitespace()
                        .map(String::from)
                        .collect(),
                    mood: row.get::<_, String>(3)?
                        .split_whitespace()
                        .map(String::from)
                        .collect(),
                    colors: Vec::new(),
                    era: row.get(4)?,
                })
            },
        )
        .map_err(|_| "Image has no analysis data. Run 'Analyze with AI' first.".to_string())?;

    // Generate queries
    let queries = generate_queries_from_analysis(&meta, refinement.as_deref());
    if queries.is_empty() {
        return Err("Could not generate search queries from image analysis.".to_string());
    }

    let _ = app.emit("web:search:start", &queries.join(" | "));

    // Search with all queries, merge results
    let client = reqwest::Client::new();
    let mut all_results = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();
    let per_query = config.results_count / queries.len().max(1);

    for query in &queries {
        match brave_image_search(&client, &api_key, query, per_query, &config.safe_search).await {
            Ok(results) => {
                for r in results {
                    if seen_urls.insert(r.image_url.clone()) {
                        all_results.push(r);
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("web:search:error", e.as_str());
            }
        }
    }

    let _ = app.emit("web:search:complete", all_results.len());

    Ok(all_results)
}

/// Download an image from the web and save it to the project.
#[tauri::command]
pub async fn cmd_download_web_image(
    app: tauri::AppHandle,
    image_url: String,
    project_path: String,
    source_url: String,
) -> Result<DownloadResult, String> {
    let _ = app.emit("web:download:start", &image_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Cannot create HTTP client: {e}"))?;

    let result = download_image_to_project(&client, &image_url, &project_path, &source_url).await?;

    let _ = app.emit("web:download:complete", &result.local_path);

    Ok(result)
}

/// Get web collection configuration.
/// Brave API key is hydrated from Keychain.
#[tauri::command]
pub fn cmd_get_web_config() -> Result<WebCollectionConfig, String> {
    let mut config = load_web_config();

    if config.brave_api_key.is_none() {
        config.brave_api_key = crate::keyring::get_secret(crate::keyring::BRAVE_API_KEY);
    }
    if config.brave_api_key.is_none() {
        config.brave_api_key = std::env::var("BRAVE_API_KEY").ok();
    }

    Ok(config)
}

/// Save web collection configuration.
/// Brave API key is stored in macOS Keychain, not in config.json.
#[tauri::command]
pub fn cmd_set_web_config(config: WebCollectionConfig) -> Result<(), String> {
    // Store Brave key in Keychain
    if let Some(ref key) = config.brave_api_key {
        if !key.is_empty() {
            crate::keyring::set_secret(crate::keyring::BRAVE_API_KEY, key)?;
        }
    } else {
        let _ = crate::keyring::delete_secret(crate::keyring::BRAVE_API_KEY);
    }

    // Save config without the key
    let mut sanitized = config;
    sanitized.brave_api_key = None;
    save_web_config(&sanitized)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain() {
        assert_eq!(extract_domain("https://example.com/path"), "example.com");
        assert_eq!(extract_domain("http://www.test.org/img.jpg"), "www.test.org");
    }

    #[test]
    fn test_filename_from_url() {
        let name = filename_from_url("https://example.com/images/photo.jpg");
        assert_eq!(name, "photo.jpg");

        let name = filename_from_url("https://cdn.site.com/img/abc.png?w=800&h=600");
        assert_eq!(name, "abc.png");

        // URL with no extension
        let name = filename_from_url("https://example.com/");
        assert!(name.ends_with(".jpg"));
    }

    #[test]
    fn test_generate_queries() {
        let analysis = crate::ai::AnalysisResult {
            description: "A bronze art-deco dancer sculpture".to_string(),
            tags: vec!["art-deco".to_string(), "sculpture".to_string(), "bronze".to_string()],
            style: vec!["geometric".to_string(), "elegant".to_string()],
            mood: vec!["dynamic".to_string(), "bold".to_string()],
            colors: vec!["#D4AF37".to_string()],
            era: Some("1920s".to_string()),
        };

        let queries = generate_queries_from_analysis(&analysis, None);
        assert!(!queries.is_empty());
        assert!(queries.len() <= 3);
        // First query should include description
        assert!(queries[0].contains("bronze"));
    }

    #[test]
    fn test_generate_queries_with_refinement() {
        let analysis = crate::ai::AnalysisResult {
            description: "Minimalist poster".to_string(),
            tags: vec!["poster".to_string(), "minimalist".to_string()],
            style: vec!["flat".to_string()],
            mood: vec!["calm".to_string()],
            colors: vec![],
            era: None,
        };

        let queries = generate_queries_from_analysis(&analysis, Some("more colorful"));
        assert!(queries[0].contains("more colorful"));
    }

    #[test]
    fn test_web_config_default() {
        let config = WebCollectionConfig::default();
        assert!(config.brave_api_key.is_none());
        assert_eq!(config.safe_search, "moderate");
        assert_eq!(config.results_count, 20);
    }
}
