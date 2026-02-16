//! Local filesystem storage backend.
//!
//! Wraps the existing SQLite + JSON file persistence into the
//! `StorageProvider` trait. Each method delegates to the current
//! implementation in `search.rs`, `lib.rs`, `embed.rs`, etc.
//!
//! This is the default backend for desktop/offline use.

use async_trait::async_trait;
use std::fs;
use std::path::{Path, PathBuf};

use super::types::AppConfig;
use super::StorageProvider;

const DEFAULT_API_PORT: u16 = 7890;

/// Local filesystem storage backend.
///
/// Stores data as:
/// - Per-project SQLite (`{project}/.deco/search.db`) for metadata + search + embeddings
/// - Per-project JSON (`{project}/.deco/board.json`) for board state
/// - App-level JSON (`~/.deco/config.json`) for config
/// - App-level JSON (`~/.deco/recent.json`) for recent projects
pub struct LocalStorage {
    /// Base data directory (`~/.deco/`).
    data_dir: PathBuf,
}

impl LocalStorage {
    pub fn new() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        Self {
            data_dir: PathBuf::from(home).join(".deco"),
        }
    }

    fn config_path(&self) -> PathBuf {
        self.data_dir.join("config.json")
    }

    fn recent_path(&self) -> PathBuf {
        self.data_dir.join("recent.json")
    }
}

#[async_trait]
impl StorageProvider for LocalStorage {
    // ---- Project Lifecycle ----

    async fn create_project(
        &self,
        name: &str,
        path: &str,
    ) -> Result<crate::ProjectInfo, String> {
        let name = name.to_string();
        let path = path.to_string();
        let data_dir = self.data_dir.clone();

        tokio::task::spawn_blocking(move || {
            let project_dir = Path::new(&path);

            // Create directory structure
            fs::create_dir_all(project_dir.join("images"))
                .map_err(|e| format!("Cannot create project directories: {e}"))?;
            fs::create_dir_all(project_dir.join("thumbnails"))
                .map_err(|e| format!("Cannot create thumbnails directory: {e}"))?;

            // Write deco.json (project config)
            let deco_config = serde_json::json!({
                "version": 2,
                "name": &name,
                "created": crate::chrono_now_iso(),
            });
            fs::write(
                project_dir.join("deco.json"),
                serde_json::to_string_pretty(&deco_config).unwrap(),
            )
            .map_err(|e| format!("Cannot write deco.json: {e}"))?;

            // Write metadata.json
            let metadata = crate::ProjectMetadata {
                name: name.clone(),
                path: path.clone(),
                description: None,
                tags: Vec::new(),
                image_count: 0,
                created_at: Some(crate::chrono_now_iso()),
                updated_at: Some(crate::chrono_now_iso()),
            };
            let meta_json = serde_json::to_string_pretty(&metadata)
                .map_err(|e| format!("Cannot serialize metadata: {e}"))?;
            fs::write(project_dir.join("metadata.json"), meta_json)
                .map_err(|e| format!("Cannot write metadata.json: {e}"))?;

            // Write board.json (empty canvas state)
            let deco_dir = project_dir.join(".deco");
            fs::create_dir_all(&deco_dir)
                .map_err(|e| format!("Cannot create .deco dir: {e}"))?;
            let board = serde_json::json!({
                "version": 2,
                "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
                "items": [],
                "groups": [],
                "annotations": [],
            });
            fs::write(
                deco_dir.join("board.json"),
                serde_json::to_string_pretty(&board).unwrap(),
            )
            .map_err(|e| format!("Cannot write board.json: {e}"))?;

            // Add to recent projects
            add_to_recent_file(&data_dir.join("recent.json"), &name, &path)?;

            Ok(crate::ProjectInfo {
                name,
                path,
                image_count: 0,
            })
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn list_recent_projects(&self) -> Result<Vec<crate::ProjectInfo>, String> {
        let recent_path = self.recent_path();

        tokio::task::spawn_blocking(move || {
            if !recent_path.exists() {
                return Ok(Vec::new());
            }

            let contents = fs::read_to_string(&recent_path)
                .map_err(|e| format!("Cannot read recent.json: {e}"))?;

            #[derive(serde::Deserialize)]
            struct RecentEntry {
                name: String,
                path: String,
            }

            let entries: Vec<RecentEntry> =
                serde_json::from_str(&contents).map_err(|e| format!("Invalid recent.json: {e}"))?;

            let mut projects = Vec::new();
            for entry in entries {
                let project_dir = Path::new(&entry.path);
                if project_dir.exists() {
                    let image_count = crate::count_images_in(project_dir);
                    projects.push(crate::ProjectInfo {
                        name: entry.name,
                        path: entry.path,
                        image_count,
                    });
                }
            }

            Ok(projects)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn add_to_recent(&self, name: &str, path: &str) -> Result<(), String> {
        let recent_path = self.recent_path();
        let name = name.to_string();
        let path = path.to_string();
        let data_dir = self.data_dir.clone();

        tokio::task::spawn_blocking(move || {
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            add_to_recent_file(&recent_path, &name, &path)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    // ---- Project Metadata ----

    async fn read_project_metadata(
        &self,
        project_path: &str,
    ) -> Result<crate::ProjectMetadata, String> {
        let project_path = project_path.to_string();

        tokio::task::spawn_blocking(move || {
            let meta_path = Path::new(&project_path).join("metadata.json");
            if !meta_path.exists() {
                return Err(format!("No metadata.json found in {project_path}"));
            }
            let contents = fs::read_to_string(&meta_path)
                .map_err(|e| format!("Cannot read metadata: {e}"))?;
            let metadata: crate::ProjectMetadata = serde_json::from_str(&contents)
                .map_err(|e| format!("Invalid metadata JSON: {e}"))?;
            Ok(metadata)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn write_project_metadata(
        &self,
        project_path: &str,
        meta: &crate::ProjectMetadata,
    ) -> Result<(), String> {
        let project_path = project_path.to_string();
        let meta = meta.clone();

        tokio::task::spawn_blocking(move || {
            let meta_path = Path::new(&project_path).join("metadata.json");
            let json = serde_json::to_string_pretty(&meta)
                .map_err(|e| format!("Cannot serialize metadata: {e}"))?;
            fs::write(&meta_path, json)
                .map_err(|e| format!("Cannot write metadata: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    // ---- Board State ----

    async fn save_board_state(
        &self,
        project_path: &str,
        state: &serde_json::Value,
    ) -> Result<(), String> {
        let project_path = project_path.to_string();
        let state = state.clone();

        tokio::task::spawn_blocking(move || {
            let deco_dir = Path::new(&project_path).join(".deco");
            fs::create_dir_all(&deco_dir)
                .map_err(|e| format!("Cannot create .deco dir: {e}"))?;
            let board_path = deco_dir.join("board.json");
            let json = serde_json::to_string_pretty(&state)
                .map_err(|e| format!("Cannot serialize board state: {e}"))?;
            fs::write(&board_path, json)
                .map_err(|e| format!("Cannot write board.json: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn load_board_state(
        &self,
        project_path: &str,
    ) -> Result<Option<serde_json::Value>, String> {
        let project_path = project_path.to_string();

        tokio::task::spawn_blocking(move || {
            let board_path = Path::new(&project_path)
                .join(".deco")
                .join("board.json");
            if !board_path.exists() {
                return Ok(None);
            }
            let contents = fs::read_to_string(&board_path)
                .map_err(|e| format!("Cannot read board.json: {e}"))?;
            let state: serde_json::Value = serde_json::from_str(&contents)
                .map_err(|e| format!("Invalid board.json: {e}"))?;
            Ok(Some(state))
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    // ---- Image Metadata & Search ----

    async fn index_images(
        &self,
        project_path: &str,
        images: &[crate::ImageInfo],
    ) -> Result<usize, String> {
        let project_path = project_path.to_string();
        let images = images.to_vec();

        tokio::task::spawn_blocking(move || {
            crate::search::index_project_images(&project_path, &images)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn upsert_image_metadata(
        &self,
        project_path: &str,
        meta: &crate::search::ImageMetadataRow,
    ) -> Result<(), String> {
        let project_path = project_path.to_string();
        let meta = meta.clone();

        tokio::task::spawn_blocking(move || {
            crate::search::update_image_metadata(&project_path, &meta)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn search_text(
        &self,
        project_path: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<crate::search::SearchResult>, String> {
        let project_path = project_path.to_string();
        let query = query.to_string();

        tokio::task::spawn_blocking(move || {
            crate::search::search_text(&project_path, &query, limit)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn get_all_tags(
        &self,
        project_path: &str,
    ) -> Result<Vec<crate::search::TagCount>, String> {
        let project_path = project_path.to_string();

        tokio::task::spawn_blocking(move || crate::search::get_all_tags(&project_path))
            .await
            .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn get_images_by_tag(
        &self,
        project_path: &str,
        tag: &str,
    ) -> Result<Vec<String>, String> {
        let project_path = project_path.to_string();
        let tag = tag.to_string();

        tokio::task::spawn_blocking(move || {
            crate::search::get_images_by_tag(&project_path, &tag)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn query_image_row(
        &self,
        project_path: &str,
        image_path: &str,
    ) -> Result<Option<serde_json::Value>, String> {
        let project_path = project_path.to_string();
        let image_path = image_path.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = crate::search::open_db(&project_path)?;
            let result = conn
                .query_row(
                    "SELECT description, tags, style, mood, colors, era FROM images WHERE path = ?1",
                    rusqlite::params![image_path],
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
                )
                .ok();
            Ok(result)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    // ---- Embeddings & Similarity ----

    async fn store_embedding(
        &self,
        project_path: &str,
        image_path: &str,
        model: &str,
        embedding: &[f32],
    ) -> Result<(), String> {
        let project_path = project_path.to_string();
        let image_path = image_path.to_string();
        let model = model.to_string();
        let embedding = embedding.to_vec();

        tokio::task::spawn_blocking(move || {
            let conn = crate::search::open_db(&project_path)?;
            crate::search::store_embedding_conn(&conn, &image_path, &model, &embedding)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn embed_project(
        &self,
        project_path: &str,
    ) -> Result<usize, String> {
        let project_path = project_path.to_string();

        tokio::task::spawn_blocking(move || {
            let images = crate::scan_images_in(&project_path)?;
            crate::log::log(
                "CLIP",
                &format!(
                    "Embedding project: {project_path} ({} images found)",
                    images.len()
                ),
            );

            // Ensure all images are indexed in the `images` table first.
            // Without this, newly imported images have embeddings but no
            // metadata row, causing find_similar JOINs to miss them.
            let indexed = crate::search::index_project_images(&project_path, &images)?;
            if indexed > 0 {
                crate::log::log(
                    "CLIP",
                    &format!("{indexed} new images indexed in search DB"),
                );
            }

            let paths: Vec<String> = images.iter().map(|i| i.path.clone()).collect();
            crate::embed::embed_and_store(&project_path, &paths)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn find_similar(
        &self,
        project_path: &str,
        image_path: &str,
        limit: usize,
    ) -> Result<Vec<crate::search::SearchResult>, String> {
        let project_path = project_path.to_string();
        let image_path = image_path.to_string();

        tokio::task::spawn_blocking(move || {
            // Try embedding-based similarity first, fall back to tag similarity
            match crate::search::find_similar(&project_path, &image_path, limit) {
                Ok(results) if !results.is_empty() => Ok(results),
                _ => crate::search::find_similar_by_tags(&project_path, &image_path, limit),
            }
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn has_embedding(
        &self,
        project_path: &str,
        image_path: &str,
    ) -> Result<bool, String> {
        let project_path = project_path.to_string();
        let image_path = image_path.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = crate::search::open_db(&project_path)?;
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM embeddings WHERE path = ?1",
                    rusqlite::params![image_path],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Cannot check embedding: {e}"))?;
            Ok(count > 0)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    // ---- App Config ----

    async fn read_app_config(&self) -> Result<AppConfig, String> {
        let config_path = self.config_path();

        tokio::task::spawn_blocking(move || {
            if !config_path.exists() {
                return Ok(AppConfig::default());
            }
            let contents = fs::read_to_string(&config_path)
                .map_err(|e| format!("Cannot read config: {e}"))?;
            let config: AppConfig = serde_json::from_str(&contents)
                .map_err(|e| format!("Invalid config JSON: {e}"))?;
            Ok(config)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn write_app_config(&self, config: &AppConfig) -> Result<(), String> {
        let config_path = self.config_path();
        let config = config.clone();
        let data_dir = self.data_dir.clone();

        tokio::task::spawn_blocking(move || {
            fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Cannot create config directory: {e}"))?;
            let json = serde_json::to_string_pretty(&config)
                .map_err(|e| format!("Cannot serialize config: {e}"))?;
            fs::write(&config_path, json)
                .map_err(|e| format!("Cannot write config: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }

    async fn get_api_port(&self) -> u16 {
        let config_path = self.config_path();

        tokio::task::spawn_blocking(move || {
            if let Ok(contents) = fs::read_to_string(config_path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&contents) {
                    if let Some(port) = config.get("apiPort").and_then(|v| v.as_u64()) {
                        return port as u16;
                    }
                }
            }
            DEFAULT_API_PORT
        })
        .await
        .unwrap_or(DEFAULT_API_PORT)
    }

    async fn scan_projects_folder(
        &self,
        folder: &str,
    ) -> Result<Vec<crate::ProjectInfo>, String> {
        let folder = folder.to_string();

        tokio::task::spawn_blocking(move || {
            let dir = Path::new(&folder);
            if !dir.is_dir() {
                return Ok(Vec::new());
            }

            let mut projects = Vec::new();
            let entries = fs::read_dir(dir)
                .map_err(|e| format!("Cannot read folder: {e}"))?;

            for entry in entries {
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                // Skip hidden directories
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }

                // Check for Deco project markers
                let has_deco_json = path.join("deco.json").exists();
                let has_metadata = path.join("metadata.json").exists();
                let has_dot_deco = path.join(".deco").is_dir();

                if has_deco_json || has_metadata || has_dot_deco {
                    let image_count = crate::count_images_in(&path);
                    projects.push(crate::ProjectInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        image_count,
                    });
                }
            }

            projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            Ok(projects)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))?
    }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/// Add or update a project in the recent.json file.
fn add_to_recent_file(
    recent_path: &Path,
    name: &str,
    path: &str,
) -> Result<(), String> {
    if let Some(parent) = recent_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    #[derive(serde::Serialize, serde::Deserialize)]
    struct RecentEntry {
        name: String,
        path: String,
    }

    let mut entries: Vec<RecentEntry> = if recent_path.exists() {
        let contents = fs::read_to_string(recent_path).map_err(|e| e.to_string())?;
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
    fs::write(recent_path, json).map_err(|e| e.to_string())?;

    Ok(())
}
