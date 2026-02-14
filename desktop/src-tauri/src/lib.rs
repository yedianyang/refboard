mod ai;
mod search;
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

#[derive(Serialize)]
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

/// Recursively scan a directory for image files.
#[tauri::command]
fn scan_images(dir_path: String) -> Result<Vec<ImageInfo>, String> {
    let path = Path::new(&dir_path);
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

/// Read project metadata from a directory's metadata.json file.
#[tauri::command]
fn read_metadata(project_path: String) -> Result<ProjectMetadata, String> {
    let meta_path = Path::new(&project_path).join("metadata.json");
    if !meta_path.exists() {
        return Err(format!(
            "No metadata.json found in {}",
            project_path
        ));
    }
    let contents =
        fs::read_to_string(&meta_path).map_err(|e| format!("Cannot read metadata: {}", e))?;
    let metadata: ProjectMetadata =
        serde_json::from_str(&contents).map_err(|e| format!("Invalid metadata JSON: {}", e))?;
    Ok(metadata)
}

/// Write project metadata to a directory's metadata.json file.
#[tauri::command]
fn write_metadata(project_path: String, metadata: ProjectMetadata) -> Result<(), String> {
    let meta_path = Path::new(&project_path).join("metadata.json");
    let json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Cannot serialize metadata: {}", e))?;
    fs::write(&meta_path, json).map_err(|e| format!("Cannot write metadata: {}", e))?;
    Ok(())
}

/// Create a new project: initialize directory structure with refboard.json,
/// metadata.json, and images/ subdirectory.
#[tauri::command]
fn create_project(name: String, path: String) -> Result<ProjectInfo, String> {
    let project_dir = Path::new(&path);

    // Create directory structure
    fs::create_dir_all(project_dir.join("images"))
        .map_err(|e| format!("Cannot create project directories: {}", e))?;
    fs::create_dir_all(project_dir.join("thumbnails"))
        .map_err(|e| format!("Cannot create thumbnails directory: {}", e))?;

    // Write refboard.json (project config)
    let refboard_config = serde_json::json!({
        "version": 2,
        "name": name,
        "created": chrono_now_iso(),
    });
    fs::write(
        project_dir.join("refboard.json"),
        serde_json::to_string_pretty(&refboard_config).unwrap(),
    )
    .map_err(|e| format!("Cannot write refboard.json: {}", e))?;

    // Write metadata.json
    let metadata = ProjectMetadata {
        name: name.clone(),
        path: path.clone(),
        description: None,
        tags: Vec::new(),
        image_count: 0,
        created_at: Some(chrono_now_iso()),
        updated_at: Some(chrono_now_iso()),
    };
    let meta_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Cannot serialize metadata: {}", e))?;
    fs::write(project_dir.join("metadata.json"), meta_json)
        .map_err(|e| format!("Cannot write metadata.json: {}", e))?;

    // Write board.json (empty canvas state)
    let board = serde_json::json!({
        "version": 2,
        "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
        "items": [],
        "groups": [],
        "annotations": [],
    });
    fs::write(
        project_dir.join("board.json"),
        serde_json::to_string_pretty(&board).unwrap(),
    )
    .map_err(|e| format!("Cannot write board.json: {}", e))?;

    // Add to recent projects list
    let _ = add_to_recent(&name, &path);

    Ok(ProjectInfo {
        name,
        path,
        image_count: 0,
    })
}

/// List recent projects from ~/.refboard/recent.json.
#[tauri::command]
fn list_projects() -> Result<Vec<ProjectInfo>, String> {
    let recent_path = refboard_data_dir().join("recent.json");
    if !recent_path.exists() {
        return Ok(Vec::new());
    }

    let contents =
        fs::read_to_string(&recent_path).map_err(|e| format!("Cannot read recent.json: {}", e))?;

    #[derive(Deserialize)]
    struct RecentEntry {
        name: String,
        path: String,
    }

    let entries: Vec<RecentEntry> =
        serde_json::from_str(&contents).map_err(|e| format!("Invalid recent.json: {}", e))?;

    let mut projects = Vec::new();
    for entry in entries {
        let project_dir = Path::new(&entry.path);
        if project_dir.exists() {
            // Count images if the directory exists
            let image_count = count_images_in(project_dir);
            projects.push(ProjectInfo {
                name: entry.name,
                path: entry.path,
                image_count,
            });
        }
    }

    Ok(projects)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Get the RefBoard data directory (~/.refboard/).
fn refboard_data_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    Path::new(&home).join(".refboard")
}

/// Add a project to the recent projects list.
fn add_to_recent(name: &str, path: &str) -> Result<(), String> {
    let data_dir = refboard_data_dir();
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let recent_path = data_dir.join("recent.json");

    #[derive(Serialize, Deserialize)]
    struct RecentEntry {
        name: String,
        path: String,
    }

    let mut entries: Vec<RecentEntry> = if recent_path.exists() {
        let contents = fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&contents).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Remove existing entry with same path, then prepend
    entries.retain(|e| e.path != path);
    entries.insert(
        0,
        RecentEntry {
            name: name.to_string(),
            path: path.to_string(),
        },
    );

    // Keep max 20 recent projects
    entries.truncate(20);

    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&recent_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Count images in a directory (non-recursive, quick check).
fn count_images_in(dir: &Path) -> usize {
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
fn chrono_now_iso() -> String {
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Good enough for a timestamp string
    format!("unix:{}", secs)
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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
            ai::analyze_image,
            ai::get_ai_config,
            ai::set_ai_config,
            ai::check_ollama,
            search::cmd_index_project,
            search::cmd_search_text,
            search::cmd_get_all_tags,
            search::cmd_filter_by_tag,
            search::cmd_find_similar,
            search::cmd_update_search_metadata,
            web::cmd_web_search,
            web::cmd_find_more_like,
            web::cmd_download_web_image,
            web::cmd_get_web_config,
            web::cmd_set_web_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
