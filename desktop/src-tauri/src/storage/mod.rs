//! Unified storage backend for Deco 2.0.
//!
//! Provides a `StorageProvider` trait that abstracts all persistence:
//! - Project metadata and configuration
//! - Board state (viewport, items, groups, annotations)
//! - Image metadata and search index
//! - CLIP embeddings and similarity search
//! - App-level config and recent projects
//!
//! ## Implementations
//!
//! - [`LocalStorage`] — SQLite + JSON files (current behavior, offline-first)
//! - Future: `CloudStorage` — REST API to cloud backend

pub mod local;
pub mod types;

use async_trait::async_trait;
use std::sync::Arc;

pub use local::LocalStorage;
pub use types::{AppConfig, RecentProject};

/// Type alias for the storage provider used throughout the app.
pub type Storage = Arc<dyn StorageProvider>;

/// Trait abstracting all Deco persistence operations.
///
/// All methods are async to support both local (SQLite/JSON) and future
/// cloud (HTTP/PostgreSQL) backends. The local implementation uses
/// `tokio::task::spawn_blocking` for synchronous SQLite calls.
#[async_trait]
pub trait StorageProvider: Send + Sync {
    // ---- Project Lifecycle ----

    /// Create a new project directory with initial files.
    async fn create_project(
        &self,
        name: &str,
        path: &str,
    ) -> Result<crate::ProjectInfo, String>;

    /// List recent projects from the app-level store.
    async fn list_recent_projects(&self) -> Result<Vec<crate::ProjectInfo>, String>;

    /// Add a project to the recent list.
    async fn add_to_recent(&self, name: &str, path: &str) -> Result<(), String>;

    // ---- Project Metadata ----

    /// Read project metadata from a project directory.
    async fn read_project_metadata(
        &self,
        project_path: &str,
    ) -> Result<crate::ProjectMetadata, String>;

    /// Write project metadata to a project directory.
    async fn write_project_metadata(
        &self,
        project_path: &str,
        meta: &crate::ProjectMetadata,
    ) -> Result<(), String>;

    // ---- Board State ----

    /// Save the board state (canvas layout) as JSON.
    async fn save_board_state(
        &self,
        project_path: &str,
        state: &serde_json::Value,
    ) -> Result<(), String>;

    /// Load the board state. Returns `None` if no saved state exists.
    async fn load_board_state(
        &self,
        project_path: &str,
    ) -> Result<Option<serde_json::Value>, String>;

    // ---- Image Metadata & Search ----

    /// Index a batch of images (insert basic metadata if not already present).
    async fn index_images(
        &self,
        project_path: &str,
        images: &[crate::ImageInfo],
    ) -> Result<usize, String>;

    /// Upsert full metadata for a single image.
    async fn upsert_image_metadata(
        &self,
        project_path: &str,
        meta: &crate::search::ImageMetadataRow,
    ) -> Result<(), String>;

    /// Full-text search across all metadata fields.
    async fn search_text(
        &self,
        project_path: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<crate::search::SearchResult>, String>;

    /// Get all tags with usage counts.
    async fn get_all_tags(
        &self,
        project_path: &str,
    ) -> Result<Vec<crate::search::TagCount>, String>;

    /// Get image paths that have a specific tag.
    async fn get_images_by_tag(
        &self,
        project_path: &str,
        tag: &str,
    ) -> Result<Vec<String>, String>;

    /// Query a single image's metadata row.
    async fn query_image_row(
        &self,
        project_path: &str,
        image_path: &str,
    ) -> Result<Option<serde_json::Value>, String>;

    // ---- Embeddings & Similarity ----

    /// Store a CLIP embedding vector for an image.
    async fn store_embedding(
        &self,
        project_path: &str,
        image_path: &str,
        model: &str,
        embedding: &[f32],
    ) -> Result<(), String>;

    /// Embed all images in a project that don't already have embeddings.
    async fn embed_project(
        &self,
        project_path: &str,
    ) -> Result<usize, String>;

    /// Find similar images (embeddings first, falls back to tag similarity).
    async fn find_similar(
        &self,
        project_path: &str,
        image_path: &str,
        limit: usize,
    ) -> Result<Vec<crate::search::SearchResult>, String>;

    /// Check if a CLIP embedding exists for a specific image.
    async fn has_embedding(
        &self,
        project_path: &str,
        image_path: &str,
    ) -> Result<bool, String>;

    // ---- App Config ----

    /// Read the full app configuration.
    async fn read_app_config(&self) -> Result<AppConfig, String>;

    /// Write the full app configuration (atomic replace).
    async fn write_app_config(&self, config: &AppConfig) -> Result<(), String>;

    /// Get the HTTP API port from config.
    async fn get_api_port(&self) -> u16;

    /// Scan a folder for Deco projects (subdirectories with deco.json, metadata.json, or .deco/).
    async fn scan_projects_folder(
        &self,
        folder: &str,
    ) -> Result<Vec<crate::ProjectInfo>, String>;
}
