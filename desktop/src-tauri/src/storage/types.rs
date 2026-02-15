//! Shared types for the storage abstraction layer.
//!
//! These types are used by both `LocalStorage` and future `CloudStorage`
//! implementations of `StorageProvider`.

use serde::{Deserialize, Serialize};

// Re-export config types from their origin modules so the trait can reference them
// without duplicating definitions.
pub use crate::ai::AiProviderConfig;
pub use crate::web::WebCollectionConfig;

/// Full app-level configuration.
/// Merges AI, Web, and general settings into one struct.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub ai: Option<AiProviderConfig>,
    #[serde(default)]
    pub web: Option<WebCollectionConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_port: Option<u16>,
    /// Default folder to scan for projects on startup (e.g. ~/Documents/RefBoard).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projects_folder: Option<String>,
    /// Storage path for local AI models (CLIP, ONNX). Default: system cache.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models_folder: Option<String>,
}

/// Recent project entry for the home screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub name: String,
    pub path: String,
}
