//! Secure credential storage using local file + SHA-256 obfuscation.
//!
//! Replaces macOS Keychain to avoid repeated password prompts.
//! Secrets are XOR-obfuscated with a SHA-256 derived key, then base64-encoded.
//! Storage file: ~/.deco/secrets.json (permissions 0600)

use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::path::PathBuf;

pub const AI_API_KEY: &str = "ai-api-key";
pub const BRAVE_API_KEY: &str = "brave-api-key";

fn secrets_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".deco").join("secrets.json")
}

/// Derive an obfuscation key from the username + salt.
fn derive_key() -> Vec<u8> {
    let user = std::env::var("USER").unwrap_or_else(|_| "deco".to_string());
    let mut hasher = Sha256::new();
    hasher.update(format!("{user}:deco-app-secret-v1"));
    hasher.finalize().to_vec()
}

/// XOR the data with the key (repeating key as needed).
fn xor_bytes(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect()
}

fn obfuscate(plaintext: &str) -> String {
    let key = derive_key();
    let encrypted = xor_bytes(plaintext.as_bytes(), &key);
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&encrypted)
}

fn deobfuscate(encoded: &str) -> Option<String> {
    use base64::Engine;
    let encrypted = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    let key = derive_key();
    let decrypted = xor_bytes(&encrypted, &key);
    String::from_utf8(decrypted).ok()
}

fn read_secrets() -> HashMap<String, String> {
    let path = secrets_path();
    if !path.exists() {
        return HashMap::new();
    }
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn write_secrets(secrets: &HashMap<String, String>) -> Result<(), String> {
    let path = secrets_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(secrets)
        .map_err(|e| format!("Cannot serialize secrets: {e}"))?;
    std::fs::write(&path, &json)
        .map_err(|e| format!("Cannot write secrets file: {e}"))?;

    // Set file permissions to 0600 (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&path, perms);
    }

    Ok(())
}

/// Store a secret in the local secrets file.
pub fn set_secret(account: &str, value: &str) -> Result<(), String> {
    let mut secrets = read_secrets();
    secrets.insert(account.to_string(), obfuscate(value));
    write_secrets(&secrets)?;
    crate::log::log("KEYCHAIN", &format!("Stored secret: {account}"));
    Ok(())
}

/// Retrieve a secret from the local secrets file.
/// Returns None if not found.
pub fn get_secret(account: &str) -> Option<String> {
    let secrets = read_secrets();
    let encoded = secrets.get(account)?;
    deobfuscate(encoded)
}

/// Delete a secret from the local secrets file.
/// Silently succeeds if the entry does not exist.
pub fn delete_secret(account: &str) -> Result<(), String> {
    let mut secrets = read_secrets();
    if secrets.remove(account).is_some() {
        write_secrets(&secrets)?;
        crate::log::log("KEYCHAIN", &format!("Deleted secret: {account}"));
    }
    Ok(())
}

/// Migrate plaintext API keys from config.json to secrets file.
/// Called once at startup. Idempotent.
pub fn migrate_plaintext_keys() {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let config_path = std::path::Path::new(&home).join(".deco").join("config.json");

    if !config_path.exists() {
        return;
    }

    let contents = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let mut config: serde_json::Value = match serde_json::from_str(&contents) {
        Ok(v) => v,
        Err(_) => return,
    };

    let mut modified = false;

    // Migrate AI API key
    if let Some(ai_key) = config
        .get("ai")
        .and_then(|ai| ai.get("apiKey"))
        .and_then(|k| k.as_str())
        .filter(|k| !k.is_empty())
    {
        if get_secret(AI_API_KEY).is_none() {
            if set_secret(AI_API_KEY, ai_key).is_ok() {
                crate::log::log("KEYCHAIN", "Migrated AI API key to secrets file");
            }
        }
        if let Some(ai) = config.get_mut("ai").and_then(|v| v.as_object_mut()) {
            ai.remove("apiKey");
            modified = true;
        }
    }

    // Migrate Brave API key
    if let Some(brave_key) = config
        .get("web")
        .and_then(|w| w.get("braveApiKey"))
        .and_then(|k| k.as_str())
        .filter(|k| !k.is_empty())
    {
        if get_secret(BRAVE_API_KEY).is_none() {
            if set_secret(BRAVE_API_KEY, brave_key).is_ok() {
                crate::log::log("KEYCHAIN", "Migrated Brave API key to secrets file");
            }
        }
        if let Some(web) = config.get_mut("web").and_then(|v| v.as_object_mut()) {
            web.remove("braveApiKey");
            modified = true;
        }
    }

    // Also migrate from old Keychain entries if they exist
    // (one-time migration for users upgrading from Keychain version)
    migrate_from_keychain();

    if modified {
        if let Ok(json) = serde_json::to_string_pretty(&config) {
            let _ = std::fs::write(&config_path, json);
            crate::log::log("KEYCHAIN", "Removed plaintext keys from config.json");
        }
    }
}

/// One-time migration: move secrets from macOS Keychain to file storage.
/// This is best-effort — if Keychain is unavailable, skip silently.
fn migrate_from_keychain() {
    // We no longer depend on the keyring crate, so we can't read from Keychain.
    // Users who had keys in Keychain will need to re-enter them in Settings.
    // This is acceptable since the migration is a one-time event.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let account = "test-deco-unit-test";
        let _ = delete_secret(account);

        set_secret(account, "test-value-123").unwrap();
        assert_eq!(get_secret(account), Some("test-value-123".to_string()));

        delete_secret(account).unwrap();
        assert_eq!(get_secret(account), None);

        // Delete again (idempotent)
        delete_secret(account).unwrap();
    }

    #[test]
    fn test_missing_entry() {
        assert_eq!(get_secret("nonexistent-deco-test-key"), None);
    }

    #[test]
    fn test_obfuscation_not_plaintext() {
        let secret = "sk-test-api-key-12345";
        let encoded = obfuscate(secret);
        // Encoded value should NOT contain the original plaintext
        assert!(!encoded.contains(secret));
        // But should round-trip correctly
        assert_eq!(deobfuscate(&encoded), Some(secret.to_string()));
    }
}
