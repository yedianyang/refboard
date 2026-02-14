//! CLIP image embedding using fastembed (ONNX Runtime + CoreML on Apple Silicon).
//!
//! Provides local CLIP ViT-B/32 inference for visual similarity search.
//! Model auto-downloads on first use (~150MB).

use fastembed::{ImageEmbedding, ImageEmbeddingModel, ImageInitOptions};
use std::sync::Mutex;

static MODEL: Mutex<Option<ImageEmbedding>> = Mutex::new(None);

fn get_or_init_model() -> Result<std::sync::MutexGuard<'static, Option<ImageEmbedding>>, String> {
    let mut guard = MODEL.lock().map_err(|e| format!("Model lock poisoned: {e}"))?;
    if guard.is_none() {
        let options = ImageInitOptions::new(ImageEmbeddingModel::ClipVitB32)
            .with_show_download_progress(true);
        let model = ImageEmbedding::try_new(options)
            .map_err(|e| format!("Cannot initialize CLIP model: {e}"))?;
        *guard = Some(model);
    }
    Ok(guard)
}

/// Embed a batch of image files using CLIP ViT-B/32.
pub fn embed_image_files(paths: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let guard = get_or_init_model()?;
    let model = guard.as_ref().unwrap();
    model
        .embed(paths.to_vec(), Some(32))
        .map_err(|e| format!("Embedding failed: {e}"))
}

/// Embed images that don't already have embeddings and store them in the project DB.
pub fn embed_and_store(project_path: &str, image_paths: &[String]) -> Result<usize, String> {
    let conn = crate::search::open_db(project_path)?;

    // Filter out images that already have embeddings
    let mut to_embed: Vec<String> = Vec::new();
    for path in image_paths {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM embeddings WHERE path = ?1",
                rusqlite::params![path],
                |row| row.get(0),
            )
            .map_err(|e| format!("Cannot check embedding: {e}"))?;
        if count == 0 {
            to_embed.push(path.clone());
        }
    }

    if to_embed.is_empty() {
        return Ok(0);
    }

    let embeddings = embed_image_files(&to_embed)?;

    for (path, embedding) in to_embed.iter().zip(embeddings.iter()) {
        crate::search::store_embedding_conn(&conn, path, "clip-vit-b-32", embedding)?;
    }

    Ok(to_embed.len())
}

#[tauri::command]
pub fn cmd_embed_project(project_path: String) -> Result<usize, String> {
    let images = crate::scan_images(project_path.clone())?;
    let paths: Vec<String> = images.iter().map(|i| i.path.clone()).collect();
    embed_and_store(&project_path, &paths)
}
