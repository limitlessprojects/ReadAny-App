use crate::storage;
use std::net::{IpAddr, Ipv4Addr};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

fn is_private_ipv4(ip: &Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 10 || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168)
}

fn is_preferred_interface(name: &str) -> bool {
    matches!(
        name,
        "en0" | "en1" | "eth0" | "eth1" | "wlan0" | "wlan1" | "Wi-Fi" | "Ethernet"
    ) || name.starts_with("en")
        || name.starts_with("eth")
        || name.starts_with("wlan")
}

/// Get the path to the app's database file
fn db_path(app: &AppHandle) -> Result<String, String> {
    let app_dir = storage::resolve_data_root(app)?;
    Ok(app_dir.join("readany.db").to_string_lossy().to_string())
}

/// Create a snapshot of the database via VACUUM INTO.
/// This creates a clean, defragmented copy without locking the main DB.
#[tauri::command]
pub async fn sync_vacuum_into(app: AppHandle, target_path: String) -> Result<(), String> {
    let source = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&source).map_err(|e| format!("Failed to open DB: {}", e))?;
        conn.execute_batch(&format!("VACUUM INTO '{}'", target_path))
            .map_err(|e| format!("VACUUM INTO failed: {}", e))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Check the integrity of a database file.
/// Returns true if the database passes PRAGMA integrity_check.
#[tauri::command]
pub async fn sync_integrity_check(db_path: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
        let result: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| format!("integrity_check failed: {}", e))?;
        Ok::<bool, String>(result == "ok")
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Compute SHA-256 hash of a file, returns hex string.
#[tauri::command]
pub async fn sync_hash_file(path: String) -> Result<String, String> {
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file {}: {}", path, e))?;
    let hash = Sha256::digest(&data);
    Ok(format!("{:x}", hash))
}

/// Get the local IP address of this machine.
/// Uses the local-ip-address crate which safely queries network interfaces.
#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        let mut private_ipv4: Option<Ipv4Addr> = None;
        let mut any_ipv4: Option<Ipv4Addr> = None;

        for (name, ip) in interfaces {
            let IpAddr::V4(ipv4) = ip else {
                continue;
            };

            if ipv4.is_loopback() || ipv4.is_link_local() {
                continue;
            }

            if is_private_ipv4(&ipv4) && is_preferred_interface(&name) {
                return Ok(ipv4.to_string());
            }

            if is_private_ipv4(&ipv4) && private_ipv4.is_none() {
                private_ipv4 = Some(ipv4);
                continue;
            }

            if any_ipv4.is_none() {
                any_ipv4 = Some(ipv4);
            }
        }

        if let Some(ipv4) = private_ipv4.or(any_ipv4) {
            return Ok(ipv4.to_string());
        }
    }

    match local_ip_address::local_ip() {
        Ok(IpAddr::V4(ipv4)) => Ok(ipv4.to_string()),
        Ok(ip) => Ok(ip.to_string()),
        Err(e) => Err(format!("Failed to get local IP: {}", e)),
    }
}
