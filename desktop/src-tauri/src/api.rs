//! HTTP API server for external tool integration (OpenClaw, agents, scripts).
//!
//! Runs alongside the Tauri app on a configurable local port (default 7890).
//!
//! ## Endpoints
//!
//! - `GET /api/status` - Health check and version info
//! - `POST /api/import` - Import image from file upload or URL
//! - `DELETE /api/delete` - Delete an image from the project
//! - `POST /api/move` - Move an item's position on the board
//! - `PATCH /api/item` - Update item metadata (tags, description, etc.)
//! - `POST /api/embed` - Generate CLIP embedding for a single image
//! - `POST /api/embed-batch` - Batch-generate CLIP embeddings
//! - `POST /api/similar` - Find visually similar images (top-N)
//! - `POST /api/search-semantic` - Text-to-image semantic search (FTS5)
//! - `POST /api/cluster` - Auto-cluster images by visual similarity

use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

struct ApiState {
    app: AppHandle,
    storage: crate::storage::Storage,
}

// ---------------------------------------------------------------------------
// Request/Response Types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteRequest {
    project_path: String,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveRequest {
    project_path: String,
    filename: String,
    x: f64,
    y: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateItemRequest {
    project_path: String,
    filename: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    styles: Option<Vec<String>>,
    #[serde(default)]
    moods: Option<Vec<String>>,
    #[serde(default)]
    era: Option<String>,
    #[serde(default)]
    artist: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResponse {
    id: String,
    filename: String,
    path: String,
    position: Option<Position>,
    analysis: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Position {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    version: String,
    port: u16,
}

#[derive(Serialize)]
struct DeleteResponse {
    success: bool,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveResponse {
    status: String,
    filename: String,
    x: f64,
    y: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateItemResponse {
    status: String,
    filename: String,
    metadata: serde_json::Value,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn handle_status(State(state): State<Arc<ApiState>>) -> Json<StatusResponse> {
    let port = state.storage.get_api_port().await;
    Json(StatusResponse {
        status: "ok".to_string(),
        version: "2.0.0".to_string(),
        port,
    })
}

/// List all known projects (recent + default folder scan).
/// OpenClaw uses this to let the user pick which board to operate on.
async fn handle_list_projects(
    State(state): State<Arc<ApiState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    crate::log::log("API", "GET /api/projects");

    // Start with recent projects
    let mut projects = state.storage.list_recent_projects().await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Cannot list projects: {e}")))?;

    // Also scan the default Deco folder to find any projects not in recents
    let home = std::env::var("HOME").unwrap_or_default();
    let default_folder = format!("{home}/Documents/Deco");
    if let Ok(scanned) = state.storage.scan_projects_folder(&default_folder).await {
        let existing_paths: std::collections::HashSet<String> =
            projects.iter().map(|p| p.path.clone()).collect();
        for p in scanned {
            if !existing_paths.contains(&p.path) {
                projects.push(p);
            }
        }
    }

    crate::log::log("API", &format!("Projects: {} found", projects.len()));
    Ok(Json(projects))
}

async fn handle_import(
    State(state): State<Arc<ApiState>>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut file_ext: Option<String> = None;
    let mut file_name: Option<String> = None;
    let mut url: Option<String> = None;
    let mut project_path: Option<String> = None;
    let mut analyze = false;
    let mut position: Option<Position> = None;

    // Parse multipart fields
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                // Extract filename and extension from upload
                if let Some(fname) = field.file_name() {
                    let fname = fname.to_string();
                    file_ext = fname
                        .rsplit('.')
                        .next()
                        .map(|e| e.to_lowercase());
                    file_name = Some(fname);
                }
                let content_type = field.content_type().unwrap_or("").to_string();
                // Fallback extension from content-type if not in filename
                if file_ext.is_none() {
                    file_ext = mime_to_ext(&content_type);
                }
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| api_error(StatusCode::BAD_REQUEST, format!("Cannot read file: {e}")))?
                        .to_vec(),
                );
            }
            "url" => {
                url = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| api_error(StatusCode::BAD_REQUEST, format!("Cannot read url: {e}")))?,
                );
            }
            "project_path" => {
                project_path = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| api_error(StatusCode::BAD_REQUEST, format!("Cannot read project_path: {e}")))?,
                );
            }
            "analyze" => {
                let val = field.text().await.unwrap_or_default();
                analyze = val == "true" || val == "1";
            }
            "position" => {
                let val = field.text().await.unwrap_or_default();
                position = serde_json::from_str(&val).ok();
            }
            _ => {
                // Skip unknown fields
                let _ = field.bytes().await;
            }
        }
    }

    let project = project_path.ok_or_else(|| {
        api_error(StatusCode::BAD_REQUEST, "Missing required field: project_path".to_string())
    })?;

    crate::log::log("API", &format!("POST /api/import → project: {project}"));

    // Resolve image data: either from uploaded file or download from URL
    let (data, ext, original_name) = if let Some(data) = file_data {
        let ext = file_ext.unwrap_or_else(|| "png".to_string());
        let name = file_name.unwrap_or_else(|| format!("upload.{ext}"));
        crate::log::log("API", &format!("File upload: {} ({} bytes)", name, data.len()));
        (data, ext, name)
    } else if let Some(ref image_url) = url {
        crate::log::log("API", &format!("Downloading from URL: {image_url}"));
        let (data, ext, name) = download_image(image_url)
            .await
            .map_err(|e| api_error(StatusCode::BAD_REQUEST, format!("Download failed: {e}")))?;
        crate::log::log("API", &format!("Downloaded: {} ({} bytes)", name, data.len()));
        (data, ext, name)
    } else {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Either 'file' or 'url' field is required".to_string(),
        ));
    };

    // Import into project using shared import logic
    let info = crate::import_image_bytes(data, ext, project.clone())
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Import failed: {e}")))?;

    crate::log::log("API", &format!("Imported: {} → {}", original_name, info.path));

    // Index + embed in background (don't block the API response).
    // This ensures the new image appears in search, tags, and find_similar.
    {
        let storage = state.storage.clone();
        let bg_project = project.clone();
        tokio::spawn(async move {
            if let Err(e) = storage.embed_project(&bg_project).await {
                crate::log::log("API", &format!("Background index+embed failed: {e}"));
            }
        });
    }

    // Emit event so frontend can add the card to canvas
    let event_payload = serde_json::json!({
        "image": &info,
        "position": &position,
    });
    let _ = state.app.emit("api:image-imported", &event_payload);

    // Optionally trigger AI analysis
    let analysis = if analyze {
        crate::log::log("API", "Triggering AI analysis...");
        // Analysis runs async in the Tauri command; emit event for frontend to handle
        let _ = state.app.emit("api:analyze-request", &info.path);
        // Return null for now — analysis result comes via Tauri events
        None
    } else {
        None
    };

    let response = ImportResponse {
        id: info.name.clone(),
        filename: info.name,
        path: info.path,
        position,
        analysis,
    };

    crate::log::log("API", "Import complete, response sent");
    Ok((StatusCode::OK, Json(response)))
}

async fn handle_delete(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<DeleteRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let filename = payload.filename;

    crate::log::log("API", &format!("DELETE /api/delete → project: {project_path}, file: {filename}"));

    // Validate project path exists
    let project_dir = std::path::Path::new(&project_path);
    if !project_dir.exists() || !project_dir.is_dir() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            format!("Project path does not exist or is not a directory: {project_path}"),
        ));
    }

    // Construct full path to the image file
    let images_dir = project_dir.join("images");
    let file_path = images_dir.join(&filename);

    // Validate the file exists
    if !file_path.exists() {
        return Err(api_error(
            StatusCode::NOT_FOUND,
            format!("File not found: {filename}"),
        ));
    }

    // Validate file is actually inside images directory (security check)
    let canonical_file = file_path
        .canonicalize()
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, format!("Invalid file path: {e}")))?;
    let canonical_images = images_dir
        .canonicalize()
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, format!("Invalid images directory: {e}")))?;

    if !canonical_file.starts_with(&canonical_images) {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "File path must be within the project's images directory".to_string(),
        ));
    }

    // Delete the file
    std::fs::remove_file(&file_path)
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete file: {e}")))?;

    // Delete thumbnails
    if let Some(stem) = file_path.file_stem() {
        let thumb_dir = project_dir.join("thumbnails");
        if thumb_dir.is_dir() {
            let stem_str = stem.to_string_lossy();
            for ext in &["jpg", "jpeg", "png", "webp"] {
                let thumb = thumb_dir.join(format!("{stem_str}.{ext}"));
                if thumb.exists() { let _ = std::fs::remove_file(&thumb); }
            }
            let thumb_exact = thumb_dir.join(&filename);
            if thumb_exact.exists() { let _ = std::fs::remove_file(&thumb_exact); }
        }
    }

    // Delete from search database (metadata + embeddings)
    let image_path_str = file_path.to_string_lossy().to_string();
    if let Err(e) = crate::search::delete_image_data(&project_path, &image_path_str) {
        crate::log::log("API", &format!("DB cleanup warning: {e}"));
    }

    crate::log::log("API", &format!("Deleted: {}", file_path.display()));

    // Emit event so frontend can remove the card from canvas
    let event_payload = serde_json::json!({
        "filename": &filename,
        "project": &project_path,
    });
    let _ = state.app.emit("api:image-deleted", &event_payload);

    let response = DeleteResponse {
        success: true,
        message: format!("Successfully deleted {filename}"),
    };

    crate::log::log("API", "Delete complete, response sent");
    Ok((StatusCode::OK, Json(response)))
}

/// Move an item's position on the board.
/// Frontend should listen to `api:item-moved` event to update the canvas.
async fn handle_move(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<MoveRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let filename = payload.filename;
    let x = payload.x;
    let y = payload.y;

    crate::log::log("API", &format!("POST /api/move → project: {project_path}, file: {filename}, x: {x}, y: {y}"));

    // Load board state via storage backend
    let mut state_json = state.storage.load_board_state(&project_path).await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Cannot load board state: {e}")))?
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Board state not found".to_string()))?;

    // Find and update the item
    let items = state_json
        .get_mut("items")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid board state structure".to_string()))?;

    let item = items
        .iter_mut()
        .find(|item| {
            item.get("name")
                .and_then(|v| v.as_str())
                .map(|name| name == filename)
                .unwrap_or(false)
        })
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, format!("Item not found: {filename}")))?;

    // Update position
    if let Some(obj) = item.as_object_mut() {
        obj.insert("x".to_string(), serde_json::json!(x));
        obj.insert("y".to_string(), serde_json::json!(y));
    }

    // Save board state via storage backend
    state.storage.save_board_state(&project_path, &state_json).await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Cannot save board state: {e}")))?;

    crate::log::log("API", &format!("Moved: {filename} to ({x}, {y})"));

    // Emit event so frontend can update the card position
    let event_payload = serde_json::json!({
        "filename": &filename,
        "x": x,
        "y": y,
    });
    let _ = state.app.emit("api:item-moved", &event_payload);

    let response = MoveResponse {
        status: "moved".to_string(),
        filename,
        x,
        y,
    };

    crate::log::log("API", "Move complete, response sent");
    Ok((StatusCode::OK, Json(response)))
}

/// Update item metadata (tags, description, etc.).
/// Frontend should listen to `api:item-updated` event to refresh the card display.
async fn handle_update_item(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<UpdateItemRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let filename = payload.filename;

    crate::log::log("API", &format!("PATCH /api/item → project: {project_path}, file: {filename}"));

    // Validate project path exists
    let project_dir = std::path::Path::new(&project_path);
    if !project_dir.exists() || !project_dir.is_dir() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            format!("Project path does not exist or is not a directory: {project_path}"),
        ));
    }

    // Construct full image path for database lookup
    let images_dir = project_dir.join("images");
    let image_path = images_dir.join(&filename);
    let image_path_str = image_path.to_string_lossy().to_string();

    // Build metadata update
    use crate::search::ImageMetadataRow;

    let metadata = ImageMetadataRow {
        image_path: image_path_str.clone(),
        name: filename.clone(),
        description: payload.title.or(payload.description),
        tags: payload.tags.unwrap_or_default(),
        style: payload.styles.unwrap_or_default(),
        mood: payload.moods.unwrap_or_default(),
        colors: Vec::new(),  // Not provided in this API
        era: payload.era,
    };

    // Update in search database via storage backend
    state.storage.upsert_image_metadata(&project_path, &metadata).await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to update metadata: {e}")))?;

    crate::log::log("API", &format!("Updated metadata for: {filename}"));

    // Build response metadata object
    let response_metadata = serde_json::json!({
        "path": image_path_str,
        "name": filename,
        "description": metadata.description,
        "tags": metadata.tags,
        "style": metadata.style,
        "mood": metadata.mood,
        "era": metadata.era,
    });

    // Emit event so frontend can refresh the card
    let event_payload = serde_json::json!({
        "filename": &filename,
        "metadata": &response_metadata,
    });
    let _ = state.app.emit("api:item-updated", &event_payload);

    let response = UpdateItemResponse {
        status: "updated".to_string(),
        filename,
        metadata: response_metadata,
    };

    crate::log::log("API", "Update complete, response sent");
    Ok((StatusCode::OK, Json(response)))
}

// ---------------------------------------------------------------------------
// URL Download
// ---------------------------------------------------------------------------

/// Download an image from a URL. Returns (bytes, extension, filename).
async fn download_image(url: &str) -> Result<(Vec<u8>, String, String), String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let data = resp
        .bytes()
        .await
        .map_err(|e| format!("Cannot read response: {e}"))?
        .to_vec();

    // Derive extension from content-type or URL
    let ext = mime_to_ext(&content_type)
        .or_else(|| {
            url.rsplit('/')
                .next()
                .and_then(|seg| seg.rsplit('.').next())
                .map(|e| e.to_lowercase())
                .filter(|e| ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].contains(&e.as_str()))
        })
        .unwrap_or_else(|| "jpg".to_string());

    // Derive filename from URL
    let filename = url
        .rsplit('/')
        .next()
        .and_then(|seg| seg.split('?').next())
        .unwrap_or("download")
        .to_string();

    Ok((data, ext, filename))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn mime_to_ext(content_type: &str) -> Option<String> {
    match content_type {
        "image/png" => Some("png".to_string()),
        "image/jpeg" => Some("jpg".to_string()),
        "image/gif" => Some("gif".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/svg+xml" => Some("svg".to_string()),
        "image/bmp" => Some("bmp".to_string()),
        "image/avif" => Some("avif".to_string()),
        _ => None,
    }
}

fn api_error(status: StatusCode, message: String) -> (StatusCode, Json<ErrorResponse>) {
    crate::log::log("API", &format!("Error: {message}"));
    (status, Json(ErrorResponse { error: message }))
}

// ---------------------------------------------------------------------------
// CLIP API — Embedding & Similarity Endpoints
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbedRequest {
    project_path: String,
    image_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbedResponse {
    image_path: String,
    dimensions: usize,
    embedding: Vec<f32>,
}

/// Generate (or retrieve cached) CLIP embedding for a single image.
async fn handle_embed(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<EmbedRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let image_path = payload.image_path;

    crate::log::log("API", &format!("POST /api/embed → {image_path}"));

    // Ensure image is indexed
    let img_path = image_path.clone();
    let proj = project_path.clone();
    let has = state.storage.has_embedding(&proj, &img_path).await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    if !has {
        // Generate embedding via CLIP
        let proj2 = project_path.clone();
        let img2 = image_path.clone();
        tokio::task::spawn_blocking(move || {
            crate::embed::embed_and_store(&proj2, &[img2])
        })
        .await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {e}")))?
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    }

    // Retrieve the embedding
    let proj3 = project_path.clone();
    let img3 = image_path.clone();
    let embedding = tokio::task::spawn_blocking(move || {
        let conn = crate::search::open_db(&proj3)?;
        crate::search::get_embedding(&conn, &img3)
    })
    .await
    .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {e}")))?
    .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?
    .ok_or_else(|| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Embedding not found after generation".to_string()))?;

    let response = EmbedResponse {
        image_path,
        dimensions: embedding.len(),
        embedding,
    };

    crate::log::log("API", &format!("Embed complete: {} dims", response.dimensions));
    Ok(Json(response))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbedBatchRequest {
    project_path: String,
    /// Optional list of image paths. If empty/omitted, embeds the entire project.
    #[serde(default)]
    image_paths: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbedBatchResponse {
    embedded: usize,
    total_images: usize,
}

/// Batch-generate CLIP embeddings for multiple images (or entire project).
async fn handle_embed_batch(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<EmbedBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;

    crate::log::log("API", &format!("POST /api/embed-batch → project: {project_path}"));

    let result = match payload.image_paths {
        Some(paths) if !paths.is_empty() => {
            let total = paths.len();
            let proj = project_path.clone();
            let embedded = tokio::task::spawn_blocking(move || {
                crate::embed::embed_and_store(&proj, &paths)
            })
            .await
            .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {e}")))?
            .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

            EmbedBatchResponse { embedded, total_images: total }
        }
        _ => {
            // Embed entire project
            let proj = project_path.clone();
            let embedded = state.storage.embed_project(&proj).await
                .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

            let images = crate::scan_images_in(&project_path)
                .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

            EmbedBatchResponse { embedded, total_images: images.len() }
        }
    };

    crate::log::log("API", &format!("Batch embed: {}/{} new", result.embedded, result.total_images));
    Ok(Json(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimilarRequest {
    project_path: String,
    image_path: String,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize { 10 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimilarResponse {
    query: String,
    results: Vec<SimilarItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimilarItem {
    image_path: String,
    name: String,
    score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    tags: Vec<String>,
}

/// Find visually similar images using CLIP embeddings (falls back to tag similarity).
async fn handle_similar(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<SimilarRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let image_path = payload.image_path;
    let limit = payload.limit;

    crate::log::log("API", &format!("POST /api/similar → {image_path} (top {limit})"));

    let results = state.storage.find_similar(&project_path, &image_path, limit).await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let items: Vec<SimilarItem> = results
        .into_iter()
        .map(|r| SimilarItem {
            image_path: r.image_path,
            name: r.name,
            score: r.score,
            description: r.description,
            tags: r.tags,
        })
        .collect();

    crate::log::log("API", &format!("Similar: {} results", items.len()));
    Ok(Json(SimilarResponse { query: image_path, results: items }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchRequest {
    project_path: String,
    query: String,
    #[serde(default = "default_limit")]
    limit: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchResponse {
    query: String,
    results: Vec<SimilarItem>,
}

/// Text-to-image semantic search.
///
/// Uses FTS5 full-text search over image metadata (description, tags, style, mood).
/// A future version could use CLIP text encoder for true cross-modal search.
async fn handle_search_semantic(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<SemanticSearchRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let query = payload.query;
    let limit = payload.limit;

    crate::log::log("API", &format!("POST /api/search-semantic → \"{query}\" (top {limit})"));

    let results = state.storage.search_text(&project_path, &query, limit).await
        .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let items: Vec<SimilarItem> = results
        .into_iter()
        .map(|r| SimilarItem {
            image_path: r.image_path,
            name: r.name,
            score: r.score,
            description: r.description,
            tags: r.tags,
        })
        .collect();

    crate::log::log("API", &format!("Semantic search: {} results", items.len()));
    Ok(Json(SemanticSearchResponse { query, results: items }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClusterRequest {
    project_path: String,
    /// Cosine similarity threshold for grouping (0.0–1.0). Default 0.7.
    #[serde(default = "default_threshold")]
    threshold: f64,
}

fn default_threshold() -> f64 { 0.7 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClusterResponse {
    cluster_count: usize,
    ungrouped: usize,
    clusters: Vec<Cluster>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Cluster {
    id: usize,
    size: usize,
    images: Vec<String>,
}

/// Auto-cluster images by visual similarity using CLIP embeddings.
///
/// Uses greedy agglomerative clustering: picks the first unassigned image as
/// a seed, groups all images within the cosine similarity `threshold`, repeats.
async fn handle_cluster(
    State(_state): State<Arc<ApiState>>,
    Json(payload): Json<ClusterRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let project_path = payload.project_path;
    let threshold = payload.threshold;

    crate::log::log("API", &format!("POST /api/cluster → threshold: {threshold}"));

    let all_embeddings = tokio::task::spawn_blocking(move || {
        crate::search::get_all_embeddings(&project_path)
    })
    .await
    .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {e}")))?
    .map_err(|e| api_error(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let result = crate::ops::greedy_cluster(&all_embeddings, threshold);

    let clusters: Vec<Cluster> = result
        .clusters
        .into_iter()
        .map(|g| Cluster {
            id: g.id,
            size: g.size,
            images: g.images,
        })
        .collect();

    crate::log::log("API", &format!("Cluster: {} groups, {} ungrouped", clusters.len(), result.ungrouped));
    Ok(Json(ClusterResponse {
        cluster_count: clusters.len(),
        ungrouped: result.ungrouped,
        clusters,
    }))
}

// ---------------------------------------------------------------------------
// Server Lifecycle
// ---------------------------------------------------------------------------

/// Start the HTTP API server in the background.
/// Called from Tauri's setup hook.
pub async fn start_server(app: AppHandle, storage: crate::storage::Storage) {
    let port = storage.get_api_port().await;
    let state = Arc::new(ApiState { app, storage });

    let router = Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/projects", get(handle_list_projects))
        .route("/api/import", post(handle_import))
        .route("/api/delete", delete(handle_delete))
        .route("/api/move", post(handle_move))
        .route("/api/item", patch(handle_update_item))
        // CLIP embedding & similarity endpoints
        .route("/api/embed", post(handle_embed))
        .route("/api/embed-batch", post(handle_embed_batch))
        .route("/api/similar", post(handle_similar))
        .route("/api/search-semantic", post(handle_search_semantic))
        .route("/api/cluster", post(handle_cluster))
        .with_state(state);

    let addr = format!("127.0.0.1:{port}");
    match tokio::net::TcpListener::bind(&addr).await {
        Ok(listener) => {
            crate::log::log("API", &format!("HTTP API server listening on http://{addr}"));
            if let Err(e) = axum::serve(listener, router).await {
                crate::log::log("API", &format!("Server error: {e}"));
            }
        }
        Err(e) => {
            crate::log::log("API", &format!("Cannot bind to {addr}: {e}"));
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Get the current API server port via storage backend.
#[tauri::command]
pub async fn cmd_get_api_port(
    storage: tauri::State<'_, crate::storage::Storage>,
) -> Result<u16, String> {
    Ok(storage.get_api_port().await)
}
