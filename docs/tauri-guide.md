# Tauri 2.0 Desktop App Guide

A practical, code-heavy reference for JavaScript/Node.js developers building a macOS desktop app with Tauri 2.0. Covers project structure, just-enough Rust, IPC commands, frontend integration, file system access, and image handling.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Rust Basics for JS Developers](#2-rust-basics-for-js-developers)
3. [tauri::command -- Rust Commands via IPC](#3-tauricommand----rust-commands-via-ipc)
4. [Frontend Integration](#4-frontend-integration)
5. [Setup Steps](#5-setup-steps)
6. [Tauri 2.0 vs 1.x](#6-tauri-20-vs-1x)
7. [File System Access](#7-file-system-access)
8. [Image Handling](#8-image-handling)

---

## 1. Project Structure

A Tauri 2.0 project has two halves: a **frontend** (HTML/JS/CSS or any framework) and a **Rust backend** in `src-tauri/`.

```
my-app/
├── package.json              # Frontend dependencies
├── index.html                # Frontend entry point
├── src/                      # Frontend source
│   ├── main.js               #   (or main.ts, App.svelte, etc.)
│   └── styles.css
├── src-tauri/                # Rust backend (everything Tauri)
│   ├── Cargo.toml            #   Rust dependencies (like package.json)
│   ├── Cargo.lock            #   Lockfile (like package-lock.json)
│   ├── build.rs              #   Build script (usually one line)
│   ├── tauri.conf.json       #   Main Tauri config
│   ├── src/
│   │   ├── main.rs           #   Desktop entry point (tiny, calls lib)
│   │   └── lib.rs            #   Your Rust code lives here
│   ├── capabilities/
│   │   └── default.json      #   Security permissions for the frontend
│   └── icons/
│       ├── icon.png
│       ├── icon.icns          #   macOS icon
│       └── icon.ico           #   Windows icon
```

### Key Files Explained

**`src-tauri/tauri.conf.json`** -- The central config. Controls app metadata, dev server URL, build output, window size, security, bundling, and plugin settings.

```json
{
  "productName": "my-app",
  "version": "0.1.0",
  "identifier": "com.mycompany.myapp",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "title": "My App",
    "windows": [
      {
        "label": "main",
        "title": "My App",
        "width": 1200,
        "height": 800,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost; style-src 'self' 'unsafe-inline'",
      "assetProtocol": {
        "enable": true,
        "scope": ["$HOME/**/*"]
      }
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": [
      "icons/icon.png",
      "icons/icon.icns"
    ],
    "macOS": {
      "minimumSystemVersion": "12.0"
    }
  },
  "plugins": {}
}
```

**`src-tauri/Cargo.toml`** -- Rust dependencies. Think of it as `package.json` for the Rust side.

```toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**`src-tauri/build.rs`** -- Usually one line:

```rust
fn main() {
    tauri_build::build()
}
```

**`src-tauri/src/main.rs`** -- Desktop entry point. Do not modify this; put your code in `lib.rs` instead.

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run()
}
```

**`src-tauri/src/lib.rs`** -- Where your Rust code lives. This is the shared entry point for desktop and mobile.

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // your commands go here
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**`src-tauri/capabilities/default.json`** -- Controls what the frontend is allowed to do:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-set-title",
    "fs:default"
  ]
}
```

---

## 2. Rust Basics for JS Developers

You do not need to learn all of Rust. Here is the subset you need for Tauri commands.

### Variable Declarations

```rust
// Immutable by default (like JS const)
let name = "hello";
let count = 42;

// Mutable (like JS let)
let mut counter = 0;
counter += 1;

// Type annotations (optional when the compiler can infer)
let name: String = String::from("hello");
let count: i32 = 42;
let flag: bool = true;
```

### String Types

Rust has two main string types. This trips up every JS developer.

```rust
// &str -- a string "slice" (borrowed, read-only, like a pointer to text)
let greeting: &str = "hello world";    // String literals are &str

// String -- an owned, heap-allocated string (like JS strings, growable)
let owned: String = String::from("hello world");
let also_owned: String = "hello world".to_string();

// Converting between them:
let s: String = greeting.to_string();  // &str -> String
let r: &str = &owned;                  // String -> &str (auto-coercion)

// Formatting strings (like JS template literals):
let msg = format!("Hello, {}! You have {} items.", name, count);
```

**Rule of thumb**: Use `String` for struct fields and return types. Use `&str` for function parameters when you just need to read the string.

### Structs (like JS Objects/Classes)

```rust
// Define a struct (like a TypeScript interface + class)
struct Project {
    name: String,
    path: String,
    image_count: usize,      // usize = unsigned integer (like array length)
}

// Create an instance (no "new" keyword needed)
let proj = Project {
    name: String::from("Art Deco"),
    path: String::from("/Users/me/art-deco"),
    image_count: 42,
};

// Access fields with dot notation (same as JS)
println!("{}", proj.name);
```

### impl Blocks (Methods)

```rust
struct Project {
    name: String,
    path: String,
}

// Methods go in an impl block (like a class body)
impl Project {
    // "Constructor" -- by convention called "new"
    fn new(name: &str, path: &str) -> Self {
        Self {
            name: name.to_string(),
            path: path.to_string(),
        }
    }

    // Method with &self (like JS this, read-only)
    fn display_name(&self) -> String {
        format!("{} ({})", self.name, self.path)
    }
}

let p = Project::new("Art Deco", "/Users/me/art-deco");
println!("{}", p.display_name());
```

### Option (Nullable Values)

Rust has no `null` or `undefined`. Instead, it uses `Option<T>`.

```rust
// Option is either Some(value) or None
let maybe_name: Option<String> = Some("hello".to_string());
let nothing: Option<String> = None;

// Unwrap safely with match (like switch)
match maybe_name {
    Some(name) => println!("Got: {}", name),
    None => println!("No value"),
}

// Or use if let for the common case
if let Some(name) = maybe_name {
    println!("Got: {}", name);
}

// Quick unwrap with a default (like JS ?? operator)
let name = maybe_name.unwrap_or("default".to_string());
```

### Result (Error Handling)

Rust has no try/catch. Functions that can fail return `Result<T, E>`.

```rust
// Result is either Ok(value) or Err(error)
fn read_config(path: &str) -> Result<String, String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    Ok("config contents".to_string())
}

// Handle with match
match read_config("/some/path") {
    Ok(contents) => println!("Config: {}", contents),
    Err(e) => println!("Error: {}", e),
}

// The ? operator -- propagates errors (like throwing, but explicit)
// Can only use inside functions that return Result
fn load_and_parse(path: &str) -> Result<String, String> {
    let contents = read_config(path)?;  // returns early if Err
    Ok(format!("Parsed: {}", contents))
}
```

### Serde (JSON Serialization)

Serde is Rust's standard for converting structs to/from JSON. Add `serde` with the `derive` feature to `Cargo.toml`.

```rust
use serde::{Serialize, Deserialize};

// Derive macros auto-generate the conversion code
#[derive(Serialize, Deserialize)]
struct Project {
    name: String,
    path: String,
    image_count: usize,
}

// Rust snake_case -> JS camelCase automatically:
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    project_name: String,     // becomes "projectName" in JSON
    file_count: usize,        // becomes "fileCount" in JSON
}

// Optional fields
#[derive(Serialize, Deserialize)]
struct Config {
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}
```

### Reading Files (std::fs)

```rust
use std::fs;
use std::path::Path;

// Read a file to a string (like fs.readFileSync in Node)
let contents = fs::read_to_string("/path/to/file.json")?;

// Read raw bytes (like fs.readFileSync with no encoding)
let bytes = fs::read("/path/to/image.png")?;

// Check if a path exists
let exists = Path::new("/some/path").exists();

// List files in a directory (like fs.readdirSync)
let entries = fs::read_dir("/some/directory")?;
for entry in entries {
    let entry = entry?;
    let path = entry.path();
    println!("{}", path.display());
}

// Write a file
fs::write("/path/to/output.txt", "file contents")?;

// Create a directory (like fs.mkdirSync with recursive)
fs::create_dir_all("/path/to/nested/dir")?;
```

### Vectors (Dynamic Arrays)

```rust
// Vec<T> is like a JS Array
let mut items: Vec<String> = Vec::new();
items.push("one".to_string());
items.push("two".to_string());

// Shorthand with the vec! macro
let items = vec!["one", "two", "three"];

// Iterate (like .forEach)
for item in &items {
    println!("{}", item);
}

// Map/collect (like .map)
let lengths: Vec<usize> = items.iter().map(|item| item.len()).collect();

// Filter
let long_items: Vec<&&str> = items.iter().filter(|item| item.len() > 3).collect();
```

---

## 3. tauri::command -- Rust Commands via IPC

Commands are Rust functions the frontend can call. They are the primary communication channel between JS and Rust.

### Basic Command

```rust
// src-tauri/src/lib.rs

#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

// Register it in the builder:
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Important**: Rust parameter names are converted to camelCase for the frontend. `invoke_message` in Rust becomes `invokeMessage` in JS.

### Returning Structured Data

```rust
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileInfo {
    name: String,
    path: String,
    size_bytes: u64,
    is_directory: bool,
}

#[tauri::command]
fn get_file_info(path: String) -> FileInfo {
    FileInfo {
        name: "example.png".to_string(),
        path: path,
        size_bytes: 1024,
        is_directory: false,
    }
}
```

### Error Handling in Commands

Commands that can fail must return `Result<T, String>` (or a custom serializable error type). The `Err` value becomes the rejected promise on the JS side.

```rust
#[tauri::command]
fn read_json_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))
}
```

For richer error types, create a custom error enum:

```rust
use serde::Serialize;

#[derive(Debug, Serialize)]
enum AppError {
    FileNotFound(String),
    ParseError(String),
    PermissionDenied(String),
}

// Implement Display so it works with .map_err()
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            AppError::FileNotFound(p) => write!(f, "File not found: {}", p),
            AppError::ParseError(m) => write!(f, "Parse error: {}", m),
            AppError::PermissionDenied(p) => write!(f, "Permission denied: {}", p),
        }
    }
}

#[tauri::command]
fn load_config(path: String) -> Result<serde_json::Value, AppError> {
    let contents = std::fs::read_to_string(&path)
        .map_err(|_| AppError::FileNotFound(path.clone()))?;
    let parsed: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| AppError::ParseError(e.to_string()))?;
    Ok(parsed)
}
```

### Async Commands

Use `async` for commands that do I/O or take time. This prevents blocking the main thread and freezing the UI.

```rust
#[tauri::command]
async fn read_large_file(path: String) -> Result<String, String> {
    // In async commands, you can use tokio's async file I/O
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}
```

**Note**: Async commands must return `Result`. Even if they cannot fail, use `Result<T, ()>`.

### State Management

Use `tauri::State` to share data across commands without globals. Wrap mutable state in `Mutex`.

```rust
use std::sync::Mutex;
use tauri::State;
use serde::Serialize;

// Define your state struct
#[derive(Default)]
struct AppState {
    projects: Vec<ProjectData>,
    last_opened: Option<String>,
}

#[derive(Clone, Serialize)]
struct ProjectData {
    name: String,
    path: String,
}

// Use State<Mutex<T>> for mutable shared state
#[tauri::command]
fn add_project(
    name: String,
    path: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<ProjectData>, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.projects.push(ProjectData { name, path });
    Ok(state.projects.clone())
}

#[tauri::command]
fn get_projects(state: State<'_, Mutex<AppState>>) -> Vec<ProjectData> {
    state.lock().unwrap().projects.clone()
}

// Register state in the builder:
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![add_project, get_projects])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Note**: You do not need `Arc` for state -- Tauri wraps it in `Arc` automatically. Just use `Mutex` (or `tokio::sync::Mutex` for async commands).

### Practical Example 1: Read a JSON File and Return Parsed Data

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardConfig {
    title: String,
    tags: Vec<String>,
    item_count: usize,
}

#[tauri::command]
fn read_board_config(path: String) -> Result<BoardConfig, String> {
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read file: {}", e))?;
    let config: BoardConfig = serde_json::from_str(&contents)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    Ok(config)
}
```

### Practical Example 2: List Files in a Directory

```rust
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    path: String,
    is_directory: bool,
    size_bytes: u64,
    extension: Option<String>,
}

#[tauri::command]
fn list_directory(dir_path: String) -> Result<Vec<DirEntry>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let path_buf = entry.path();

        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path_buf.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size_bytes: metadata.len(),
            extension: path_buf
                .extension()
                .map(|e| e.to_string_lossy().to_string()),
        });
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        b.is_directory.cmp(&a.is_directory)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
```

### Practical Example 3: Scan for Images and Return Metadata

```rust
use serde::Serialize;
use std::fs;
use std::path::Path;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageInfo {
    name: String,
    path: String,
    size_bytes: u64,
    extension: String,
}

#[tauri::command]
fn scan_images(dir_path: String) -> Result<Vec<ImageInfo>, String> {
    let path = Path::new(&dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut images = Vec::new();

    fn walk_dir(dir: &Path, images: &mut Vec<ImageInfo>) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if path.is_dir() {
                // Skip hidden directories
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    walk_dir(&path, images)?;
                }
            } else if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                if IMAGE_EXTENSIONS.contains(&ext_lower.as_str()) {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    images.push(ImageInfo {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        size_bytes: metadata.len(),
                        extension: ext_lower,
                    });
                }
            }
        }
        Ok(())
    }

    walk_dir(path, &mut images)?;
    images.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(images)
}
```

### Practical Example 4: Read and Write App Settings with State

```rust
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Settings {
    theme: String,
    default_directory: String,
    recent_projects: Vec<String>,
    window_width: u32,
    window_height: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            default_directory: "~".to_string(),
            recent_projects: Vec::new(),
            window_width: 1200,
            window_height: 800,
        }
    }
}

#[tauri::command]
fn get_settings(state: State<'_, Mutex<Settings>>) -> Settings {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn update_settings(
    new_settings: Settings,
    state: State<'_, Mutex<Settings>>,
) -> Result<(), String> {
    // Update in-memory state
    let mut current = state.lock().map_err(|e| e.to_string())?;
    *current = new_settings.clone();

    // Persist to disk
    let json = serde_json::to_string_pretty(&new_settings)
        .map_err(|e| e.to_string())?;
    let config_path = dirs::config_dir()
        .ok_or("Cannot find config directory")?
        .join("my-app")
        .join("settings.json");
    std::fs::create_dir_all(config_path.parent().unwrap())
        .map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json)
        .map_err(|e| e.to_string())?;

    Ok(())
}

// In the builder:
// .manage(Mutex::new(Settings::default()))
```

### Registering Multiple Commands

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(AppState::default()))
        .manage(Mutex::new(Settings::default()))
        .invoke_handler(tauri::generate_handler![
            greet,
            read_board_config,
            list_directory,
            scan_images,
            get_settings,
            update_settings,
            add_project,
            get_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 4. Frontend Integration

### Calling Commands with invoke()

```javascript
import { invoke } from '@tauri-apps/api/core';

// Simple command with a return value
const greeting = await invoke('greet', { name: 'World' });
console.log(greeting); // "Hello, World!"

// Command returning structured data
const config = await invoke('read_board_config', {
  path: '/Users/me/project/board.json'
});
console.log(config.title);     // Fields are already camelCase
console.log(config.itemCount); // Thanks to #[serde(rename_all = "camelCase")]

// Command returning an array
const files = await invoke('list_directory', {
  dirPath: '/Users/me/projects'
});
files.forEach(f => {
  console.log(`${f.name} (${f.isDirectory ? 'dir' : f.sizeBytes + 'b'})`);
});

// Error handling (Err from Rust becomes a rejected promise)
try {
  const data = await invoke('read_board_config', { path: '/bad/path' });
} catch (error) {
  console.error('Command failed:', error); // The string from Err(...)
}
```

**Argument naming rule**: JS camelCase maps to Rust snake_case automatically.
- JS: `{ dirPath: '/some/path' }` maps to Rust: `fn cmd(dir_path: String)`
- JS: `{ invokeMessage: 'hi' }` maps to Rust: `fn cmd(invoke_message: String)`

### Event System (emit / listen)

Events are for push-style communication from Rust to JS (and vice versa). Unlike commands, events are fire-and-forget with no return value.

**Listening for events from Rust (in JavaScript):**

```javascript
import { listen } from '@tauri-apps/api/event';

// Listen for a global event
const unlisten = await listen('scan-progress', (event) => {
  console.log('Progress:', event.payload); // { current: 5, total: 20 }
});

// Stop listening when done (important for cleanup)
unlisten();

// Listen on a specific webview window
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const appWindow = getCurrentWebviewWindow();
const unlisten2 = await appWindow.listen('file-changed', (event) => {
  console.log('File changed:', event.payload);
});
```

**Emitting events from Rust:**

```rust
use tauri::{AppHandle, Emitter};
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    current: usize,
    total: usize,
    current_file: String,
}

#[tauri::command]
fn start_scan(app: AppHandle, dir_path: String) {
    // Emit progress events as work happens
    let files = vec!["a.png", "b.jpg", "c.gif"];
    let total = files.len();

    for (i, file) in files.iter().enumerate() {
        app.emit("scan-progress", ScanProgress {
            current: i + 1,
            total,
            current_file: file.to_string(),
        }).unwrap();
    }

    app.emit("scan-complete", dir_path).unwrap();
}
```

**Emitting events from JavaScript to Rust:**

```javascript
import { emit } from '@tauri-apps/api/event';

await emit('frontend-ready', { timestamp: Date.now() });
```

**Listening in Rust:**

```rust
use tauri::Listener;

// In the setup hook:
.setup(|app| {
    app.listen("frontend-ready", |event| {
        println!("Frontend is ready: {}", event.payload());
    });
    Ok(())
})
```

### Channels (Streaming Data)

For streaming results (like progress updates tied to a specific command call), use Channels. They are more efficient than events for command-scoped communication.

**Rust side:**

```rust
use tauri::ipc::Channel;
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum ScanEvent {
    Started { total: usize },
    Progress { current: usize, file: String },
    Finished { image_count: usize },
}

#[tauri::command]
fn scan_with_progress(
    dir_path: String,
    on_event: Channel<ScanEvent>,
) -> Result<(), String> {
    let entries: Vec<_> = std::fs::read_dir(&dir_path)
        .map_err(|e| e.to_string())?
        .collect();
    let total = entries.len();

    on_event.send(ScanEvent::Started { total }).unwrap();

    let mut image_count = 0;
    for (i, entry) in entries.into_iter().enumerate() {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        on_event.send(ScanEvent::Progress { current: i + 1, file: name }).unwrap();
        image_count += 1;
    }

    on_event.send(ScanEvent::Finished { image_count }).unwrap();
    Ok(())
}
```

**JavaScript side:**

```javascript
import { invoke, Channel } from '@tauri-apps/api/core';

const onEvent = new Channel();
onEvent.onmessage = (message) => {
  switch (message.event) {
    case 'started':
      console.log(`Scanning ${message.data.total} items...`);
      break;
    case 'progress':
      console.log(`[${message.data.current}] ${message.data.file}`);
      break;
    case 'finished':
      console.log(`Done! Found ${message.data.imageCount} images.`);
      break;
  }
};

await invoke('scan_with_progress', { dirPath: '/some/path', onEvent });
```

---

## 5. Setup Steps

### Prerequisites (macOS)

**1. Xcode Command Line Tools** (required):

```bash
xcode-select --install
```

If you plan to target iOS as well, install full Xcode from the Mac App Store and launch it once to complete setup.

**2. Rust** (required):

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

Restart your terminal, then verify:

```bash
rustc --version
cargo --version
```

**3. Node.js** (required for JS frontend):

Install the LTS version from [nodejs.org](https://nodejs.org) or via a version manager:

```bash
# Using nvm:
nvm install --lts

# Verify:
node -v
npm -v
```

### Create a New Project

**Option A: Interactive scaffolding (recommended)**

```bash
# Using npm:
npm create tauri-app@latest

# Using cargo:
cargo install create-tauri-app --locked
cargo create-tauri-app
```

The wizard prompts:
1. **Project name** -- e.g., `deco-desktop`
2. **Identifier** -- e.g., `com.deco.app`
3. **Frontend language** -- TypeScript / JavaScript
4. **Package manager** -- npm / pnpm / yarn / bun
5. **UI template** -- Vanilla, React, Vue, Svelte, Solid, etc.
6. **UI flavor** -- TypeScript or JavaScript

```bash
cd deco-desktop
npm install
```

**Option B: Add Tauri to an existing project**

```bash
# Install the Tauri CLI as a dev dependency
npm install -D @tauri-apps/cli@latest

# Initialize Tauri in your project
npx tauri init
```

The init command asks for your dev server URL and frontend build output directory, then creates the `src-tauri/` folder.

### Development Mode

```bash
npm run tauri dev
```

This does three things:
1. Starts your frontend dev server (e.g., Vite on port 5173)
2. Compiles the Rust backend (first build takes 1-3 minutes, subsequent builds are fast)
3. Opens a native window pointing to your dev server with hot reload

### Building for macOS

```bash
# Build .app bundle:
npm run tauri build -- --bundles app

# Build .dmg installer:
npm run tauri build -- --bundles dmg

# Build both:
npm run tauri build -- --bundles app,dmg

# Build everything (all supported formats):
npm run tauri build
```

Output location:
- `.app` bundle: `src-tauri/target/release/bundle/macos/MyApp.app`
- `.dmg` installer: `src-tauri/target/release/bundle/dmg/MyApp_x.y.z_aarch64.dmg`

**DMG customization** in `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "dmg": {
        "windowSize": { "width": 660, "height": 400 },
        "appPosition": { "x": 180, "y": 170 },
        "applicationFolderPosition": { "x": 480, "y": 170 }
      },
      "minimumSystemVersion": "12.0"
    }
  }
}
```

---

## 6. Tauri 2.0 vs 1.x

Key differences for anyone reading older tutorials or migrating:

| Area | Tauri 1.x | Tauri 2.0 |
|------|-----------|-----------|
| **Security model** | `allowlist` in tauri.conf.json (boolean flags) | Capabilities + Permissions system (granular, per-window, scoped) |
| **Core APIs** | Built into tauri core | Moved to separate plugins (fs, dialog, http, clipboard, shell, etc.) |
| **Mobile** | Desktop only | iOS + Android support |
| **Config keys** | `tauri.windows`, `package.productName` | `app.windows`, top-level `productName` |
| **Dev path** | `build.devPath` | `build.devUrl` |
| **Build output** | `build.distDir` | `build.frontendDist` |
| **JS imports** | `@tauri-apps/api/tauri` | `@tauri-apps/api/core` |
| **Window type** | `Window` | `WebviewWindow` |
| **Window access** | `Manager::get_window()` | `Manager::get_webview_window()` |
| **Plugin config** | N/A | `plugins` section in tauri.conf.json |
| **Multi-webview** | No | Yes (unstable feature flag) |

### What Moved to Plugins

These were built-in in 1.x and now require separate plugin installation:

| Plugin | Cargo crate | npm package |
|--------|-------------|-------------|
| File System | `tauri-plugin-fs` | `@tauri-apps/plugin-fs` |
| Dialog (open/save) | `tauri-plugin-dialog` | `@tauri-apps/plugin-dialog` |
| HTTP Client | `tauri-plugin-http` | `@tauri-apps/plugin-http` |
| Shell (open URLs) | `tauri-plugin-shell` | `@tauri-apps/plugin-shell` |
| Clipboard | `tauri-plugin-clipboard-manager` | `@tauri-apps/plugin-clipboard-manager` |
| Notification | `tauri-plugin-notification` | `@tauri-apps/plugin-notification` |
| Global Shortcut | `tauri-plugin-global-shortcut` | `@tauri-apps/plugin-global-shortcut` |
| Process | `tauri-plugin-process` | `@tauri-apps/plugin-process` |
| Updater | `tauri-plugin-updater` | `@tauri-apps/plugin-updater` |

### The New Permission System

The 1.x `allowlist` was a set of boolean flags:

```json
// OLD -- Tauri 1.x (DO NOT USE)
{
  "tauri": {
    "allowlist": {
      "fs": { "readFile": true, "scope": ["$HOME/**"] }
    }
  }
}
```

Tauri 2.0 replaces this with **Capabilities** (which windows get which permissions) and **Permissions** (what actions are allowed with what scope):

```json
// NEW -- Tauri 2.0
// src-tauri/capabilities/default.json
{
  "identifier": "main-capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-read-dir",
    {
      "identifier": "fs:scope",
      "allow": [
        "$HOME/**/*",
        "$DOCUMENT/**/*"
      ],
      "deny": [
        "$HOME/.ssh/**/*"
      ]
    }
  ]
}
```

Capabilities can be platform-specific:

```json
{
  "identifier": "desktop-capability",
  "windows": ["main"],
  "platforms": ["macOS", "linux", "windows"],
  "permissions": [
    "global-shortcut:allow-register"
  ]
}
```

---

## 7. File System Access

Tauri 2.0 provides file system access through two approaches: **custom Rust commands** (full control) and the **fs plugin** (convenience API callable directly from JS).

### Approach 1: Custom Rust Commands (Recommended for Complex Logic)

Write your own `#[tauri::command]` functions (see Section 3). This gives you full Rust `std::fs` access with no permission restrictions on the Rust side. The security boundary is at the IPC layer -- you control exactly what the frontend can request.

### Approach 2: The fs Plugin (Quick JS-Side File Access)

**Install:**

```bash
# Adds both Rust and JS dependencies:
npm run tauri add fs
```

Or manually:

```bash
# Rust side:
cd src-tauri && cargo add tauri-plugin-fs

# JS side:
npm install @tauri-apps/plugin-fs
```

**Register the plugin** in `src-tauri/src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())   // <-- add this
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Configure permissions** in `src-tauri/capabilities/default.json`:

```json
{
  "identifier": "main-capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-read-file",
    "fs:allow-read-dir",
    "fs:allow-write-text-file",
    "fs:allow-exists",
    "fs:allow-mkdir",
    {
      "identifier": "fs:scope",
      "allow": [
        "$HOME/**/*",
        "$DOCUMENT/**/*",
        "$APPDATA/**/*"
      ],
      "deny": [
        "$HOME/.ssh/**/*",
        "$HOME/.gnupg/**/*"
      ]
    }
  ]
}
```

**Scope variables** -- these resolve to platform-appropriate paths:

| Variable | macOS Path |
|----------|------------|
| `$HOME` | `/Users/username` |
| `$APPDATA` | `~/Library/Application Support/com.myapp` |
| `$APPCONFIG` | `~/Library/Application Support/com.myapp` |
| `$APPCACHE` | `~/Library/Caches/com.myapp` |
| `$APPLOG` | `~/Library/Logs/com.myapp` |
| `$DOCUMENT` | `~/Documents` |
| `$DOWNLOAD` | `~/Downloads` |
| `$DESKTOP` | `~/Desktop` |
| `$PICTURE` | `~/Pictures` |
| `$TEMP` | `/tmp` |
| `$RESOURCE` | Inside the .app bundle |

**JavaScript API usage:**

```javascript
import {
  readTextFile,
  readFile,
  readDir,
  writeTextFile,
  exists,
  mkdir,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

// Read a text file (returns string)
const json = await readTextFile('settings.json', {
  baseDir: BaseDirectory.AppData,
});
const settings = JSON.parse(json);

// Read a binary file (returns Uint8Array)
const imageBytes = await readFile('icon.png', {
  baseDir: BaseDirectory.Resource,
});

// Read with an absolute path (must be within allowed scope)
const content = await readTextFile('/Users/me/projects/board.json');

// List directory contents
const entries = await readDir('/Users/me/projects/images');
for (const entry of entries) {
  console.log(entry.name, entry.isDirectory);
}

// Write a text file
await writeTextFile(
  'recent.json',
  JSON.stringify({ projects: ['a', 'b'] }),
  { baseDir: BaseDirectory.AppData }
);

// Check if a file exists
const hasConfig = await exists('config.json', {
  baseDir: BaseDirectory.AppConfig,
});

// Create a directory
await mkdir('cache/thumbnails', {
  baseDir: BaseDirectory.AppData,
  recursive: true,          // like mkdir -p
});
```

### Security Notes

- **deny overrides allow**: If a path matches both an allow and deny scope, it is denied.
- **No path traversal**: The plugin rejects paths containing `../`, preventing escape from scoped directories.
- **Per-window**: Capabilities are assigned to specific window labels, so a secondary window can have different permissions.
- **Prefer custom commands**: For sensitive operations, write Rust commands instead of relying on the fs plugin. The Rust side has no restrictions; you control the interface.

---

## 8. Image Handling

Displaying local filesystem images in the Tauri WebView requires special handling because the WebView runs in a sandboxed context (not `file://`).

### The Asset Protocol

Tauri provides an `asset://` protocol that serves local files to the WebView. This is the primary way to display local images.

**Step 1: Enable in `tauri.conf.json`:**

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost; style-src 'self' 'unsafe-inline'",
      "assetProtocol": {
        "enable": true,
        "scope": [
          "$HOME/**/*",
          "$DOCUMENT/**/*",
          "$PICTURE/**/*"
        ]
      }
    }
  }
}
```

**Important CSP detail**: You must include both `asset:` and `http://asset.localhost` in `img-src` because different platforms use different URL schemes internally.

**Step 2: Convert file paths in JavaScript:**

```javascript
import { convertFileSrc } from '@tauri-apps/api/core';

// Convert a local file path to a WebView-loadable URL
const imagePath = '/Users/me/projects/art-deco/reference.png';
const assetUrl = convertFileSrc(imagePath);
// Returns something like: asset://localhost/Users/me/projects/art-deco/reference.png
// or on Windows: https://asset.localhost/C%3A/Users/me/...

// Use in an <img> tag
const img = document.createElement('img');
img.src = assetUrl;
document.body.appendChild(img);

// Use in CSS
element.style.backgroundImage = `url('${assetUrl}')`;
```

**Step 3: Full practical example -- rendering a gallery:**

```javascript
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

async function renderImageGallery(directoryPath) {
  // Call our Rust command to scan for images
  const images = await invoke('scan_images', { dirPath: directoryPath });

  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  for (const image of images) {
    const card = document.createElement('div');
    card.className = 'image-card';

    const img = document.createElement('img');
    img.src = convertFileSrc(image.path);
    img.alt = image.name;
    img.loading = 'lazy';  // Native lazy loading works

    const label = document.createElement('span');
    label.textContent = `${image.name} (${Math.round(image.sizeBytes / 1024)}KB)`;

    card.appendChild(img);
    card.appendChild(label);
    gallery.appendChild(card);
  }
}
```

### Custom Protocol Handler (Advanced)

For more control (e.g., on-the-fly image processing, thumbnailing), you can register a custom protocol handler in Rust:

```rust
use tauri::http::{Request, Response};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("thumb", |_ctx, request, responder| {
            // Parse the requested path from the URL
            let path = request.uri().path().to_string();
            let path = percent_encoding::percent_decode_str(&path)
                .decode_utf8_lossy()
                .to_string();

            // Spawn async work to avoid blocking
            std::thread::spawn(move || {
                match std::fs::read(&path) {
                    Ok(bytes) => {
                        // In a real app, you'd resize the image here
                        let mime = if path.ends_with(".png") {
                            "image/png"
                        } else {
                            "image/jpeg"
                        };
                        let response = Response::builder()
                            .header("Content-Type", mime)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(bytes)
                            .unwrap();
                        responder.respond(response);
                    }
                    Err(_) => {
                        let response = Response::builder()
                            .status(404)
                            .body(Vec::new())
                            .unwrap();
                        responder.respond(response);
                    }
                }
            });
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Use from JavaScript:

```javascript
import { convertFileSrc } from '@tauri-apps/api/core';

// Use the custom "thumb" protocol
const thumbUrl = convertFileSrc('/path/to/image.jpg', 'thumb');
img.src = thumbUrl;
```

### Alternative: Base64 Encoding

For small images or when you need to process images in Rust before sending, return base64-encoded data:

```rust
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

#[tauri::command]
fn get_image_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;

    let mime = if path.ends_with(".png") { "image/png" }
        else if path.ends_with(".svg") { "image/svg+xml" }
        else { "image/jpeg" };

    let encoded = STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}
```

```javascript
const dataUrl = await invoke('get_image_base64', {
  path: '/Users/me/image.png'
});
img.src = dataUrl;  // Works directly as img src
```

**When to use which approach:**

| Approach | Best for | Tradeoffs |
|----------|----------|-----------|
| Asset protocol + `convertFileSrc` | Most images, galleries, large files | Fastest, no copying, requires scope config |
| Custom protocol handler | Thumbnailing, image processing, access control | More code, full Rust control |
| Base64 via command | Small images, icons, SVGs | Simple, but doubles memory usage for large files |

---

## Quick Reference: Minimal Working App

Here is the minimum set of files for a working Tauri 2.0 app that reads local files and displays images:

**`package.json`:**
```json
{
  "name": "my-tauri-app",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-fs": "^2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "vite": "^5"
  }
}
```

**`src-tauri/Cargo.toml`:**
```toml
[package]
name = "my-tauri-app"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**`src-tauri/src/lib.rs`:**
```rust
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageEntry {
    name: String,
    path: String,
    size_bytes: u64,
}

#[tauri::command]
fn list_images(dir_path: String) -> Result<Vec<ImageEntry>, String> {
    let exts = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
    let mut images = Vec::new();

    for entry in fs::read_dir(&dir_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if exts.contains(&ext.to_string_lossy().to_lowercase().as_str()) {
                let meta = entry.metadata().map_err(|e| e.to_string())?;
                images.push(ImageEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    size_bytes: meta.len(),
                });
            }
        }
    }
    Ok(images)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![list_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**`src-tauri/src/main.rs`:**
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run()
}
```

**`src-tauri/capabilities/default.json`:**
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    {
      "identifier": "fs:scope",
      "allow": ["$HOME/**/*"]
    }
  ]
}
```

**`index.html`:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>My Tauri App</title>
</head>
<body>
  <h1>Image Browser</h1>
  <input type="text" id="path" value="" placeholder="/path/to/images" />
  <button id="scan">Scan</button>
  <div id="gallery"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**`src/main.js`:**
```javascript
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

document.getElementById('scan').addEventListener('click', async () => {
  const dirPath = document.getElementById('path').value;
  try {
    const images = await invoke('list_images', { dirPath });
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = images.map(img => `
      <div>
        <img src="${convertFileSrc(img.path)}" width="200" loading="lazy" />
        <p>${img.name} (${Math.round(img.sizeBytes / 1024)}KB)</p>
      </div>
    `).join('');
  } catch (err) {
    alert('Error: ' + err);
  }
});
```

---

## Sources

- [Project Structure | Tauri v2](https://v2.tauri.app/start/project-structure/)
- [Configuration | Tauri v2](https://v2.tauri.app/reference/config/)
- [Calling Rust from the Frontend | Tauri v2](https://v2.tauri.app/develop/calling-rust/)
- [Calling the Frontend from Rust | Tauri v2](https://v2.tauri.app/develop/calling-frontend/)
- [State Management | Tauri v2](https://v2.tauri.app/develop/state-management/)
- [File System Plugin | Tauri v2](https://v2.tauri.app/plugin/file-system/)
- [Prerequisites | Tauri v2](https://v2.tauri.app/start/prerequisites/)
- [Create a Project | Tauri v2](https://v2.tauri.app/start/create-project/)
- [Capabilities | Tauri v2](https://v2.tauri.app/security/capabilities/)
- [Permissions | Tauri v2](https://v2.tauri.app/security/permissions/)
- [Upgrade from Tauri 1.0 | Tauri v2](https://v2.tauri.app/start/migrate/from-tauri-1/)
- [Tauri 2.0 Stable Release | Tauri Blog](https://v2.tauri.app/blog/tauri-20/)
- [macOS Application Bundle | Tauri v2](https://v2.tauri.app/distribute/macos-application-bundle/)
- [DMG Distribution | Tauri v2](https://v2.tauri.app/distribute/dmg/)
- [Core JS API Reference | Tauri v2](https://v2.tauri.app/reference/javascript/api/namespacecore/)
- [Event JS API Reference | Tauri v2](https://v2.tauri.app/reference/javascript/api/namespaceevent/)
- [Asset Protocol Discussion | GitHub](https://github.com/orgs/tauri-apps/discussions/11498)
- [Handling Errors in Tauri | TauriTutorials](https://tauritutorials.com/blog/handling-errors-in-tauri)
