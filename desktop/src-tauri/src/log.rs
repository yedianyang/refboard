//! Unified logging for Deco.
//!
//! All `[CLIP]` and `[AI]` logs write to both stdout and `~/.deco/debug.log`.
//! Log file is truncated on open if it exceeds 5MB.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024; // 5MB

fn log_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".deco").join("debug.log")
}

/// Write a tagged log line to stdout and ~/.deco/debug.log.
pub fn log(tag: &str, msg: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{timestamp}] [{tag}] {msg}");
    println!("{line}");

    // Append to log file (best-effort, never panic)
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Truncate if file exceeds MAX_LOG_SIZE
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > MAX_LOG_SIZE {
            let _ = fs::write(&path, "");
        }
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{line}");
    }
}

/// Read the last N lines from the debug log file.
#[tauri::command]
pub fn cmd_read_log(lines: Option<usize>) -> Result<String, String> {
    let path = log_path();
    if !path.exists() {
        return Ok(String::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read log: {e}"))?;
    let n = lines.unwrap_or(100);
    let tail: Vec<&str> = contents.lines().rev().take(n).collect();
    // Reverse back to chronological order
    Ok(tail.into_iter().rev().collect::<Vec<_>>().join("\n"))
}
