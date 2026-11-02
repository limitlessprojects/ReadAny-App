use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DATA_ROOT_CONFIG_FILE: &str = "desktop-data-root.json";

#[derive(Deserialize)]
struct DataRootConfig {
    #[serde(rename = "dataRoot")]
    data_root: Option<String>,
}

fn normalize_dir(path: &str) -> Option<PathBuf> {
    let trimmed = path.trim().trim_start_matches("file://").trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        return None;
    }
    Some(PathBuf::from(trimmed))
}

pub fn default_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to get app data dir: {}", e))
}

pub fn resolve_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    let default_root = default_data_root(app)?;
    let config_path = default_root.join(DATA_ROOT_CONFIG_FILE);

    let Ok(raw) = std::fs::read_to_string(&config_path) else {
        return Ok(default_root);
    };

    let Ok(config) = serde_json::from_str::<DataRootConfig>(&raw) else {
        return Ok(default_root);
    };

    Ok(config
        .data_root
        .as_deref()
        .and_then(normalize_dir)
        .unwrap_or(default_root))
}
