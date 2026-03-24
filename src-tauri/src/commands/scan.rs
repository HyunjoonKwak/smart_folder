use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::core::{metadata, scanner};
use crate::db::queries::{self, MediaExif, MediaFile};
use crate::db::Database;

static SCAN_CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub total: usize,
    pub current: usize,
    pub current_file: String,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub total_files: usize,
    pub new_files: usize,
    pub skipped: usize,
    pub cancelled: bool,
}

#[tauri::command]
pub async fn cancel_scan() -> Result<(), String> {
    SCAN_CANCELLED.store(true, Ordering::SeqCst);
    Ok(())
}

// Phase 0: Fast file list
#[tauri::command]
pub async fn scan_directory(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    path: String,
) -> Result<ScanResult, String> {
    SCAN_CANCELLED.store(false, Ordering::SeqCst);

    let dir = Path::new(&path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Invalid directory path".to_string());
    }

    app.emit("scan-progress", ScanProgress {
        total: 0, current: 0,
        current_file: "파일 탐색 중...".into(),
        phase: "scanning".into(),
    }).ok();

    let files = scanner::scan_directory(dir);
    let total = files.len();
    let mut new_files = 0usize;
    let mut skipped = 0usize;
    let mut cancelled = false;

    for (chunk_idx, chunk) in files.chunks(500).enumerate() {
        if SCAN_CANCELLED.load(Ordering::SeqCst) { cancelled = true; break; }

        let db_ref = db.inner().clone();
        db_ref.with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            for scanned in chunk {
                let path_str = scanned.path.to_string_lossy().to_string();
                if queries::is_file_unchanged(&tx, &path_str, &scanned.modified_at, scanned.file_size as i64)? {
                    skipped += 1;
                    continue;
                }
                let media = MediaFile {
                    id: uuid::Uuid::new_v4().to_string(),
                    file_path: path_str.clone(), original_path: path_str,
                    file_name: scanned.file_name.clone(),
                    file_size: scanned.file_size as i64,
                    mime_type: scanner::get_mime_type(&scanned.path),
                    sha256_hash: None, quick_hash: None, width: None, height: None,
                    media_type: scanned.media_type.as_str().into(),
                    created_at: scanned.created_at.clone(),
                    modified_at: scanned.modified_at.clone(),
                    scanned_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
                    source_type: "local".into(), thumbnail: None, scan_phase: 0, date_taken: None,
                };
                queries::insert_media_phase0(&tx, &media)?;
                new_files += 1;
            }
            tx.commit()
        }).map_err(|e| format!("DB: {}", e))?;

        let done = ((chunk_idx + 1) * 500).min(total);
        app.emit("scan-progress", ScanProgress {
            total, current: done,
            current_file: chunk.last().map(|f| f.file_name.clone()).unwrap_or_default(),
            phase: "scanning".into(),
        }).ok();
    }

    app.emit("scan-progress", ScanProgress {
        total, current: total, current_file: String::new(),
        phase: if cancelled { "cancelled" } else { "phase0_complete" }.into(),
    }).ok();

    Ok(ScanResult { total_files: total, new_files, skipped, cancelled })
}

// Phase 1: Process ONE batch (50 files) and return immediately
// Frontend calls this in a loop with setInterval
// This way get_media_list can run between batches
#[tauri::command]
pub async fn process_phase1(
    db: State<'_, Arc<Database>>,
) -> Result<(usize, usize, usize), String> {
    let db_ref = db.inner().clone();

    let batch: Vec<(String, String, String)> = db_ref
        .with_conn(|conn| queries::get_phase0_files(conn, 50))
        .map_err(|e| format!("DB: {}", e))?;

    if batch.is_empty() {
        let (done, total): (i64, i64) = db_ref.with_conn(|conn| {
            let d = conn.query_row("SELECT COUNT(*) FROM media_files WHERE scan_phase > 0", [], |r| r.get(0)).unwrap_or(0);
            let t = conn.query_row("SELECT COUNT(*) FROM media_files", [], |r| r.get(0)).unwrap_or(0);
            Ok((d, t))
        }).unwrap_or((0, 0));
        return Ok((0, done as usize, total as usize));
    }

    // Process in parallel with rayon
    let results: Vec<_> = batch
        .par_iter()
        .filter_map(|(id, file_path, media_type)| {
            let path = Path::new(file_path);
            let mut width = None;
            let mut height = None;
            let mut exif_out = None;

            if path.exists() && media_type == "image" {
                let exif = metadata::extract_exif(path);
                width = exif.width;
                height = exif.height;
                if width.is_none() {
                    if let Ok(dims) = image::image_dimensions(path) {
                        width = Some(dims.0 as i32);
                        height = Some(dims.1 as i32);
                    }
                }
                exif_out = Some(MediaExif {
                    media_id: id.clone(),
                    date_taken: exif.date_taken, camera_make: exif.camera_make,
                    camera_model: exif.camera_model, gps_latitude: exif.gps_latitude,
                    gps_longitude: exif.gps_longitude, orientation: exif.orientation,
                });
            }

            Some((id.clone(), width, height, exif_out))
        })
        .collect();

    let count = results.len();

    db_ref.with_conn(|conn| {
        let tx = conn.unchecked_transaction()?;
        for (id, w, h, exif) in &results {
            queries::update_media_phase1(&tx, id, *w, *h, None)?;
            if let Some(e) = exif {
                queries::insert_media_exif(&tx, e)?;
            }
        }
        tx.commit()
    }).map_err(|e| format!("DB: {}", e))?;

    let (done, total_files): (i64, i64) = db_ref.with_conn(|conn| {
        let done = conn.query_row("SELECT COUNT(*) FROM media_files WHERE scan_phase > 0", [], |r| r.get(0)).unwrap_or(0);
        let total = conn.query_row("SELECT COUNT(*) FROM media_files", [], |r| r.get(0)).unwrap_or(0);
        Ok((done, total))
    }).unwrap_or((0, 0));

    Ok((count, done as usize, total_files as usize))
}

// sips thumbnail (macOS hardware accelerated)
fn make_thumbnail_fast(path: &Path) -> Option<String> {
    let unique = uuid::Uuid::new_v4().to_string();
    let tmp = std::env::temp_dir().join(format!("sc_{}.jpg", unique));
    let result = std::process::Command::new("sips")
        .args(["--resampleHeightWidthMax", "256", "-s", "format", "jpeg",
               "-s", "formatOptions", "80", path.to_str()?, "--out", tmp.to_str()?])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()?;

    if result.success() {
        let bytes = std::fs::read(&tmp).ok()?;
        let _ = std::fs::remove_file(&tmp);
        if !bytes.is_empty() {
            use base64::Engine;
            return Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
        }
    }
    let _ = std::fs::remove_file(&tmp);

    // Fallback
    let img = image::open(path).ok()?;
    let thumb = img.thumbnail(256, 256);
    let mut buf = Vec::with_capacity(32768);
    let mut cursor = std::io::Cursor::new(&mut buf);
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 80);
    thumb.write_with_encoder(enc).ok()?;
    use base64::Engine;
    Some(base64::engine::general_purpose::STANDARD.encode(&buf))
}

// Video thumbnail: capture frame at 1 second using ffmpeg
fn make_video_thumbnail(path: &Path) -> Option<String> {
    let unique = uuid::Uuid::new_v4().to_string();
    let tmp = std::env::temp_dir().join(format!("sc_vid_{}.jpg", unique));

    let result = std::process::Command::new("ffmpeg")
        .args([
            "-ss", "1",
            "-i", path.to_str()?,
            "-vframes", "1",
            "-vf", "scale=256:-1",
            "-q:v", "5",
            "-y",
            tmp.to_str()?,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()?;

    if result.success() {
        let bytes = std::fs::read(&tmp).ok()?;
        let _ = std::fs::remove_file(&tmp);
        if !bytes.is_empty() {
            use base64::Engine;
            return Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
        }
    }
    let _ = std::fs::remove_file(&tmp);
    None
}

// On-demand thumbnails for duplicate comparison
#[tauri::command]
pub async fn generate_thumbnails_for(
    db: State<'_, Arc<Database>>,
    file_ids: Vec<String>,
) -> Result<Vec<(String, String)>, String> {
    let db_ref = db.inner().clone();

    let files: Vec<(String, String)> = db_ref.with_conn(|conn| {
        let placeholders: Vec<String> = file_ids.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1)).collect();
        let query = format!(
            "SELECT id, file_path FROM media_files WHERE id IN ({}) AND thumbnail IS NULL",
            placeholders.join(",")
        );
        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = file_ids.iter()
            .map(|s| s as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }).map_err(|e| format!("DB: {}", e))?;

    let mut results = Vec::new();
    for (id, file_path) in &files {
        if let Some(thumb) = make_thumbnail_fast(Path::new(file_path)) {
            db_ref.with_conn(|conn| {
                conn.execute("UPDATE media_files SET thumbnail = ?1 WHERE id = ?2",
                    rusqlite::params![thumb, id])
            }).ok();
            results.push((id.clone(), thumb));
        }
    }

    Ok(results)
}

fn get_thumbnail_dir(_app: &AppHandle) -> std::path::PathBuf {
    std::env::temp_dir().join("smart_category_thumbs")
}
