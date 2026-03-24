use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::queries::{self, MediaFile};
use crate::db::Database;

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaListResponse {
    pub files: Vec<MediaFile>,
    pub total: i64,
    pub total_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaStats {
    pub total_count: i64,
    pub total_size: i64,
    pub image_count: i64,
    pub video_count: i64,
}

#[tauri::command]
pub async fn get_media_list(
    db: State<'_, Arc<Database>>,
    folder_path: Option<String>,
    media_type: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
) -> Result<MediaListResponse, String> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(500);
    let folder = folder_path.as_deref();
    let mtype = media_type.as_deref();

    let db_ref = db.inner().clone();
    db_ref
        .with_conn(|conn| {
            let files = queries::get_media_files(conn, folder, mtype, offset, limit)?;
            let (total, total_size) = queries::get_media_stats(conn)?;
            Ok(MediaListResponse {
                files,
                total,
                total_size,
            })
        })
        .map_err(|e| format!("DB error: {}", e))
}

#[tauri::command]
pub async fn get_media_stats(db: State<'_, Arc<Database>>) -> Result<MediaStats, String> {
    let db_ref = db.inner().clone();
    db_ref
        .with_conn(|conn| {
            let (total_count, total_size) = queries::get_media_stats(conn)?;

            let image_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM media_files WHERE media_type = 'image'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let video_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM media_files WHERE media_type = 'video'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            Ok(MediaStats {
                total_count,
                total_size,
                image_count,
                video_count,
            })
        })
        .map_err(|e| format!("DB error: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupInfo {
    pub label: String,
    pub count: i64,
}

#[tauri::command]
pub async fn get_date_groups(db: State<'_, Arc<Database>>) -> Result<Vec<GroupInfo>, String> {
    let db_ref = db.inner().clone();
    db_ref.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT COALESCE(
                REPLACE(SUBSTR(me.date_taken, 1, 10), ':', '-'),
                SUBSTR(mf.modified_at, 1, 10)
             ) as dt, COUNT(*) as cnt
             FROM media_files mf
             LEFT JOIN media_exif me ON mf.id = me.media_id
             GROUP BY dt ORDER BY dt DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(GroupInfo { label: row.get(0)?, count: row.get(1)? })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }).map_err(|e| format!("DB: {}", e))
}

#[tauri::command]
pub async fn get_folder_groups(db: State<'_, Arc<Database>>) -> Result<Vec<GroupInfo>, String> {
    let db_ref = db.inner().clone();
    db_ref.with_conn(|conn| {
        // Extract parent folder from file_path
        let mut stmt = conn.prepare(
            "SELECT SUBSTR(file_path, 1, LENGTH(file_path) - LENGTH(file_name) - 1) as folder,
                    COUNT(*) as cnt
             FROM media_files
             GROUP BY folder ORDER BY folder ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(GroupInfo { label: row.get(0)?, count: row.get(1)? })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }).map_err(|e| format!("DB: {}", e))
}

// Read image file and return as base64 for preview (resized to max 1024px)
#[tauri::command]
pub async fn get_preview_image(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File not found".into());
    }

    // Use sips to create a preview-sized image
    let unique = uuid::Uuid::new_v4().to_string();
    let tmp = std::env::temp_dir().join(format!("sc_preview_{}.jpg", unique));

    let result = std::process::Command::new("sips")
        .args(["--resampleHeightWidthMax", "1024", "-s", "format", "jpeg",
               "-s", "formatOptions", "85", &file_path, "--out", tmp.to_str().unwrap()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("sips error: {}", e))?;

    if result.success() {
        let bytes = std::fs::read(&tmp).map_err(|e| format!("Read error: {}", e))?;
        let _ = std::fs::remove_file(&tmp);
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else {
        let _ = std::fs::remove_file(&tmp);
        Err("Failed to generate preview".into())
    }
}

// Get first frame of video as base64
#[tauri::command]
pub async fn get_preview_video_frame(file_path: String) -> Result<String, String> {
    let unique = uuid::Uuid::new_v4().to_string();
    let tmp = std::env::temp_dir().join(format!("sc_vpreview_{}.jpg", unique));

    let result = std::process::Command::new("ffmpeg")
        .args(["-ss", "1", "-i", &file_path, "-vframes", "1",
               "-vf", "scale=1024:-1", "-q:v", "3", "-y", tmp.to_str().unwrap()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg error: {}", e))?;

    if result.success() {
        let bytes = std::fs::read(&tmp).map_err(|e| format!("Read error: {}", e))?;
        let _ = std::fs::remove_file(&tmp);
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else {
        let _ = std::fs::remove_file(&tmp);
        Err("Failed to generate video preview".into())
    }
}

#[tauri::command]
pub async fn get_thumbnail(
    db: State<'_, Arc<Database>>,
    media_id: String,
) -> Result<Option<String>, String> {
    let db_ref = db.inner().clone();
    db_ref
        .with_conn(|conn| {
            let result: Option<String> = conn
                .query_row(
                    "SELECT thumbnail FROM media_files WHERE id = ?1",
                    [&media_id],
                    |row| row.get(0),
                )
                .ok()
                .flatten();
            Ok(result)
        })
        .map_err(|e| format!("DB error: {}", e))
}
