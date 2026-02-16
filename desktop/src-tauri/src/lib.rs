mod ai;
mod api;
pub mod cli;
mod embed;
mod keyring;
pub mod log;
pub mod ops;
mod search;
pub mod storage;
mod web;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "tiff",
];

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub extension: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetadata {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub image_count: usize,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub image_count: usize,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Scan a directory for image files (core logic, callable from other modules).
pub fn scan_images_in(dir_path: &str) -> Result<Vec<ImageInfo>, String> {
    let path = Path::new(dir_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", dir_path));
    }
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut images = Vec::new();
    walk_for_images(path, &mut images)?;
    images.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(images)
}

/// Recursively scan a directory for image files.
#[tauri::command]
fn scan_images(dir_path: String) -> Result<Vec<ImageInfo>, String> {
    scan_images_in(&dir_path)
}

fn walk_for_images(dir: &Path, images: &mut Vec<ImageInfo>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Cannot read {}: {}", dir.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            // Skip hidden directories
            if !name.starts_with('.') {
                walk_for_images(&path, images)?;
            }
        } else if let Some(ext) = path.extension() {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            if IMAGE_EXTENSIONS.contains(&ext_lower.as_str()) {
                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                images.push(ImageInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size_bytes: metadata.len(),
                    extension: ext_lower,
                });
            }
        }
    }
    Ok(())
}

/// Import raw image bytes into a project's images/ directory.
/// Core logic shared by the Tauri command and the HTTP API.
pub fn import_image_bytes(
    data: Vec<u8>,
    extension: String,
    project_path: String,
) -> Result<ImageInfo, String> {
    let images_dir = Path::new(&project_path).join("images");
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Cannot create images dir: {}", e))?;

    let ext = extension.to_lowercase();
    if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("Unsupported image type: {}", ext));
    }

    // Generate unique filename with timestamp
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let stem = format!("paste-{}", ts);
    let mut dest = images_dir.join(format!("{}.{}", stem, ext));
    let mut counter = 2u32;
    while dest.exists() {
        dest = images_dir.join(format!("{}-{}.{}", stem, counter, ext));
        counter += 1;
    }

    fs::write(&dest, &data).map_err(|e| format!("Cannot write pasted image: {}", e))?;

    Ok(ImageInfo {
        name: dest.file_name().unwrap().to_string_lossy().to_string(),
        path: dest.to_string_lossy().to_string(),
        size_bytes: data.len() as u64,
        extension: ext,
    })
}

/// Tauri command wrapper for import_image_bytes.
/// After saving the file, auto-indexes in FTS5 and queues CLIP embedding.
#[tauri::command]
async fn import_clipboard_image(
    data: Vec<u8>,
    extension: String,
    project_path: String,
) -> Result<ImageInfo, String> {
    let info = import_image_bytes(data, extension, project_path.clone())?;
    spawn_auto_index(project_path, vec![info.clone()]);
    Ok(info)
}

/// Delete an image and all associated data (thumbnail, search metadata, embeddings).
#[tauri::command]
async fn delete_image(project_path: String, image_path: String) -> Result<(), String> {
    let path = Path::new(&image_path);

    // 1. Delete the original image file
    if path.is_file() {
        fs::remove_file(path)
            .map_err(|e| format!("Cannot delete image file: {e}"))?;
    }

    // 2. Delete thumbnails (try common extensions)
    if let Some(stem) = path.file_stem() {
        let thumb_dir = Path::new(&project_path).join("thumbnails");
        if thumb_dir.is_dir() {
            let stem_str = stem.to_string_lossy();
            // Thumbnails may have a different extension than the original
            for ext in &["jpg", "jpeg", "png", "webp"] {
                let thumb = thumb_dir.join(format!("{stem_str}.{ext}"));
                if thumb.exists() {
                    let _ = fs::remove_file(&thumb);
                }
            }
            // Also try exact filename match
            if let Some(filename) = path.file_name() {
                let thumb_exact = thumb_dir.join(filename);
                if thumb_exact.exists() {
                    let _ = fs::remove_file(&thumb_exact);
                }
            }
        }
    }

    // 3. Delete from search database (metadata + embeddings)
    if let Err(e) = search::delete_image_data(&project_path, &image_path) {
        // Log but don't fail — the file is already deleted
        crate::log::log("DELETE", &format!("DB cleanup warning: {e}"));
    }

    crate::log::log("DELETE", &format!("Deleted image: {}", image_path));
    Ok(())
}

/// Read project metadata via storage backend.
#[tauri::command]
async fn read_metadata(
    storage: tauri::State<'_, storage::Storage>,
    project_path: String,
) -> Result<ProjectMetadata, String> {
    storage.read_project_metadata(&project_path).await
}

/// Write project metadata via storage backend.
#[tauri::command]
async fn write_metadata(
    storage: tauri::State<'_, storage::Storage>,
    project_path: String,
    metadata: ProjectMetadata,
) -> Result<(), String> {
    storage.write_project_metadata(&project_path, &metadata).await
}

/// Create a new project via storage backend.
#[tauri::command]
async fn create_project(
    storage: tauri::State<'_, storage::Storage>,
    name: String,
    path: String,
) -> Result<ProjectInfo, String> {
    storage.create_project(&name, &path).await
}

/// List recent projects via storage backend.
#[tauri::command]
async fn list_projects(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<Vec<ProjectInfo>, String> {
    storage.list_recent_projects().await
}

/// Scan a folder for Deco projects.
#[tauri::command]
async fn scan_projects_folder(
    storage: tauri::State<'_, storage::Storage>,
    folder: String,
) -> Result<Vec<ProjectInfo>, String> {
    storage.scan_projects_folder(&folder).await
}

/// Open a file or folder in macOS Finder.
#[tauri::command]
fn show_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Cannot open Finder: {e}"))?;
    Ok(())
}

/// Rename a project: update metadata.json, deco.json, and recent.json entry.
#[tauri::command]
async fn rename_project(
    storage: tauri::State<'_, storage::Storage>,
    project_path: String,
    new_name: String,
) -> Result<(), String> {
    storage.rename_project(&project_path, &new_name).await
}

/// Remove a project from the recent projects list (does not delete project files).
#[tauri::command]
async fn remove_from_recent(
    storage: tauri::State<'_, storage::Storage>,
    project_path: String,
) -> Result<(), String> {
    storage.remove_from_recent(&project_path).await
}

/// Read the full app configuration.
#[tauri::command]
async fn get_app_config(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::AppConfig, String> {
    storage.read_app_config().await
}

/// Write the full app configuration.
#[tauri::command]
async fn set_app_config(
    storage: tauri::State<'_, storage::Storage>,
    config: storage::AppConfig,
) -> Result<(), String> {
    storage.write_app_config(&config).await
}

// ---------------------------------------------------------------------------
// Auto-Index + Embed
// ---------------------------------------------------------------------------

/// Spawn background FTS5 indexing + CLIP embedding for newly imported images.
/// Fire-and-forget: failures are logged but never block the import response.
fn spawn_auto_index(project_path: String, images: Vec<ImageInfo>) {
    tokio::task::spawn_blocking(move || {
        for img in &images {
            crate::log::log("IMPORT", &format!("Auto-indexing: {}", img.name));
        }

        // 1. FTS5 index (fast, synchronous)
        match search::index_project_images(&project_path, &images) {
            Ok(n) if n > 0 => {
                crate::log::log("IMPORT", &format!("Indexed {n} new images in search DB"));
            }
            Ok(_) => {}
            Err(e) => {
                crate::log::log("IMPORT", &format!("Auto-index failed: {e}"));
                return;
            }
        }

        // 2. CLIP embedding (slow, best-effort — skipped if model not loaded)
        let paths: Vec<String> = images.iter().map(|i| i.path.clone()).collect();
        match embed::embed_and_store(&project_path, &paths) {
            Ok(n) if n > 0 => {
                crate::log::log("IMPORT", &format!("Auto-embedded {n} images via CLIP"));
            }
            Ok(_) => {}
            Err(e) => {
                crate::log::log("IMPORT", &format!("Auto-embed skipped (model not ready?): {e}"));
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Count images in a directory (non-recursive, quick check).
pub fn count_images_in(dir: &Path) -> usize {
    let images_dir = dir.join("images");
    let target = if images_dir.is_dir() {
        &images_dir
    } else {
        dir
    };
    fs::read_dir(target)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .map(|ext| {
                            IMAGE_EXTENSIONS.contains(&ext.to_string_lossy().to_lowercase().as_str())
                        })
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

/// Simple ISO-ish timestamp without pulling in the chrono crate.
pub fn chrono_now_iso() -> String {
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Good enough for a timestamp string
    format!("unix:{}", secs)
}

// ---------------------------------------------------------------------------
// Board State (Auto-save / Crash Recovery)
// ---------------------------------------------------------------------------

/// Save board state (card positions, groups, viewport) via storage backend.
#[tauri::command]
async fn save_board_state(
    storage: tauri::State<'_, storage::Storage>,
    project_path: String,
    state: serde_json::Value,
) -> Result<(), String> {
    storage.save_board_state(&project_path, &state).await
}

/// Load board state via storage backend. Returns null if no saved state.
#[tauri::command]
async fn load_board_state(
    storage: tauri::State<'_, storage::Storage>,
    project_path: String,
) -> Result<Option<serde_json::Value>, String> {
    storage.load_board_state(&project_path).await
}

/// Import image files into a project's images/ directory.
/// After copying, auto-indexes in FTS5 and queues CLIP embedding in background.
#[tauri::command]
async fn import_images(paths: Vec<String>, project_path: String) -> Result<Vec<ImageInfo>, String> {
    let proj = project_path.clone();
    let imported = tokio::task::spawn_blocking(move || {
        let images_dir = Path::new(&proj).join("images");
        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Cannot create images dir: {}", e))?;

        let mut imported = Vec::new();

        for src_path_str in &paths {
            let src = Path::new(src_path_str);
            if !src.is_file() {
                continue;
            }

            // Validate extension
            let ext = match src.extension() {
                Some(e) => e.to_string_lossy().to_lowercase(),
                None => continue,
            };
            if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                continue;
            }

            // Determine destination filename, adding counter suffix if needed
            let stem = src
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "image".to_string());

            let mut dest = images_dir.join(format!("{}.{}", stem, ext));
            let mut counter = 2u32;
            while dest.exists() {
                dest = images_dir.join(format!("{}-{}.{}", stem, counter, ext));
                counter += 1;
            }

            fs::copy(src, &dest).map_err(|e| format!("Cannot copy {}: {}", src_path_str, e))?;

            let metadata = fs::metadata(&dest).map_err(|e| e.to_string())?;
            imported.push(ImageInfo {
                name: dest.file_name().unwrap().to_string_lossy().to_string(),
                path: dest.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                extension: ext,
            });
        }

        Ok::<Vec<ImageInfo>, String>(imported)
    })
    .await
    .map_err(|e| format!("Task join: {e}"))??;

    if !imported.is_empty() {
        spawn_auto_index(project_path, imported.clone());
    }

    Ok(imported)
}

/// Export all image metadata as a JSON file.
#[tauri::command]
fn export_metadata(project_path: String, output_path: String) -> Result<usize, String> {
    let images = scan_images_in(&project_path)?;

    // Merge with search DB metadata if available
    let conn = search::open_db(&project_path).ok();
    let mut export_items: Vec<serde_json::Value> = Vec::new();

    for img in &images {
        let mut item = serde_json::json!({
            "path": img.path,
            "name": img.name,
            "sizeBytes": img.size_bytes,
            "extension": img.extension,
        });

        if let Some(ref conn) = conn {
            // Try to get metadata from search DB
            if let Ok(row) = conn.query_row(
                "SELECT description, tags, style, mood, colors, era FROM images WHERE path = ?1",
                rusqlite::params![img.path],
                |row| {
                    Ok(serde_json::json!({
                        "description": row.get::<_, Option<String>>(0)?,
                        "tags": row.get::<_, String>(1)?.split_whitespace().collect::<Vec<_>>(),
                        "style": row.get::<_, String>(2)?.split_whitespace().collect::<Vec<_>>(),
                        "mood": row.get::<_, String>(3)?.split_whitespace().collect::<Vec<_>>(),
                        "colors": row.get::<_, String>(4)?.split_whitespace().collect::<Vec<_>>(),
                        "era": row.get::<_, Option<String>>(5)?,
                    }))
                },
            ) {
                if let Some(obj) = item.as_object_mut() {
                    if let Some(meta_obj) = row.as_object() {
                        for (k, v) in meta_obj {
                            obj.insert(k.clone(), v.clone());
                        }
                    }
                }
            }
        }

        export_items.push(item);
    }

    let export = serde_json::json!({
        "version": 2,
        "projectPath": project_path,
        "exportedAt": chrono_now_iso(),
        "imageCount": export_items.len(),
        "images": export_items,
    });

    let json = serde_json::to_string_pretty(&export)
        .map_err(|e| format!("Cannot serialize export: {}", e))?;
    fs::write(&output_path, json)
        .map_err(|e| format!("Cannot write export file: {}", e))?;

    Ok(export_items.len())
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the unified storage backend
    let store: storage::Storage = std::sync::Arc::new(storage::LocalStorage::new());

    // Migrate plaintext API keys to Keychain (idempotent, runs once)
    keyring::migrate_plaintext_keys();

    // Set custom models folder if configured
    let startup_storage = store.clone();
    tauri::async_runtime::block_on(async {
        if let Ok(config) = startup_storage.read_app_config().await {
            if let Some(ref folder) = config.models_folder {
                std::env::set_var("FASTEMBED_CACHE_PATH", folder);
            }
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(store.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            let api_storage = store;
            tauri::async_runtime::spawn(async move {
                api::start_server(handle, api_storage).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_images,
            import_images,
            import_clipboard_image,
            delete_image,
            read_metadata,
            write_metadata,
            create_project,
            list_projects,
            scan_projects_folder,
            show_in_finder,
            rename_project,
            remove_from_recent,
            get_app_config,
            set_app_config,
            ai::analyze_image,
            ai::cmd_analyze_batch,
            ai::get_ai_config,
            ai::set_ai_config,
            ai::check_ollama,
            ai::cmd_test_ai_vision,
            ai::cmd_generate_image,
            search::cmd_index_project,
            search::cmd_search_text,
            search::cmd_get_all_tags,
            search::cmd_filter_by_tag,
            search::cmd_find_similar,
            search::cmd_update_search_metadata,
            search::cmd_cluster_project,
            web::cmd_web_search,
            web::cmd_find_more_like,
            web::cmd_download_web_image,
            web::cmd_get_web_config,
            web::cmd_set_web_config,
            embed::cmd_embed_project,
            embed::cmd_has_embedding,
            embed::cmd_warmup_clip,
            log::cmd_read_log,
            api::cmd_get_api_port,
            save_board_state,
            load_board_state,
            export_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
