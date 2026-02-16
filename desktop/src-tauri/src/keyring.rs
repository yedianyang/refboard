//! Secure credential storage using the OS keychain.
//!
//! On macOS: uses Keychain Services via the `keyring` crate.
//! Fallback: environment variables (for CI/headless).

const SERVICE: &str = "com.deco.app";

pub const AI_API_KEY: &str = "ai-api-key";
pub const BRAVE_API_KEY: &str = "brave-api-key";

/// Store a secret in the OS keychain.
pub fn set_secret(account: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, account)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Cannot store secret in Keychain: {e}"))?;
    crate::log::log("KEYCHAIN", &format!("Stored secret: {account}"));
    Ok(())
}

/// Retrieve a secret from the OS keychain.
/// Returns None if not found.
pub fn get_secret(account: &str) -> Option<String> {
    let entry = keyring::Entry::new(SERVICE, account).ok()?;
    match entry.get_password() {
        Ok(pw) => Some(pw),
        Err(keyring::Error::NoEntry) => None,
        Err(e) => {
            crate::log::log("KEYCHAIN", &format!("Cannot read {account}: {e}"));
            None
        }
    }
}

/// Delete a secret from the OS keychain.
/// Silently succeeds if the entry does not exist.
pub fn delete_secret(account: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, account)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => {
            crate::log::log("KEYCHAIN", &format!("Deleted secret: {account}"));
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Cannot delete secret from Keychain: {e}")),
    }
}

/// Migrate plaintext API keys from config.json to Keychain.
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
                crate::log::log("KEYCHAIN", "Migrated AI API key to Keychain");
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
                crate::log::log("KEYCHAIN", "Migrated Brave API key to Keychain");
            }
        }
        if let Some(web) = config.get_mut("web").and_then(|v| v.as_object_mut()) {
            web.remove("braveApiKey");
            modified = true;
        }
    }

    if modified {
        if let Ok(json) = serde_json::to_string_pretty(&config) {
            let _ = std::fs::write(&config_path, json);
            crate::log::log("KEYCHAIN", "Removed plaintext keys from config.json");
        }
    }
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
}
