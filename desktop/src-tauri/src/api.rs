//! HTTP API server for external tool integration (OpenClaw, agents, scripts).
//!
//! Runs alongside the Tauri app on a configurable local port (default 7890).
//! Provides `POST /api/import` for importing images from external sources.

use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const DEFAULT_PORT: u16 = 7890;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

struct ApiState {
    app: AppHandle,
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
struct ErrorResponse {
    error: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn handle_status(State(state): State<Arc<ApiState>>) -> Json<StatusResponse> {
    let port = get_api_port();
    let _ = &state.app; // keep state alive
    Json(StatusResponse {
        status: "ok".to_string(),
        version: "2.0.0".to_string(),
        port,
    })
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
// Port Config
// ---------------------------------------------------------------------------

/// Read the API port from ~/.refboard/config.json, defaulting to 7890.
fn get_api_port() -> u16 {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let config_path = std::path::Path::new(&home)
        .join(".refboard")
        .join("config.json");

    if let Ok(contents) = std::fs::read_to_string(config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&contents) {
            if let Some(port) = config.get("apiPort").and_then(|v| v.as_u64()) {
                return port as u16;
            }
        }
    }
    DEFAULT_PORT
}

// ---------------------------------------------------------------------------
// Server Lifecycle
// ---------------------------------------------------------------------------

/// Start the HTTP API server in the background.
/// Called from Tauri's setup hook.
pub async fn start_server(app: AppHandle) {
    let port = get_api_port();
    let state = Arc::new(ApiState { app });

    let router = Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/import", post(handle_import))
        .route("/api/delete", delete(handle_delete))
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

/// Get the current API server port.
#[tauri::command]
pub fn cmd_get_api_port() -> u16 {
    get_api_port()
}
