//! Deco CLI binary entry point.
//!
//! A standalone command-line interface that reuses the shared business logic
//! from `deco_desktop_lib` without depending on any Tauri types.

use clap::Parser;

#[tokio::main]
async fn main() {
    let cli = deco_desktop_lib::cli::Cli::parse();
    if let Err(e) = deco_desktop_lib::cli::run(cli).await {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
}
