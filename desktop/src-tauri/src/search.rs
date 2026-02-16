//! Search & Similarity module for Deco 2.0
//!
//! Provides:
//! - SQLite-backed metadata indexing with FTS5 full-text search
//! - Tag collection and filtering
//! - Embedding storage (BLOB) and brute-force cosine similarity
//! - Per-project database stored at `{project_path}/.deco/search.db`

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub image_path: String,
    pub name: String,
    pub score: f64,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataRow {
    pub image_path: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
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

// ---------------------------------------------------------------------------
// Database Connection Pool (per-project)
// ---------------------------------------------------------------------------

fn db_path(project_path: &str) -> PathBuf {
    Path::new(project_path)
        .join(".deco")
        .join("search.db")
}

/// Open the search database for a project (public for cross-module use).
pub fn open_db(project_path: &str) -> Result<Connection, String> {
    let path = db_path(project_path);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create .deco dir: {e}"))?;
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("Cannot open search database: {e}"))?;

    // WAL mode for better concurrent read performance
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Cannot set WAL mode: {e}"))?;

    init_schema(&conn)?;
    Ok(conn)
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- Image metadata table
        CREATE TABLE IF NOT EXISTS images (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            tags TEXT DEFAULT '',
            style TEXT DEFAULT '',
            mood TEXT DEFAULT '',
            colors TEXT DEFAULT '',
            era TEXT
        );

        -- FTS5 virtual table for full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
            name,
            description,
            tags,
            style,
            mood,
            era,
            content=images,
            content_rowid=rowid
        );

        -- Triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS images_ai AFTER INSERT ON images BEGIN
            INSERT INTO images_fts(rowid, name, description, tags, style, mood, era)
            VALUES (new.rowid, new.name, new.description, new.tags, new.style, new.mood, new.era);
        END;

        CREATE TRIGGER IF NOT EXISTS images_ad AFTER DELETE ON images BEGIN
            INSERT INTO images_fts(images_fts, rowid, name, description, tags, style, mood, era)
            VALUES ('delete', old.rowid, old.name, old.description, old.tags, old.style, old.mood, old.era);
        END;

        CREATE TRIGGER IF NOT EXISTS images_au AFTER UPDATE ON images BEGIN
            INSERT INTO images_fts(images_fts, rowid, name, description, tags, style, mood, era)
            VALUES ('delete', old.rowid, old.name, old.description, old.tags, old.style, old.mood, old.era);
            INSERT INTO images_fts(rowid, name, description, tags, style, mood, era)
            VALUES (new.rowid, new.name, new.description, new.tags, new.style, new.mood, new.era);
        END;

        -- Embeddings table for CLIP vectors (BLOB storage)
        CREATE TABLE IF NOT EXISTS embeddings (
            path TEXT PRIMARY KEY,
            model TEXT NOT NULL DEFAULT 'clip-vit-b-32',
            vector BLOB NOT NULL,
            dimensions INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        ",
    )
    .map_err(|e| format!("Schema init failed: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/// Index a single image's metadata into the search database.
pub fn upsert_image(conn: &Connection, meta: &ImageMetadataRow) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO images (path, name, description, tags, style, mood, colors, era)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            meta.image_path,
            meta.name,
            meta.description,
            meta.tags.join(" "),
            meta.style.join(" "),
            meta.mood.join(" "),
            meta.colors.join(" "),
            meta.era,
        ],
    )
    .map_err(|e| format!("Cannot upsert image metadata: {e}"))?;
    Ok(())
}

/// Index all images in a project directory. Scans for images and inserts
/// basic metadata (path, name). AI-generated metadata is merged separately.
pub fn index_project_images(
    project_path: &str,
    images: &[crate::ImageInfo],
) -> Result<usize, String> {
    let conn = open_db(project_path)?;
    let mut count = 0;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Cannot begin transaction: {e}"))?;

    for img in images {
        let name = &img.name;
        let path = &img.path;

        // Check if this image already exists (preserve existing metadata)
        let exists: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM images WHERE path = ?1",
                params![path],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if !exists {
            tx.execute(
                "INSERT INTO images (path, name) VALUES (?1, ?2)",
                params![path, name],
            )
            .map_err(|e| format!("Cannot insert image: {e}"))?;
            count += 1;
        }
    }

    tx.commit()
        .map_err(|e| format!("Cannot commit transaction: {e}"))?;
    Ok(count)
}

/// Update metadata for a single image (after AI analysis or manual edit).
pub fn update_image_metadata(
    project_path: &str,
    meta: &ImageMetadataRow,
) -> Result<(), String> {
    let conn = open_db(project_path)?;
    upsert_image(&conn, meta)
}

/// Get metadata for a single image by path.
pub fn get_image_metadata(
    project_path: &str,
    image_path: &str,
) -> Result<Option<ImageMetadataRow>, String> {
    let conn = open_db(project_path)?;
    let result = conn
        .query_row(
            "SELECT path, name, description, tags, style, mood, colors, era FROM images WHERE path = ?1",
            params![image_path],
            |row| {
                let tags_str: String = row.get(3)?;
                let style_str: String = row.get(4)?;
                let mood_str: String = row.get(5)?;
                let colors_str: String = row.get(6)?;
                Ok(ImageMetadataRow {
                    image_path: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    tags: tags_str.split_whitespace().map(String::from).collect(),
                    style: style_str.split_whitespace().map(String::from).collect(),
                    mood: mood_str.split_whitespace().map(String::from).collect(),
                    colors: colors_str.split_whitespace().map(String::from).collect(),
                    era: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Cannot query image metadata: {e}"))?;
    Ok(result)
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/// Delete an image's metadata and embedding from the search database.
/// FTS5 triggers handle cleaning up the `images_fts` table automatically.
pub fn delete_image_data(project_path: &str, image_path: &str) -> Result<(), String> {
    let conn = open_db(project_path)?;
    conn.execute("DELETE FROM embeddings WHERE path = ?1", params![image_path])
        .map_err(|e| format!("Cannot delete embedding: {e}"))?;
    conn.execute("DELETE FROM images WHERE path = ?1", params![image_path])
        .map_err(|e| format!("Cannot delete image metadata: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Full-Text Search
// ---------------------------------------------------------------------------

/// Search images using FTS5 full-text search.
/// The query supports FTS5 syntax: simple words, phrases ("quoted"), AND, OR, NOT.
pub fn search_text(project_path: &str, query: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let conn = open_db(project_path)?;

    // Escape the query for FTS5 — wrap each word in quotes for safety
    let safe_query = query
        .split_whitespace()
        .map(|w| {
            // If already quoted or uses FTS5 operators, pass through
            if w.starts_with('"') || w == "AND" || w == "OR" || w == "NOT" {
                w.to_string()
            } else {
                // Add wildcard for prefix matching
                format!("\"{w}\"*")
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    let mut stmt = conn
        .prepare(
            "SELECT i.path, i.name, i.description, i.tags,
                    bm25(images_fts) as score
             FROM images_fts
             JOIN images i ON images_fts.rowid = i.rowid
             WHERE images_fts MATCH ?1
             ORDER BY score
             LIMIT ?2",
        )
        .map_err(|e| format!("Search query failed: {e}"))?;

    let results = stmt
        .query_map(params![safe_query, limit as i64], |row| {
            let tags_str: String = row.get(3)?;
            Ok(SearchResult {
                image_path: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                tags: tags_str
                    .split_whitespace()
                    .map(String::from)
                    .collect(),
                score: row.get::<_, f64>(4)?.abs(), // bm25 returns negative scores
            })
        })
        .map_err(|e| format!("Search failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

// ---------------------------------------------------------------------------
// Tag Collection
// ---------------------------------------------------------------------------

/// Get all unique tags across all images in a project, with counts.
pub fn get_all_tags(project_path: &str) -> Result<Vec<TagCount>, String> {
    let conn = open_db(project_path)?;

    let mut stmt = conn
        .prepare("SELECT tags FROM images WHERE tags != ''")
        .map_err(|e| format!("Tag query failed: {e}"))?;

    let mut tag_counts: HashMap<String, usize> = HashMap::new();

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Tag fetch failed: {e}"))?;

    for row in rows {
        if let Ok(tags_str) = row {
            for tag in tags_str.split_whitespace() {
                let tag = tag.to_lowercase();
                if !tag.is_empty() {
                    *tag_counts.entry(tag).or_insert(0) += 1;
                }
            }
        }
    }

    let mut tags: Vec<TagCount> = tag_counts
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect();

    // Sort by count (descending), then alphabetically
    tags.sort_by(|a, b| b.count.cmp(&a.count).then(a.tag.cmp(&b.tag)));

    Ok(tags)
}

/// Get images that have a specific tag.
pub fn get_images_by_tag(project_path: &str, tag: &str) -> Result<Vec<String>, String> {
    let conn = open_db(project_path)?;
    let tag_lower = tag.to_lowercase();

    let mut stmt = conn
        .prepare("SELECT path, tags FROM images WHERE tags != ''")
        .map_err(|e| format!("Tag filter query failed: {e}"))?;

    let paths: Vec<String> = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let tags: String = row.get(1)?;
            Ok((path, tags))
        })
        .map_err(|e| format!("Tag filter failed: {e}"))?
        .filter_map(|r| r.ok())
        .filter(|(_, tags)| {
            tags.split_whitespace()
                .any(|t| t.to_lowercase() == tag_lower)
        })
        .map(|(path, _)| path)
        .collect();

    Ok(paths)
}

// ---------------------------------------------------------------------------
// Embeddings Storage & Similarity
// ---------------------------------------------------------------------------

/// Store a CLIP embedding vector (takes an open connection).
pub fn store_embedding_conn(
    conn: &Connection,
    image_path: &str,
    model: &str,
    embedding: &[f32],
) -> Result<(), String> {
    let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
    conn.execute(
        "INSERT OR REPLACE INTO embeddings (path, model, vector, dimensions)
         VALUES (?1, ?2, ?3, ?4)",
        params![image_path, model, bytes, embedding.len() as i64],
    )
    .map_err(|e| format!("Cannot store embedding: {e}"))?;
    Ok(())
}

/// Store a CLIP embedding vector for an image.
#[allow(dead_code)]
pub fn store_embedding(
    project_path: &str,
    image_path: &str,
    model: &str,
    embedding: &[f32],
) -> Result<(), String> {
    let conn = open_db(project_path)?;
    store_embedding_conn(&conn, image_path, model, embedding)
}

/// Retrieve a stored embedding vector.
pub fn get_embedding(conn: &Connection, image_path: &str) -> Result<Option<Vec<f32>>, String> {
    let mut stmt = conn
        .prepare("SELECT vector, dimensions FROM embeddings WHERE path = ?1")
        .map_err(|e| format!("Embedding query failed: {e}"))?;

    let result = stmt
        .query_row(params![image_path], |row| {
            let bytes: Vec<u8> = row.get(0)?;
            let dims: i64 = row.get(1)?;
            Ok((bytes, dims))
        })
        .optional()
        .map_err(|e| format!("Embedding fetch failed: {e}"))?;

    match result {
        Some((bytes, dims)) => {
            let floats: Vec<f32> = bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();
            if floats.len() != dims as usize {
                return Err("Embedding dimension mismatch".to_string());
            }
            Ok(Some(floats))
        }
        None => Ok(None),
    }
}

/// Retrieve all stored embeddings for a project.
/// Returns a vec of (image_path, embedding_vector) pairs.
pub fn get_all_embeddings(project_path: &str) -> Result<Vec<(String, Vec<f32>)>, String> {
    let conn = open_db(project_path)?;
    let mut stmt = conn
        .prepare("SELECT path, vector, dimensions FROM embeddings")
        .map_err(|e| format!("Embedding query failed: {e}"))?;

    let results: Vec<(String, Vec<f32>)> = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let bytes: Vec<u8> = row.get(1)?;
            let _dims: i64 = row.get(2)?;
            Ok((path, bytes))
        })
        .map_err(|e| format!("Embedding fetch failed: {e}"))?
        .filter_map(|r| r.ok())
        .map(|(path, bytes)| {
            let floats: Vec<f32> = bytes
                .chunks_exact(4)
                .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                .collect();
            (path, floats)
        })
        .collect();

    Ok(results)
}

/// Find similar images using cosine similarity on stored embeddings.
/// Returns up to `limit` results, excluding the query image itself.
pub fn find_similar(
    project_path: &str,
    image_path: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let conn = open_db(project_path)?;

    // Get the query image's embedding
    let query_vec = get_embedding(&conn, image_path)?
        .ok_or_else(|| format!("No embedding found for {image_path}"))?;

    // Get all other embeddings
    let mut stmt = conn
        .prepare(
            "SELECT e.path, i.name, i.description, i.tags, e.vector, e.dimensions
             FROM embeddings e
             JOIN images i ON e.path = i.path
             WHERE e.path != ?1",
        )
        .map_err(|e| format!("Similarity query failed: {e}"))?;

    let mut results: Vec<SearchResult> = stmt
        .query_map(params![image_path], |row| {
            let path: String = row.get(0)?;
            let name: String = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let tags_str: String = row.get(3)?;
            let bytes: Vec<u8> = row.get(4)?;
            let _dims: i64 = row.get(5)?;
            Ok((path, name, description, tags_str, bytes))
        })
        .map_err(|e| format!("Similarity search failed: {e}"))?
        .filter_map(|r| r.ok())
        .map(|(path, name, description, tags_str, bytes)| {
            let vec: Vec<f32> = bytes
                .chunks_exact(4)
                .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                .collect();
            let score = cosine_similarity(&query_vec, &vec);
            SearchResult {
                image_path: path,
                name,
                description,
                tags: tags_str.split_whitespace().map(String::from).collect(),
                score,
            }
        })
        .collect();

    // Sort by similarity (highest first)
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}

/// Find similar images using tag/style overlap (works without CLIP embeddings).
/// Uses Jaccard similarity on tags + style + mood fields.
pub fn find_similar_by_tags(
    project_path: &str,
    image_path: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let conn = open_db(project_path)?;

    // Get the query image's metadata
    let query_meta = conn
        .query_row(
            "SELECT tags, style, mood FROM images WHERE path = ?1",
            params![image_path],
            |row| {
                let tags: String = row.get(0)?;
                let style: String = row.get(1)?;
                let mood: String = row.get(2)?;
                Ok((tags, style, mood))
            },
        )
        .map_err(|e| format!("Cannot find image metadata: {e}"))?;

    let query_tokens: std::collections::HashSet<String> = query_meta
        .0
        .split_whitespace()
        .chain(query_meta.1.split_whitespace())
        .chain(query_meta.2.split_whitespace())
        .map(|s| s.to_lowercase())
        .collect();

    if query_tokens.is_empty() {
        return Ok(Vec::new());
    }

    // Get all other images
    let mut stmt = conn
        .prepare(
            "SELECT path, name, description, tags, style, mood
             FROM images WHERE path != ?1 AND (tags != '' OR style != '' OR mood != '')",
        )
        .map_err(|e| format!("Tag similarity query failed: {e}"))?;

    let mut results: Vec<SearchResult> = stmt
        .query_map(params![image_path], |row| {
            let path: String = row.get(0)?;
            let name: String = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let tags: String = row.get(3)?;
            let style: String = row.get(4)?;
            let mood: String = row.get(5)?;
            Ok((path, name, description, tags, style, mood))
        })
        .map_err(|e| format!("Tag similarity failed: {e}"))?
        .filter_map(|r| r.ok())
        .map(|(path, name, description, tags, style, mood)| {
            let tokens: std::collections::HashSet<String> = tags
                .split_whitespace()
                .chain(style.split_whitespace())
                .chain(mood.split_whitespace())
                .map(|s| s.to_lowercase())
                .collect();

            // Jaccard similarity
            let intersection = query_tokens.intersection(&tokens).count();
            let union = query_tokens.union(&tokens).count();
            let score = if union > 0 {
                intersection as f64 / union as f64
            } else {
                0.0
            };

            SearchResult {
                image_path: path,
                name,
                description,
                tags: tags.split_whitespace().map(String::from).collect(),
                score,
            }
        })
        .filter(|r| r.score > 0.0)
        .collect();

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}

// ---------------------------------------------------------------------------
// Math Utilities
// ---------------------------------------------------------------------------

/// Cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;

    for (x, y) in a.iter().zip(b.iter()) {
        let x = *x as f64;
        let y = *y as f64;
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Index all images in a project for search via storage backend.
#[tauri::command]
pub async fn cmd_index_project(
    storage: tauri::State<'_, crate::storage::Storage>,
    project_path: String,
) -> Result<usize, String> {
    let images = crate::scan_images_in(&project_path)?;
    let count = storage.index_images(&project_path, &images).await?;

    // Generate CLIP embeddings (best-effort, don't fail indexing)
    if let Err(e) = storage.embed_project(&project_path).await {
        eprintln!("CLIP embedding skipped: {e}");
    }

    Ok(count)
}

/// Full-text search across all metadata fields via storage backend.
#[tauri::command]
pub async fn cmd_search_text(
    storage: tauri::State<'_, crate::storage::Storage>,
    project_path: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    storage.search_text(&project_path, &query, limit.unwrap_or(50)).await
}

/// Get all tags with counts for the tag filter sidebar via storage backend.
#[tauri::command]
pub async fn cmd_get_all_tags(
    storage: tauri::State<'_, crate::storage::Storage>,
    project_path: String,
) -> Result<Vec<TagCount>, String> {
    storage.get_all_tags(&project_path).await
}

/// Get image paths that have a specific tag via storage backend.
#[tauri::command]
pub async fn cmd_filter_by_tag(
    storage: tauri::State<'_, crate::storage::Storage>,
    project_path: String,
    tag: String,
) -> Result<Vec<String>, String> {
    storage.get_images_by_tag(&project_path, &tag).await
}

/// Find similar images via storage backend.
#[tauri::command]
pub async fn cmd_find_similar(
    storage: tauri::State<'_, crate::storage::Storage>,
    project_path: String,
    image_path: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    storage.find_similar(&project_path, &image_path, limit.unwrap_or(10)).await
}

/// Update metadata for a single image via storage backend.
#[tauri::command]
pub async fn cmd_update_search_metadata(
    storage: tauri::State<'_, crate::storage::Storage>,
    project_path: String,
    metadata: ImageMetadataRow,
) -> Result<(), String> {
    storage.upsert_image_metadata(&project_path, &metadata).await
}

/// Search images by color similarity.
/// Finds images whose extracted color palette contains a color close to the query.
#[tauri::command]
pub async fn cmd_search_by_color(
    project_path: String,
    color: String,
    threshold: Option<f64>,
) -> Result<Vec<SearchResult>, String> {
    let threshold = threshold.unwrap_or(60.0); // RGB euclidean distance threshold
    let query_rgb = hex_to_rgb(&color).ok_or_else(|| format!("Invalid hex color: {color}"))?;

    let conn = open_db(&project_path)?;
    let mut stmt = conn
        .prepare("SELECT path, name, description, tags, colors FROM images WHERE colors != ''")
        .map_err(|e| format!("Color search query failed: {e}"))?;

    let mut results: Vec<(SearchResult, f64)> = stmt
        .query_map([], |row| {
            let colors_str: String = row.get(4)?;
            let tags_str: String = row.get(3)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                tags_str,
                colors_str,
            ))
        })
        .map_err(|e| format!("Color search failed: {e}"))?
        .filter_map(|r| r.ok())
        .filter_map(|(path, name, desc, tags_str, colors_str)| {
            let mut best_dist = f64::MAX;
            for hex in colors_str.split_whitespace() {
                if let Some(rgb) = hex_to_rgb(hex) {
                    let dist = color_distance(query_rgb, rgb);
                    if dist < best_dist {
                        best_dist = dist;
                    }
                }
            }
            if best_dist <= threshold {
                Some((
                    SearchResult {
                        image_path: path,
                        name,
                        score: 1.0 - (best_dist / threshold).min(1.0),
                        description: desc,
                        tags: tags_str.split_whitespace().map(String::from).collect(),
                    },
                    best_dist,
                ))
            } else {
                None
            }
        })
        .collect();

    results.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let results: Vec<SearchResult> = results.into_iter().map(|(r, _)| r).collect();
    crate::log::log("SEARCH", &format!("Color search for {} → {} results", color, results.len()));
    Ok(results)
}

/// Parse hex color string to (r, g, b) tuple.
fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r, g, b))
}

/// Euclidean distance between two RGB colors.
fn color_distance(a: (u8, u8, u8), b: (u8, u8, u8)) -> f64 {
    let dr = a.0 as f64 - b.0 as f64;
    let dg = a.1 as f64 - b.1 as f64;
    let db = a.2 as f64 - b.2 as f64;
    (dr * dr + dg * dg + db * db).sqrt()
}

/// Cluster project images by CLIP embedding similarity.
#[tauri::command]
pub async fn cmd_cluster_project(
    project_path: String,
    threshold: Option<f64>,
) -> Result<crate::ops::ClusterResult, String> {
    let threshold = threshold.unwrap_or(0.7);
    let embeddings = get_all_embeddings(&project_path)?;
    if embeddings.is_empty() {
        return Err("No embeddings found. Analyze images first to generate CLIP embeddings.".to_string());
    }
    crate::log::log("SEARCH", &format!("Clustering {} images with threshold {}", embeddings.len(), threshold));
    let result = crate::ops::greedy_cluster(&embeddings, threshold);
    crate::log::log("SEARCH", &format!("Found {} clusters, {} ungrouped", result.clusters.len(), result.ungrouped));
    Ok(result)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_project() -> (String, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_string_lossy().to_string();
        (path, dir)
    }

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);

        let c = vec![0.0, 1.0, 0.0];
        assert!(cosine_similarity(&a, &c).abs() < 1e-6);

        let d = vec![0.707, 0.707, 0.0];
        let sim = cosine_similarity(&a, &d);
        assert!(sim > 0.7 && sim < 0.71);
    }

    #[test]
    fn test_schema_init() {
        let (path, _dir) = temp_project();
        let conn = open_db(&path).unwrap();
        // Verify tables exist
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='images'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_upsert_and_search() {
        let (path, _dir) = temp_project();
        let conn = open_db(&path).unwrap();

        let meta = ImageMetadataRow {
            image_path: "/test/sculpture.jpg".to_string(),
            name: "sculpture.jpg".to_string(),
            description: Some("A bronze art-deco dancer sculpture".to_string()),
            tags: vec!["art-deco".to_string(), "sculpture".to_string(), "bronze".to_string()],
            style: vec!["geometric".to_string()],
            mood: vec!["elegant".to_string()],
            colors: vec!["#D4AF37".to_string()],
            era: Some("1920s".to_string()),
        };
        upsert_image(&conn, &meta).unwrap();

        // Search by description
        let results = search_text(&path, "bronze dancer", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].image_path, "/test/sculpture.jpg");
    }

    #[test]
    fn test_tag_collection() {
        let (path, _dir) = temp_project();
        let conn = open_db(&path).unwrap();

        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/a.jpg".to_string(),
            name: "a.jpg".to_string(),
            description: None,
            tags: vec!["art-deco".to_string(), "sculpture".to_string()],
            style: vec![], mood: vec![], colors: vec![], era: None,
        }).unwrap();

        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/b.jpg".to_string(),
            name: "b.jpg".to_string(),
            description: None,
            tags: vec!["art-deco".to_string(), "painting".to_string()],
            style: vec![], mood: vec![], colors: vec![], era: None,
        }).unwrap();

        let tags = get_all_tags(&path).unwrap();
        assert_eq!(tags[0].tag, "art-deco");
        assert_eq!(tags[0].count, 2);
        assert_eq!(tags.len(), 3);
    }

    #[test]
    fn test_embedding_storage_and_similarity() {
        let (path, _dir) = temp_project();
        let conn = open_db(&path).unwrap();

        // Insert two images with metadata
        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/a.jpg".to_string(),
            name: "a.jpg".to_string(),
            description: Some("Image A".to_string()),
            tags: vec!["test".to_string()],
            style: vec![], mood: vec![], colors: vec![], era: None,
        }).unwrap();

        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/b.jpg".to_string(),
            name: "b.jpg".to_string(),
            description: Some("Image B".to_string()),
            tags: vec!["test".to_string()],
            style: vec![], mood: vec![], colors: vec![], era: None,
        }).unwrap();

        // Store embeddings
        let vec_a = vec![1.0f32, 0.0, 0.0, 0.5];
        let vec_b = vec![0.9f32, 0.1, 0.0, 0.4];
        store_embedding(&path, "/test/a.jpg", "test", &vec_a).unwrap();
        store_embedding(&path, "/test/b.jpg", "test", &vec_b).unwrap();

        // Find similar to a.jpg
        let results = find_similar(&path, "/test/a.jpg", 5).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].image_path, "/test/b.jpg");
        assert!(results[0].score > 0.95); // Very similar vectors
    }

    #[test]
    fn test_tag_similarity() {
        let (path, _dir) = temp_project();
        let conn = open_db(&path).unwrap();

        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/a.jpg".to_string(),
            name: "a.jpg".to_string(),
            description: None,
            tags: vec!["art-deco".to_string(), "sculpture".to_string(), "bronze".to_string()],
            style: vec!["geometric".to_string()],
            mood: vec!["elegant".to_string()],
            colors: vec![], era: None,
        }).unwrap();

        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/b.jpg".to_string(),
            name: "b.jpg".to_string(),
            description: None,
            tags: vec!["art-deco".to_string(), "lamp".to_string(), "bronze".to_string()],
            style: vec!["geometric".to_string()],
            mood: vec![],
            colors: vec![], era: None,
        }).unwrap();

        upsert_image(&conn, &ImageMetadataRow {
            image_path: "/test/c.jpg".to_string(),
            name: "c.jpg".to_string(),
            description: None,
            tags: vec!["modern".to_string(), "painting".to_string()],
            style: vec!["abstract".to_string()],
            mood: vec!["energetic".to_string()],
            colors: vec![], era: None,
        }).unwrap();

        let results = find_similar_by_tags(&path, "/test/a.jpg", 10).unwrap();
        assert!(!results.is_empty());
        // b.jpg should be more similar (shares art-deco, bronze, geometric)
        assert_eq!(results[0].image_path, "/test/b.jpg");
    }
}
