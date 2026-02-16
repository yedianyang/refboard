//! Deco CLI command definitions and handlers.
//!
//! Phase 1 commands: status, list, import, delete, search.
//! Phase 2 commands: embed, similar, semantic, cluster, info, tags.
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
        #[arg(short = 'n', long, default_value = "20")]
        limit: usize,
    },

    /// Generate CLIP embeddings for images in a project
    Embed {
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// Embed all images (including already embedded)
        #[arg(long)]
        all: bool,
    },

    /// Find visually similar images using CLIP cosine similarity
    Similar {
        /// Image path to find similarities for
        image_path: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// Maximum number of results
        #[arg(short = 'n', long, default_value = "10")]
        limit: usize,
    },

    /// Text-to-image semantic search (currently FTS5, CLIP text encoder planned)
    Semantic {
        /// Search query
        query: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// Maximum number of results
        #[arg(short = 'n', long, default_value = "20")]
        limit: usize,
    },

    /// Auto-cluster images by visual similarity
    Cluster {
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// Number of clusters (not used directly; uses threshold-based greedy clustering)
        #[arg(short = 'n', long, default_value = "5")]
        num_clusters: usize,
        /// Cosine similarity threshold for grouping (0.0-1.0)
        #[arg(short, long, default_value = "0.7")]
        threshold: f64,
    },

    /// Show metadata for a single image
    Info {
        /// Image path (full path or filename resolved from project/images/)
        image_path: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
    },

    /// List all tags in the project with counts
    Tags {
        /// Project directory path
        #[arg(short, long)]
        project: String,
    },

    /// List all known projects (recent + default folder)
    Projects,

    /// Move an item's position on the board
    Move {
        /// Image filename on the board
        filename: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// X coordinate
        #[arg(long)]
        x: f64,
        /// Y coordinate
        #[arg(long)]
        y: f64,
    },

    /// Update item metadata (tags, description, styles, moods, era)
    Update {
        /// Image filename
        filename: String,
        /// Project directory path
        #[arg(short, long)]
        project: String,
        /// Description text
        #[arg(short, long)]
        description: Option<String>,
        /// Comma-separated tags
        #[arg(long)]
        tags: Option<String>,
        /// Comma-separated styles
        #[arg(long)]
        styles: Option<String>,
        /// Comma-separated moods
        #[arg(long)]
        moods: Option<String>,
        /// Era string
        #[arg(long)]
        era: Option<String>,
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
        Command::Embed { project, all } => cmd_embed(&project, all, cli.json),
        Command::Similar {
            image_path,
            project,
            limit,
        } => cmd_similar(&image_path, &project, limit, cli.json),
        Command::Semantic {
            query,
            project,
            limit,
        } => cmd_semantic(&query, &project, limit, cli.json),
        Command::Cluster {
            project,
            num_clusters: _,
            threshold,
        } => cmd_cluster(&project, threshold, cli.json),
        Command::Info {
            image_path,
            project,
        } => cmd_info(&image_path, &project, cli.json),
        Command::Tags { project } => cmd_tags(&project, cli.json),
        Command::Projects => cmd_projects(cli.json),
        Command::Move {
            filename,
            project,
            x,
            y,
        } => cmd_move(&filename, &project, x, y, cli.json),
        Command::Update {
            filename,
            project,
            description,
            tags,
            styles,
            moods,
            era,
        } => cmd_update(&filename, &project, description, tags, styles, moods, era, cli.json),
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
// Phase 2: CLIP Embedding & Similarity Commands
// ---------------------------------------------------------------------------

/// Generate CLIP embeddings for images in a project.
fn cmd_embed(project: &str, _all: bool, json: bool) -> Result<(), String> {
    let images = crate::scan_images_in(project)?;
    if images.is_empty() {
        if json {
            let output = serde_json::json!({
                "embedded": 0,
                "cached": 0,
                "total": 0,
            });
            println!("{}", serde_json::to_string_pretty(&output).unwrap());
        } else {
            println!("No images found in {project}");
        }
        return Ok(());
    }

    let image_paths: Vec<String> = images.iter().map(|img| img.path.clone()).collect();
    let total = image_paths.len();

    // Index images first so the metadata table has entries
    crate::search::index_project_images(project, &images)?;

    let embedded = crate::embed::embed_and_store(project, &image_paths)?;
    let cached = total - embedded;

    if json {
        let output = serde_json::json!({
            "embedded": embedded,
            "cached": cached,
            "total": total,
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
    } else {
        println!(
            "Embedded {} new images ({} already cached)",
            embedded, cached
        );
    }

    Ok(())
}

/// Find visually similar images using CLIP cosine similarity.
fn cmd_similar(image_path: &str, project: &str, limit: usize, json: bool) -> Result<(), String> {
    // Resolve image path: if it's just a filename, prepend project/images/
    let resolved = resolve_image_path(image_path, project);

    let results = crate::search::find_similar(project, &resolved, limit).map_err(|e| {
        if e.contains("No embedding found") {
            format!(
                "No embedding found for \"{}\". Run `deco embed -p {}` first.",
                image_path, project
            )
        } else {
            e
        }
    })?;

    if json {
        let output = serde_json::to_string_pretty(&results)
            .map_err(|e| format!("Cannot serialize results: {e}"))?;
        println!("{output}");
    } else {
        if results.is_empty() {
            println!("No similar images found");
        } else {
            println!("{} similar image(s):", results.len());
            for r in &results {
                println!("  {:.4}  {}", r.score, r.name);
            }
        }
    }

    Ok(())
}

/// Text-to-image semantic search (currently uses FTS5; CLIP text encoder planned).
fn cmd_semantic(query: &str, project: &str, limit: usize, json: bool) -> Result<(), String> {
    // Currently delegates to the same FTS5 search as `search`.
    // A future version will use CLIP text-to-image embeddings for true
    // cross-modal semantic search.
    let results = crate::search::search_text(project, query, limit)?;

    if json {
        let output = serde_json::to_string_pretty(&results)
            .map_err(|e| format!("Cannot serialize results: {e}"))?;
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
                println!("  {:.2}  {}{}  {}", r.score, r.name, tags, desc);
            }
        }
    }

    Ok(())
}

/// Auto-cluster images by visual similarity using greedy agglomerative clustering.
fn cmd_cluster(project: &str, threshold: f64, json: bool) -> Result<(), String> {
    let threshold = threshold.clamp(0.0, 1.0);
    let all_embeddings = crate::search::get_all_embeddings(project)?;

    if all_embeddings.is_empty() {
        if json {
            let output = serde_json::json!({
                "clusters": [],
                "ungrouped": 0,
            });
            println!("{}", serde_json::to_string_pretty(&output).unwrap());
        } else {
            println!("No embeddings found. Run `deco embed -p {project}` first.");
        }
        return Ok(());
    }

    // Greedy agglomerative clustering (same algorithm as api.rs)
    let mut assigned = vec![false; all_embeddings.len()];
    let mut clusters: Vec<(usize, Vec<String>)> = Vec::new();

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

        clusters.push((clusters.len(), group));
    }

    // Separate singletons as ungrouped
    let ungrouped = clusters.iter().filter(|(_, items)| items.len() == 1).count();
    let multi_clusters: Vec<(usize, Vec<String>)> = clusters
        .into_iter()
        .filter(|(_, items)| items.len() >= 2)
        .enumerate()
        .map(|(i, (_, items))| (i, items))
        .collect();

    if json {
        let cluster_json: Vec<serde_json::Value> = multi_clusters
            .iter()
            .map(|(id, items)| {
                serde_json::json!({
                    "id": id,
                    "items": items.iter().map(|p| {
                        Path::new(p).file_name().unwrap_or_default().to_string_lossy().to_string()
                    }).collect::<Vec<_>>(),
                })
            })
            .collect();
        let output = serde_json::json!({
            "clusters": cluster_json,
            "ungrouped": ungrouped,
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
    } else {
        println!(
            "{} cluster(s) found ({} ungrouped singletons):",
            multi_clusters.len(),
            ungrouped
        );
        for (id, items) in &multi_clusters {
            println!("\n  Cluster {} ({} images):", id, items.len());
            for path in items {
                let name = Path::new(path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy();
                println!("    {name}");
            }
        }
    }

    Ok(())
}

/// Show metadata for a single image.
fn cmd_info(image_path: &str, project: &str, json: bool) -> Result<(), String> {
    let resolved = resolve_image_path(image_path, project);

    let meta = crate::search::get_image_metadata(project, &resolved)?
        .ok_or_else(|| {
            format!(
                "No metadata found for \"{}\". Run `deco embed -p {}` to index the project first.",
                image_path, project
            )
        })?;

    if json {
        let output = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("Cannot serialize metadata: {e}"))?;
        println!("{output}");
    } else {
        println!("Name:        {}", meta.name);
        if let Some(ref desc) = meta.description {
            println!("Description: {desc}");
        }
        if !meta.tags.is_empty() {
            println!("Tags:        {}", meta.tags.join(", "));
        }
        if !meta.style.is_empty() {
            println!("Style:       {}", meta.style.join(", "));
        }
        if !meta.mood.is_empty() {
            println!("Mood:        {}", meta.mood.join(", "));
        }
        if !meta.colors.is_empty() {
            println!("Colors:      {}", meta.colors.join(", "));
        }
        if let Some(ref era) = meta.era {
            println!("Era:         {era}");
        }
        println!("Path:        {}", meta.image_path);
    }

    Ok(())
}

/// List all tags in the project with counts.
fn cmd_tags(project: &str, json: bool) -> Result<(), String> {
    let tags = crate::search::get_all_tags(project)?;

    if json {
        let output = serde_json::to_string_pretty(&tags)
            .map_err(|e| format!("Cannot serialize tags: {e}"))?;
        println!("{output}");
    } else {
        if tags.is_empty() {
            println!("No tags found in project");
        } else {
            for t in &tags {
                println!("{} ({})", t.tag, t.count);
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Phase 3: Projects, Move, Update Commands
// ---------------------------------------------------------------------------

/// List all known projects (recent + default Deco folder).
fn cmd_projects(json: bool) -> Result<(), String> {
    let projects = crate::ops::list_all_projects()?;

    if json {
        let output = serde_json::to_string_pretty(&projects)
            .map_err(|e| format!("Cannot serialize project list: {e}"))?;
        println!("{output}");
    } else {
        if projects.is_empty() {
            println!("No projects found");
        } else {
            println!("{} project(s):", projects.len());
            for p in &projects {
                println!("  {} ({} images)  {}", p.name, p.image_count, p.path);
            }
        }
    }

    Ok(())
}

/// Move an item's position on the board.
fn cmd_move(filename: &str, project: &str, x: f64, y: f64, json: bool) -> Result<(), String> {
    crate::ops::move_board_item(project, filename, x, y)?;

    if json {
        let output = serde_json::json!({
            "moved": filename,
            "project": project,
            "x": x,
            "y": y,
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
    } else {
        println!("Moved {filename} to ({x}, {y})");
    }

    Ok(())
}

/// Update metadata for an image item.
fn cmd_update(
    filename: &str,
    project: &str,
    description: Option<String>,
    tags: Option<String>,
    styles: Option<String>,
    moods: Option<String>,
    era: Option<String>,
    json: bool,
) -> Result<(), String> {
    // Parse comma-separated strings into Vec<String>
    let parse_csv = |s: String| -> Vec<String> {
        s.split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect()
    };

    let fields = crate::ops::UpdateFields {
        description,
        tags: tags.map(parse_csv),
        styles: styles.map(parse_csv),
        moods: moods.map(parse_csv),
        era,
    };

    let meta = crate::ops::update_item_metadata(project, filename, fields)?;

    if json {
        let output = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("Cannot serialize metadata: {e}"))?;
        println!("{output}");
    } else {
        println!("Updated: {filename}");
        if let Some(ref desc) = meta.description {
            println!("  Description: {desc}");
        }
        if !meta.tags.is_empty() {
            println!("  Tags: {}", meta.tags.join(", "));
        }
        if !meta.style.is_empty() {
            println!("  Styles: {}", meta.style.join(", "));
        }
        if !meta.mood.is_empty() {
            println!("  Moods: {}", meta.mood.join(", "));
        }
        if let Some(ref era) = meta.era {
            println!("  Era: {era}");
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Resolve an image path: if it's just a filename, prepend {project}/images/.
fn resolve_image_path(image_path: &str, project: &str) -> String {
    let p = Path::new(image_path);
    if p.is_absolute() || p.parent().map(|par| par != Path::new("")).unwrap_or(false) {
        // Already has a directory component or is absolute
        image_path.to_string()
    } else {
        // Bare filename — resolve to project/images/{filename}
        Path::new(project)
            .join("images")
            .join(image_path)
            .to_string_lossy()
            .to_string()
    }
}

/// Cosine similarity between two f32 vectors.
fn cosine_sim(a: &[f32], b: &[f32]) -> f64 {
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
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
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

    // -----------------------------------------------------------------------
    // Phase 2: Argument parsing tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cli_parse_embed() {
        let cli = Cli::try_parse_from(["deco", "embed", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Embed { project, all } => {
                assert_eq!(project, "/tmp/test");
                assert!(!all);
            }
            _ => panic!("Expected Embed command"),
        }
    }

    #[test]
    fn test_cli_parse_embed_all() {
        let cli = Cli::try_parse_from(["deco", "embed", "-p", "/tmp/test", "--all"]).unwrap();
        match cli.command {
            Command::Embed { project, all } => {
                assert_eq!(project, "/tmp/test");
                assert!(all);
            }
            _ => panic!("Expected Embed command"),
        }
    }

    #[test]
    fn test_cli_parse_similar() {
        let cli = Cli::try_parse_from([
            "deco", "similar", "/tmp/test/images/photo.jpg", "-p", "/tmp/test",
        ])
        .unwrap();
        match cli.command {
            Command::Similar {
                image_path,
                project,
                limit,
            } => {
                assert_eq!(image_path, "/tmp/test/images/photo.jpg");
                assert_eq!(project, "/tmp/test");
                assert_eq!(limit, 10);
            }
            _ => panic!("Expected Similar command"),
        }
    }

    #[test]
    fn test_cli_parse_similar_with_limit() {
        let cli = Cli::try_parse_from([
            "deco", "similar", "photo.jpg", "-p", "/tmp/test", "-n", "5",
        ])
        .unwrap();
        match cli.command {
            Command::Similar {
                image_path,
                project,
                limit,
            } => {
                assert_eq!(image_path, "photo.jpg");
                assert_eq!(project, "/tmp/test");
                assert_eq!(limit, 5);
            }
            _ => panic!("Expected Similar command"),
        }
    }

    #[test]
    fn test_cli_parse_semantic() {
        let cli =
            Cli::try_parse_from(["deco", "semantic", "golden ratio", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Semantic {
                query,
                project,
                limit,
            } => {
                assert_eq!(query, "golden ratio");
                assert_eq!(project, "/tmp/test");
                assert_eq!(limit, 20);
            }
            _ => panic!("Expected Semantic command"),
        }
    }

    #[test]
    fn test_cli_parse_cluster() {
        let cli = Cli::try_parse_from(["deco", "cluster", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Cluster {
                project,
                num_clusters,
                threshold,
            } => {
                assert_eq!(project, "/tmp/test");
                assert_eq!(num_clusters, 5);
                assert!((threshold - 0.7).abs() < 1e-6);
            }
            _ => panic!("Expected Cluster command"),
        }
    }

    #[test]
    fn test_cli_parse_cluster_with_threshold() {
        let cli = Cli::try_parse_from([
            "deco", "cluster", "-p", "/tmp/test", "-n", "8", "-t", "0.85",
        ])
        .unwrap();
        match cli.command {
            Command::Cluster {
                project,
                num_clusters,
                threshold,
            } => {
                assert_eq!(project, "/tmp/test");
                assert_eq!(num_clusters, 8);
                assert!((threshold - 0.85).abs() < 1e-6);
            }
            _ => panic!("Expected Cluster command"),
        }
    }

    #[test]
    fn test_cli_parse_info() {
        let cli =
            Cli::try_parse_from(["deco", "info", "photo.jpg", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Info {
                image_path,
                project,
            } => {
                assert_eq!(image_path, "photo.jpg");
                assert_eq!(project, "/tmp/test");
            }
            _ => panic!("Expected Info command"),
        }
    }

    #[test]
    fn test_cli_parse_tags() {
        let cli = Cli::try_parse_from(["deco", "tags", "-p", "/tmp/test"]).unwrap();
        match cli.command {
            Command::Tags { project } => {
                assert_eq!(project, "/tmp/test");
            }
            _ => panic!("Expected Tags command"),
        }
    }

    // -----------------------------------------------------------------------
    // Phase 2: Helper tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_image_path_bare_filename() {
        let resolved = resolve_image_path("photo.jpg", "/tmp/project");
        assert_eq!(resolved, "/tmp/project/images/photo.jpg");
    }

    #[test]
    fn test_resolve_image_path_absolute() {
        let resolved = resolve_image_path("/full/path/to/photo.jpg", "/tmp/project");
        assert_eq!(resolved, "/full/path/to/photo.jpg");
    }

    #[test]
    fn test_resolve_image_path_with_dir() {
        let resolved = resolve_image_path("subdir/photo.jpg", "/tmp/project");
        assert_eq!(resolved, "subdir/photo.jpg");
    }

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

    // -----------------------------------------------------------------------
    // Phase 2: Functional tests (using tempdir + search DB)
    // -----------------------------------------------------------------------

    #[test]
    fn test_tags_empty_project() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        let result = cmd_tags(&project, false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_tags_with_data() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        // Insert test data
        let conn = crate::search::open_db(&project).unwrap();
        crate::search::upsert_image(
            &conn,
            &crate::search::ImageMetadataRow {
                image_path: "/test/a.jpg".to_string(),
                name: "a.jpg".to_string(),
                description: None,
                tags: vec!["art-deco".to_string(), "sculpture".to_string()],
                style: vec![],
                mood: vec![],
                colors: vec![],
                era: None,
            },
        )
        .unwrap();

        let result = cmd_tags(&project, true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_info_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        // Ensure DB is initialized
        let _conn = crate::search::open_db(&project).unwrap();

        let result = cmd_info("nonexistent.jpg", &project, false);
        assert!(result.is_err());
    }

    #[test]
    fn test_info_with_data() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        let conn = crate::search::open_db(&project).unwrap();
        let img_path = format!("{}/images/sculpture.jpg", project);
        crate::search::upsert_image(
            &conn,
            &crate::search::ImageMetadataRow {
                image_path: img_path.clone(),
                name: "sculpture.jpg".to_string(),
                description: Some("A bronze dancer".to_string()),
                tags: vec!["art-deco".to_string(), "sculpture".to_string()],
                style: vec!["geometric".to_string()],
                mood: vec!["elegant".to_string()],
                colors: vec!["#D4AF37".to_string()],
                era: Some("1920s".to_string()),
            },
        )
        .unwrap();

        let result = cmd_info(&img_path, &project, false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cluster_empty_project() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let _conn = crate::search::open_db(&project).unwrap();

        let result = cmd_cluster(&project, 0.7, false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_embed_empty_project() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        let result = cmd_embed(&project, false, false);
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Phase 3: Projects, Move, Update tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cli_parse_projects() {
        let cli = Cli::try_parse_from(["deco", "projects"]).unwrap();
        match cli.command {
            Command::Projects => {}
            _ => panic!("Expected Projects command"),
        }
    }

    #[test]
    fn test_cli_parse_move() {
        let cli = Cli::try_parse_from([
            "deco", "move", "photo.png", "-p", "/tmp/test", "--x", "100", "--y", "200",
        ])
        .unwrap();
        match cli.command {
            Command::Move {
                filename,
                project,
                x,
                y,
            } => {
                assert_eq!(filename, "photo.png");
                assert_eq!(project, "/tmp/test");
                assert!((x - 100.0).abs() < 1e-6);
                assert!((y - 200.0).abs() < 1e-6);
            }
            _ => panic!("Expected Move command"),
        }
    }

    #[test]
    fn test_cli_parse_update() {
        let cli = Cli::try_parse_from([
            "deco",
            "update",
            "photo.png",
            "-p",
            "/tmp/test",
            "-d",
            "A nice photo",
            "--tags",
            "art,modern",
        ])
        .unwrap();
        match cli.command {
            Command::Update {
                filename,
                project,
                description,
                tags,
                styles,
                moods,
                era,
            } => {
                assert_eq!(filename, "photo.png");
                assert_eq!(project, "/tmp/test");
                assert_eq!(description, Some("A nice photo".to_string()));
                assert_eq!(tags, Some("art,modern".to_string()));
                assert!(styles.is_none());
                assert!(moods.is_none());
                assert!(era.is_none());
            }
            _ => panic!("Expected Update command"),
        }
    }

    #[test]
    fn test_projects_runs_without_crash() {
        // cmd_projects reads from ~/.deco/recent.json and ~/Documents/Deco,
        // so it should succeed (returning empty or populated list).
        let result = cmd_projects(false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_move_via_cmd() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let deco_dir = dir.path().join(".deco");
        std::fs::create_dir_all(&deco_dir).unwrap();

        let board = serde_json::json!({
            "items": [
                {"name": "photo.png", "x": 0, "y": 0},
            ]
        });
        std::fs::write(
            deco_dir.join("board.json"),
            serde_json::to_string_pretty(&board).unwrap(),
        )
        .unwrap();

        let result = cmd_move("photo.png", &project, 150.0, 250.0, false);
        assert!(result.is_ok());

        // Verify position was written
        let contents = std::fs::read_to_string(deco_dir.join("board.json")).unwrap();
        let updated: serde_json::Value = serde_json::from_str(&contents).unwrap();
        let item = &updated["items"][0];
        assert_eq!(item["x"].as_f64().unwrap(), 150.0);
        assert_eq!(item["y"].as_f64().unwrap(), 250.0);
    }

    #[test]
    fn test_move_item_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();
        let deco_dir = dir.path().join(".deco");
        std::fs::create_dir_all(&deco_dir).unwrap();

        let board = serde_json::json!({"items": []});
        std::fs::write(
            deco_dir.join("board.json"),
            serde_json::to_string(&board).unwrap(),
        )
        .unwrap();

        let result = cmd_move("nonexistent.png", &project, 0.0, 0.0, false);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Item not found"));
    }

    #[test]
    fn test_update_via_cmd() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        // Initialize DB
        let _conn = crate::search::open_db(&project).unwrap();

        let result = cmd_update(
            "test.png",
            &project,
            Some("A beautiful painting".to_string()),
            Some("art,modern,abstract".to_string()),
            Some("impressionism".to_string()),
            None,
            Some("1920s".to_string()),
            false,
        );
        assert!(result.is_ok());

        // Verify the data was stored
        let img_path = format!("{}/images/test.png", project);
        let meta = crate::search::get_image_metadata(&project, &img_path)
            .unwrap()
            .expect("metadata should exist");
        assert_eq!(meta.description, Some("A beautiful painting".to_string()));
        assert_eq!(meta.tags, vec!["art", "modern", "abstract"]);
        assert_eq!(meta.style, vec!["impressionism"]);
        assert!(meta.mood.is_empty());
        assert_eq!(meta.era, Some("1920s".to_string()));
    }

    #[test]
    fn test_update_partial_fields() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().to_string_lossy().to_string();

        // Initialize DB and insert initial data
        let conn = crate::search::open_db(&project).unwrap();
        let img_path = format!("{}/images/photo.jpg", project);
        crate::search::upsert_image(
            &conn,
            &crate::search::ImageMetadataRow {
                image_path: img_path.clone(),
                name: "photo.jpg".to_string(),
                description: Some("Original description".to_string()),
                tags: vec!["original".to_string()],
                style: vec!["baroque".to_string()],
                mood: vec!["calm".to_string()],
                colors: vec!["#FF0000".to_string()],
                era: Some("1600s".to_string()),
            },
        )
        .unwrap();

        // Update only tags — other fields should be preserved
        let result = cmd_update(
            "photo.jpg",
            &project,
            None,
            Some("updated,tags".to_string()),
            None,
            None,
            None,
            true,
        );
        assert!(result.is_ok());

        let meta = crate::search::get_image_metadata(&project, &img_path)
            .unwrap()
            .expect("metadata should exist");
        assert_eq!(meta.description, Some("Original description".to_string()));
        assert_eq!(meta.tags, vec!["updated", "tags"]);
        assert_eq!(meta.style, vec!["baroque"]);
        assert_eq!(meta.mood, vec!["calm"]);
        assert_eq!(meta.era, Some("1600s".to_string()));
    }
}
