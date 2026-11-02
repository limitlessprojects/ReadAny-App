pub mod schema;

use crate::storage;
use anyhow::Result;
use tauri::AppHandle;

/// Initialize the SQLite database synchronously (called in setup before frontend loads)
pub fn init_database_sync(app: &AppHandle) -> Result<()> {
    let app_dir = storage::resolve_data_root(app).expect("failed to resolve data root");
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("readany.db");
    schema::initialize(&db_path)?;

    Ok(())
}
