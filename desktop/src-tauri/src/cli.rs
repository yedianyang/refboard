//! Deco CLI command definitions and handlers.
//!
//! Phase 1 commands: status, list, import, delete, search.
//! All commands call shared business logic directly (no Tauri, no HTTP API).

use clap::{Parser, Subcommand};
use std::path::Path;

// ---------------------------------------------------------------------------
// CLI Definition
// ---------------------------------------------------------------------------

#[derive(Parser)]
#[command(
    name = "deco",
    version,
    about = "AI-powered visual reference collector & moodboard tool"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,

    /// Output as JSON
    #[arg(long, global = true)]
    pub json: bool,
}

#[derive(Subcommand)]
pub enum Command {
    /// Show project status and app info
    Status {
        /// Project directory path
        #[arg(short, long)]
        project: Option<String>,
    },

    /// List images in a project
    List {
        /// Project directory path
        project: String,
    },

    /// Import images into a project
    Import {
        /// Image file paths to import
        paths: Vec<String>,
        /// Target project directory
        #[arg(short, long)]
        project: String,
    },

    /// Delete an image from a project
    Delete {
        /// Image filename to delete
        filename: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
    },

    /// Search images by text query (FTS5)
    Search {
        /// Search query
        query: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// Maximum number of results
        #[arg(short, long, default_value = "20")]
        limit: usize,
    },
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/// Run the CLI command dispatcher.
pub async fn run(cli: Cli) -> Result<(), String> {
    match cli.command {
        Command::Status { project } => cmd_status(project, cli.json),
        Command::List { project } => cmd_list(&project, cli.json),
        Command::Import { paths, project } => cmd_import(paths, &project, cli.json),
        Command::Delete { filename, project } => cmd_delete(&filename, &project, cli.json),
        Command::Search {
            query,
            project,
            limit,
        } => cmd_search(&query, &project, limit, cli.json),
    }
}

// ---------------------------------------------------------------------------
// Command Implementations
// ---------------------------------------------------------------------------

/// Show app version and optional project info.
fn cmd_status(project: Option<String>, json: bool) -> Result<(), String> {
    let version = env!("CARGO_PKG_VERSION");

    let (image_count, indexed) = if let Some(ref project_path) = project {
        let count = match crate::scan_images_in(project_path) {
            Ok(images) => images.len(),
            Err(_) => 0,
        };
        let db_exists = Path::new(project_path)
            .join(".deco")
            .join("search.db")
            .exists();
        (Some(count), Some(db_exists))
    } else {
        (None, None)
    };

    if json {
        let mut obj = serde_json::json!({
            "version": version,
        });
        if let Some(ref p) = project {
            obj["project"] = serde_json::json!(p);
        }
        if let Some(c) = image_count {
            obj["imageCount"] = serde_json::json!(c);
        }
        if let Some(i) = indexed {
            obj["indexed"] = serde_json::json!(i);
        }
        println!("{}", serde_json::to_string_pretty(&obj).unwrap());
    } else {
        println!("Deco v{version}");
        if let Some(ref p) = project {
            println!("Project: {p}");
            if let Some(c) = image_count {
                println!("Images: {c}");
            }
            if let Some(i) = indexed {
                println!("Indexed: {}", if i { "yes" } else { "no" });
            }
        }
    }

    Ok(())
}

/// List all images in a project directory.
fn cmd_list(project: &str, json: bool) -> Result<(), String> {
    let images = crate::scan_images_in(project)?;

    if json {
        let output = serde_json::to_string_pretty(&images)
            .map_err(|e| format!("Cannot serialize image list: {e}"))?;
        println!("{output}");
    } else {
        if images.is_empty() {
            println!("No images found in {project}");
        } else {
            println!("{} image(s) found:", images.len());
            for img in &images {
                println!("  {} ({}, {} bytes)", img.name, img.extension, img.size_bytes);
            }
        }
    }

    Ok(())
}

/// Import image files into a project.
fn cmd_import(paths: Vec<String>, project: &str, json: bool) -> Result<(), String> {
    if paths.is_empty() {
        return Err("No file paths provided".to_string());
    }

    let images_dir = Path::new(project).join("images");
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Cannot create images dir: {e}"))?;

    let mut imported: Vec<crate::ImageInfo> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for src_path_str in &paths {
        let src = Path::new(src_path_str);
        if !src.is_file() {
            errors.push(format!("Not a file: {src_path_str}"));
            continue;
        }

        let ext = match src.extension() {
            Some(e) => e.to_string_lossy().to_lowercase(),
            None => {
                errors.push(format!("No extension: {src_path_str}"));
                continue;
            }
        };

        // Validate extension using the same list as the core library
        let valid_extensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "tiff"];
        if !valid_extensions.contains(&ext.as_str()) {
            errors.push(format!("Unsupported format: {src_path_str}"));
            continue;
        }

        // Determine destination filename, adding counter suffix if needed
        let stem = src
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "image".to_string());

        let mut dest = images_dir.join(format!("{stem}.{ext}"));
        let mut counter = 2u32;
        while dest.exists() {
            dest = images_dir.join(format!("{stem}-{counter}.{ext}"));
            counter += 1;
        }

        match std::fs::copy(src, &dest) {
            Ok(_) => {
                let metadata = std::fs::metadata(&dest).map_err(|e| e.to_string())?;
                imported.push(crate::ImageInfo {
                    name: dest.file_name().unwrap().to_string_lossy().to_string(),
                    path: dest.to_string_lossy().to_string(),
                    size_bytes: metadata.len(),
                    extension: ext,
                });
            }
            Err(e) => {
                errors.push(format!("Cannot copy {src_path_str}: {e}"));
            }
        }
    }

    if json {
        let output = serde_json::json!({
            "imported": imported,
            "errors": errors,
            "count": imported.len(),
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&output).unwrap()
        );
    } else {
        for img in &imported {
            println!("Imported: {}", img.name);
        }
        for err in &errors {
            eprintln!("  Warning: {err}");
        }
        if imported.is_empty() && !errors.is_empty() {
            return Err("No files were imported".to_string());
        }
        println!("{} file(s) imported", imported.len());
    }

    Ok(())
}

/// Delete an image from a project.
fn cmd_delete(filename: &str, project: &str, json: bool) -> Result<(), String> {
    let images_dir = Path::new(project).join("images");
    let file_path = images_dir.join(filename);

    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    // Delete the file
    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Cannot delete {}: {e}", file_path.display()))?;

    // Remove from search index (best-effort)
    let full_path = file_path.to_string_lossy().to_string();
    if let Ok(conn) = crate::search::open_db(project) {
        let _ = conn.execute(
            "DELETE FROM images WHERE path = ?1",
            rusqlite::params![full_path],
        );
        let _ = conn.execute(
            "DELETE FROM embeddings WHERE path = ?1",
            rusqlite::params![full_path],
        );
    }

    if json {
        let output = serde_json::json!({
            "deleted": filename,
            "project": project,
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
    } else {
        println!("Deleted: {filename}");
    }

    Ok(())
}

/// Search images by text query using FTS5.
fn cmd_search(query: &str, project: &str, limit: usize, json: bool) -> Result<(), String> {
    let results = crate::search::search_text(project, query, limit)?;

    if json {
        let output = serde_json::to_string_pretty(&results)
            .map_err(|e| format!("Cannot serialize search results: {e}"))?;
        println!("{output}");
    } else {
        if results.is_empty() {
            println!("No results for \"{query}\"");
        } else {
            println!("{} result(s) for \"{}\":", results.len(), query);
            for r in &results {
                let desc = r
                    .description
                    .as_deref()
                    .unwrap_or("")
                    .chars()
                    .take(60)
                    .collect::<String>();
                let tags = if r.tags.is_empty() {
                    String::new()
                } else {
                    format!(" [{}]", r.tags.join(", "))
                };
                println!(
                    "  {:.2}  {}{}  {}",
                    r.score, r.name, tags, desc
                );
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_parse_status() {
        let cli = Cli::try_parse_from(["deco", "status"]).unwrap();
        assert!(!cli.json);
        match cli.command {
            Command::Status { project } => assert!(project.is_none()),
            _ => panic!("Expected Status command"),
        }
    }

    #[test]
    fn test_cli_parse_status_with_project() {
        let cli = Cli::try_parse_from(["deco", "status", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Status { project } => assert_eq!(project, Some("/tmp/test".to_string())),
            _ => panic!("Expected Status command"),
        }
    }

    #[test]
    fn test_cli_parse_list() {
        let cli = Cli::try_parse_from(["deco", "list", "/tmp/test"]).unwrap();
        match cli.command {
            Command::List { project } => assert_eq!(project, "/tmp/test"),
            _ => panic!("Expected List command"),
        }
    }

    #[test]
    fn test_cli_parse_import() {
        let cli =
            Cli::try_parse_from(["deco", "import", "a.png", "b.jpg", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Import { paths, project } => {
                assert_eq!(paths, vec!["a.png", "b.jpg"]);
                assert_eq!(project, "/tmp/test");
            }
            _ => panic!("Expected Import command"),
        }
    }

    #[test]
    fn test_cli_parse_delete() {
        let cli = Cli::try_parse_from(["deco", "delete", "photo.png", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Delete { filename, project } => {
                assert_eq!(filename, "photo.png");
                assert_eq!(project, "/tmp/test");
            }
            _ => panic!("Expected Delete command"),
        }
    }

    #[test]
    fn test_cli_parse_search() {
        let cli =
            Cli::try_parse_from(["deco", "search", "art deco", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Search {
                query,
                project,
                limit,
            } => {
                assert_eq!(query, "art deco");
                assert_eq!(project, "/tmp/test");
                assert_eq!(limit, 20);
            }
            _ => panic!("Expected Search command"),
        }
    }

    #[test]
    fn test_cli_parse_json_flag() {
        let cli = Cli::try_parse_from(["deco", "--json", "status"]).unwrap();
        assert!(cli.json);
    }

    #[test]
    fn test_status_no_project() {
        // Should succeed without a project
        let result = cmd_status(None, false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_status_json_no_project() {
        let result = cmd_status(None, true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_list_nonexistent_dir() {
        let result = cmd_list("/nonexistent/path/that/does/not/exist", false);
        assert!(result.is_err());
    }

    #[test]
    fn test_import_no_paths() {
        let result = cmd_import(vec![], "/tmp", false);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "No file paths provided");
    }

    #[test]
    fn test_delete_nonexistent_file() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        std::fs::create_dir_all(dir.path().join("images")).unwrap();

        let result = cmd_delete("nonexistent.png", &project, false);
        assert!(result.is_err());
    }

    #[test]
    fn test_list_empty_project() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        let result = cmd_list(&project, false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_import_and_list_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        // Create a fake image file to import
        let src_dir = tempfile::tempdir().unwrap();
        let src_file = src_dir.path().join("test.png");
        std::fs::write(&src_file, b"fake png data").unwrap();

        // Import
        let result = cmd_import(
            vec![src_file.to_string_lossy().to_string()],
            &project,
            false,
        );
        assert!(result.is_ok());

        // List should now show the imported file
        let images = crate::scan_images_in(&project).unwrap();
        assert_eq!(images.len(), 1);
        assert_eq!(images[0].name, "test.png");
    }

    #[test]
    fn test_delete_removes_file() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let images_dir = dir.path().join("images");
        std::fs::create_dir_all(&images_dir).unwrap();

        // Create a file to delete
        let file_path = images_dir.join("to_delete.png");
        std::fs::write(&file_path, b"fake data").unwrap();
        assert!(file_path.exists());

        let result = cmd_delete("to_delete.png", &project, false);
        assert!(result.is_ok());
        assert!(!file_path.exists());
    }
}
