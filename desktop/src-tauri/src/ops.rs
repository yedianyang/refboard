//! Shared business logic used by both the HTTP API and the CLI.
//!
//! Every function here is synchronous and Tauri-free so it can be called
//! from the CLI binary directly **and** from async Axum/Tauri handlers via
//! `spawn_blocking`.

use serde::Serialize;
use std::fs;
use std::path::Path;

// ---------------------------------------------------------------------------
// Cosine Similarity
// ---------------------------------------------------------------------------

/// Cosine similarity between two f32 vectors.
pub fn cosine_sim(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for (x, y) in a.iter().zip(b.iter()) {
        let x = *x as f64;
        let y = *y as f64;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 { 0.0 } else { dot / denom }
}

// ---------------------------------------------------------------------------
// Greedy Clustering
// ---------------------------------------------------------------------------

/// A cluster of visually similar images.
#[derive(Debug, Clone, Serialize)]
pub struct ClusterGroup {
    pub id: usize,
    pub size: usize,
    pub images: Vec<String>,
}

/// Result of greedy agglomerative clustering.
#[derive(Debug, Clone, Serialize)]
pub struct ClusterResult {
    pub clusters: Vec<ClusterGroup>,
    pub ungrouped: usize,
}

/// Greedy agglomerative clustering over CLIP embeddings.
///
/// Picks the first unassigned image as a seed, groups all images within the
/// cosine similarity `threshold`, repeats. Returns only multi-image clusters
/// (singletons are counted as `ungrouped`).
pub fn greedy_cluster(
    all_embeddings: &[(String, Vec<f32>)],
    threshold: f64,
) -> ClusterResult {
    let threshold = threshold.clamp(0.0, 1.0);

    if all_embeddings.is_empty() {
        return ClusterResult {
            clusters: Vec::new(),
            ungrouped: 0,
        };
    }

    let mut assigned = vec![false; all_embeddings.len()];
    let mut clusters: Vec<ClusterGroup> = Vec::new();

    for i in 0..all_embeddings.len() {
        if assigned[i] {
            continue;
        }
        assigned[i] = true;

        let mut group = vec![all_embeddings[i].0.clone()];
        let seed = &all_embeddings[i].1;

        for j in (i + 1)..all_embeddings.len() {
            if assigned[j] {
                continue;
            }
            let sim = cosine_sim(seed, &all_embeddings[j].1);
            if sim >= threshold {
                assigned[j] = true;
                group.push(all_embeddings[j].0.clone());
            }
        }

        clusters.push(ClusterGroup {
            id: clusters.len(),
            size: group.len(),
            images: group,
        });
    }

    // Separate singletons as "ungrouped"
    let ungrouped = clusters.iter().filter(|c| c.size == 1).count();
    let multi_clusters: Vec<ClusterGroup> = clusters
        .into_iter()
        .filter(|c| c.size >= 2)
        .enumerate()
        .map(|(i, mut c)| {
            c.id = i;
            c
        })
        .collect();

    ClusterResult {
        clusters: multi_clusters,
        ungrouped,
    }
}

// ---------------------------------------------------------------------------
// Board Item Move
// ---------------------------------------------------------------------------

/// Move an item's position on the board (sync read-modify-write of board.json).
pub fn move_board_item(
    project_path: &str,
    filename: &str,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let board_path = Path::new(project_path)
        .join(".deco")
        .join("board.json");

    if !board_path.exists() {
        return Err("Board state not found (no .deco/board.json)".to_string());
    }

    let contents = fs::read_to_string(&board_path)
        .map_err(|e| format!("Cannot read board.json: {e}"))?;
    let mut state: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Invalid board.json: {e}"))?;

    let items = state
        .get_mut("items")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| "Invalid board state structure (missing items array)".to_string())?;

    let item = items
        .iter_mut()
        .find(|item| {
            item.get("name")
                .and_then(|v| v.as_str())
                .map(|name| name == filename)
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("Item not found on board: {filename}"))?;

    if let Some(obj) = item.as_object_mut() {
        obj.insert("x".to_string(), serde_json::json!(x));
        obj.insert("y".to_string(), serde_json::json!(y));
    }

    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Cannot serialize board state: {e}"))?;
    fs::write(&board_path, json)
        .map_err(|e| format!("Cannot write board.json: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Update Item Metadata
// ---------------------------------------------------------------------------

/// Fields that can be updated on an image item.
#[derive(Debug, Default)]
pub struct UpdateFields {
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub styles: Option<Vec<String>>,
    pub moods: Option<Vec<String>>,
    pub era: Option<String>,
}

/// Update metadata for a single image in the search database.
///
/// Merges the provided fields with existing metadata (fields set to `None`
/// are left unchanged).
pub fn update_item_metadata(
    project_path: &str,
    filename: &str,
    fields: UpdateFields,
) -> Result<crate::search::ImageMetadataRow, String> {
    let image_path = Path::new(project_path)
        .join("images")
        .join(filename);
    let image_path_str = image_path.to_string_lossy().to_string();

    // Read existing metadata (if any) to merge
    let existing = crate::search::get_image_metadata(project_path, &image_path_str)
        .unwrap_or(None);

    let metadata = crate::search::ImageMetadataRow {
        image_path: image_path_str,
        name: filename.to_string(),
        description: fields.description.or_else(|| {
            existing.as_ref().and_then(|e| e.description.clone())
        }),
        tags: fields.tags.unwrap_or_else(|| {
            existing.as_ref().map(|e| e.tags.clone()).unwrap_or_default()
        }),
        style: fields.styles.unwrap_or_else(|| {
            existing.as_ref().map(|e| e.style.clone()).unwrap_or_default()
        }),
        mood: fields.moods.unwrap_or_else(|| {
            existing.as_ref().map(|e| e.mood.clone()).unwrap_or_default()
        }),
        colors: existing
            .as_ref()
            .map(|e| e.colors.clone())
            .unwrap_or_default(),
        era: fields.era.or_else(|| {
            existing.as_ref().and_then(|e| e.era.clone())
        }),
    };

    let conn = crate::search::open_db(project_path)?;
    crate::search::upsert_image(&conn, &metadata)?;

    Ok(metadata)
}

// ---------------------------------------------------------------------------
// List All Projects
// ---------------------------------------------------------------------------

/// List all known projects: recent list + scan of default Documents/Deco folder.
pub fn list_all_projects() -> Result<Vec<crate::ProjectInfo>, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let recent_path = Path::new(&home).join(".deco").join("recent.json");

    // Start with recent projects
    let mut projects = list_recent_projects(&recent_path)?;

    // Also scan the default Deco folder
    let default_folder = Path::new(&home).join("Documents").join("Deco");
    if default_folder.is_dir() {
        let existing_paths: std::collections::HashSet<String> =
            projects.iter().map(|p| p.path.clone()).collect();

        if let Ok(entries) = fs::read_dir(&default_folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let path_str = path.to_string_lossy().to_string();
                if existing_paths.contains(&path_str) {
                    continue;
                }
                // Check if it's a Deco project (has metadata.json, deco.json, or .deco/)
                let is_project = path.join("metadata.json").exists()
                    || path.join("deco.json").exists()
                    || path.join(".deco").is_dir();
                if is_project {
                    let name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let image_count = crate::count_images_in(&path);
                    projects.push(crate::ProjectInfo {
                        name,
                        path: path_str,
                        image_count,
                    });
                }
            }
        }
    }

    Ok(projects)
}

/// Read recent projects from a recent.json file.
fn list_recent_projects(recent_path: &Path) -> Result<Vec<crate::ProjectInfo>, String> {
    if !recent_path.exists() {
        return Ok(Vec::new());
    }

    #[derive(serde::Deserialize)]
    struct RecentEntry {
        name: String,
        path: String,
    }

    let contents = fs::read_to_string(recent_path)
        .map_err(|e| format!("Cannot read recent.json: {e}"))?;
    let entries: Vec<RecentEntry> =
        serde_json::from_str(&contents).unwrap_or_default();

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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_sim_identical() {
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![1.0f32, 0.0, 0.0];
        assert!((cosine_sim(&a, &b) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_sim_orthogonal() {
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![0.0f32, 1.0, 0.0];
        assert!(cosine_sim(&a, &b).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_sim_empty() {
        let a: Vec<f32> = vec![];
        let b: Vec<f32> = vec![];
        assert_eq!(cosine_sim(&a, &b), 0.0);
    }

    #[test]
    fn test_cosine_sim_mismatched_lengths() {
        let a = vec![1.0f32, 0.0];
        let b = vec![1.0f32];
        assert_eq!(cosine_sim(&a, &b), 0.0);
    }

    #[test]
    fn test_greedy_cluster_empty() {
        let result = greedy_cluster(&[], 0.7);
        assert_eq!(result.clusters.len(), 0);
        assert_eq!(result.ungrouped, 0);
    }

    #[test]
    fn test_greedy_cluster_all_identical() {
        let embeddings = vec![
            ("a.jpg".to_string(), vec![1.0f32, 0.0, 0.0]),
            ("b.jpg".to_string(), vec![1.0f32, 0.0, 0.0]),
            ("c.jpg".to_string(), vec![1.0f32, 0.0, 0.0]),
        ];
        let result = greedy_cluster(&embeddings, 0.9);
        assert_eq!(result.clusters.len(), 1);
        assert_eq!(result.clusters[0].size, 3);
        assert_eq!(result.ungrouped, 0);
    }

    #[test]
    fn test_greedy_cluster_all_orthogonal() {
        let embeddings = vec![
            ("a.jpg".to_string(), vec![1.0f32, 0.0, 0.0]),
            ("b.jpg".to_string(), vec![0.0f32, 1.0, 0.0]),
            ("c.jpg".to_string(), vec![0.0f32, 0.0, 1.0]),
        ];
        let result = greedy_cluster(&embeddings, 0.5);
        // All orthogonal → all singletons → no multi-clusters
        assert_eq!(result.clusters.len(), 0);
        assert_eq!(result.ungrouped, 3);
    }

    #[test]
    fn test_greedy_cluster_mixed() {
        let embeddings = vec![
            ("a.jpg".to_string(), vec![1.0f32, 0.0, 0.0]),
            ("b.jpg".to_string(), vec![0.95f32, 0.3, 0.0]),  // close to a
            ("c.jpg".to_string(), vec![0.0f32, 1.0, 0.0]),    // far from both
        ];
        let result = greedy_cluster(&embeddings, 0.8);
        // a and b should cluster, c is a singleton
        assert_eq!(result.clusters.len(), 1);
        assert_eq!(result.clusters[0].size, 2);
        assert_eq!(result.ungrouped, 1);
    }

    #[test]
    fn test_move_board_item_no_board() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let result = move_board_item(&project, "test.png", 100.0, 200.0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Board state not found"));
    }

    #[test]
    fn test_move_board_item_success() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let deco_dir = dir.path().join(".deco");
        std::fs::create_dir_all(&deco_dir).unwrap();

        let board = serde_json::json!({
            "items": [
                {"name": "photo.png", "x": 0, "y": 0},
                {"name": "other.jpg", "x": 50, "y": 50},
            ]
        });
        std::fs::write(
            deco_dir.join("board.json"),
            serde_json::to_string_pretty(&board).unwrap(),
        ).unwrap();

        let result = move_board_item(&project, "photo.png", 100.0, 200.0);
        assert!(result.is_ok());

        // Verify the position was updated
        let contents = std::fs::read_to_string(deco_dir.join("board.json")).unwrap();
        let updated: serde_json::Value = serde_json::from_str(&contents).unwrap();
        let items = updated["items"].as_array().unwrap();
        let item = items.iter().find(|i| i["name"] == "photo.png").unwrap();
        assert_eq!(item["x"].as_f64().unwrap(), 100.0);
        assert_eq!(item["y"].as_f64().unwrap(), 200.0);

        // Verify the other item was not changed
        let other = items.iter().find(|i| i["name"] == "other.jpg").unwrap();
        assert_eq!(other["x"].as_f64().unwrap(), 50.0);
    }

    #[test]
    fn test_move_board_item_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let deco_dir = dir.path().join(".deco");
        std::fs::create_dir_all(&deco_dir).unwrap();

        let board = serde_json::json!({"items": []});
        std::fs::write(
            deco_dir.join("board.json"),
            serde_json::to_string(&board).unwrap(),
        ).unwrap();

        let result = move_board_item(&project, "nonexistent.png", 0.0, 0.0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Item not found"));
    }

    #[test]
    fn test_update_item_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        // Initialize DB
        let _conn = crate::search::open_db(&project).unwrap();

        let fields = UpdateFields {
            description: Some("A test image".to_string()),
            tags: Some(vec!["art".to_string(), "modern".to_string()]),
            ..Default::default()
        };

        let result = update_item_metadata(&project, "test.png", fields);
        assert!(result.is_ok());
        let meta = result.unwrap();
        assert_eq!(meta.name, "test.png");
        assert_eq!(meta.description, Some("A test image".to_string()));
        assert_eq!(meta.tags, vec!["art", "modern"]);
    }
}
