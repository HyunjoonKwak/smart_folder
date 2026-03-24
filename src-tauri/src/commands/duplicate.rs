use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use rayon::prelude::*;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::core::hasher;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateProgress {
    pub phase: String,
    pub total: usize,
    pub current: usize,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanResult {
    pub exact_groups: usize,
    pub similar_groups: usize,
    pub total_duplicates: usize,
    pub space_savings: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DupGroup {
    pub id: String,
    pub match_type: String,
    pub similarity_score: Option<f64>,
    pub members: Vec<DupMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DupMember {
    pub media_id: String,
    pub is_preferred: bool,
    pub file_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub date_taken: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DupSummary {
    pub groups: Vec<DupGroup>,
    pub total_groups: usize,
    pub total_duplicates: usize,
    pub total_savings: i64,
    pub total_files_in_groups: usize,
}

#[tauri::command]
pub async fn detect_duplicates(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<DuplicateScanResult, String> {
    let db_ref = db.inner().clone();

    db_ref.with_conn(|conn| {
        conn.execute("DELETE FROM duplicate_members", [])?;
        conn.execute("DELETE FROM duplicate_groups", [])?;
        Ok(())
    }).map_err(|e| format!("DB: {}", e))?;

    // Phase 1: Count total files
    let (total_files, min_size): (i64, i64) = db_ref.with_conn(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM media_files WHERE file_size > ?1",
            params![100 * 1024_i64],
            |r| r.get(0),
        )?;
        Ok((count, 100 * 1024))
    }).map_err(|e| format!("DB: {}", e))?;

    app.emit("duplicate-progress", DuplicateProgress {
        phase: "파일 크기 분석".into(),
        total: total_files as usize,
        current: 0,
        detail: format!("전체 {} 파일 중 100KB 이상 분석 중...", total_files),
    }).ok();

    // Phase 2: Group by file size (images + videos)
    let size_groups: Vec<(i64, Vec<(String, String)>)> = db_ref
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT file_size, id, file_path FROM media_files
                 WHERE file_size > ?1 ORDER BY file_size"
            )?;
            let mut groups: HashMap<i64, Vec<(String, String)>> = HashMap::new();
            let rows = stmt
                .query_map(params![min_size], |row| Ok((row.get::<_,i64>(0)?, row.get::<_,String>(1)?, row.get::<_,String>(2)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            for (size, id, path) in rows {
                groups.entry(size).or_default().push((id, path));
            }
            Ok(groups.into_iter().filter(|(_, v)| v.len() > 1).collect::<Vec<_>>())
        })
        .map_err(|e| format!("DB: {}", e))?;

    let total_candidates: usize = size_groups.iter().map(|(_, v)| v.len()).sum();
    let unique_count = total_files as usize - total_candidates;

    app.emit("duplicate-progress", DuplicateProgress {
        phase: "크기 분석 완료".into(),
        total: total_files as usize,
        current: total_files as usize,
        detail: format!(
            "전체 {}개 중 크기 일치 {}개 발견 ({}개는 고유 파일)",
            total_files, total_candidates, unique_count
        ),
    }).ok();

    if total_candidates == 0 {
        app.emit("duplicate-progress", DuplicateProgress {
            phase: "complete".into(), total: total_files as usize, current: total_files as usize,
            detail: "중복 후보 없음".into(),
        }).ok();
        return Ok(DuplicateScanResult {
            exact_groups: 0, similar_groups: 0, total_duplicates: 0, space_savings: 0,
        });
    }

    // Phase 3: Hash comparison
    app.emit("duplicate-progress", DuplicateProgress {
        phase: "해시 비교".into(),
        total: total_candidates,
        current: 0,
        detail: format!("크기 일치 {}개 파일의 해시 비교 시작...", total_candidates),
    }).ok();

    let mut exact_groups = 0usize;
    let mut total_duplicates = 0usize;
    let mut space_savings = 0i64;
    let mut processed = 0usize;

    for (size, members) in &size_groups {
        // Quick hash (4KB) - parallel
        let quick_results: Vec<(String, String, Option<String>)> = members
            .par_iter()
            .map(|(id, path)| (id.clone(), path.clone(), hasher::quick_hash(Path::new(path))))
            .collect();

        let mut qh_groups: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for (id, path, qh) in &quick_results {
            if let Some(h) = qh {
                qh_groups.entry(h.clone()).or_default().push((id.clone(), path.clone()));
            }
        }

        for (_qh, qh_members) in &qh_groups {
            if qh_members.len() < 2 { continue; }

            // Full hash - only for quick-hash matches
            let full_results: Vec<(String, Option<String>)> = qh_members
                .par_iter()
                .map(|(id, path)| (id.clone(), hasher::full_hash(Path::new(path))))
                .collect();

            let mut fh_groups: HashMap<String, Vec<String>> = HashMap::new();
            for (id, fh) in &full_results {
                if let Some(h) = fh { fh_groups.entry(h.clone()).or_default().push(id.clone()); }
            }

            for (hash, ids) in &fh_groups {
                if ids.len() < 2 { continue; }

                let group_id = uuid::Uuid::new_v4().to_string();
                db_ref.with_conn(|conn| {
                    conn.execute(
                        "INSERT INTO duplicate_groups (id, match_type, similarity_score, status) VALUES (?1, 'exact', 1.0, 'pending')",
                        params![group_id],
                    )?;
                    for (j, id) in ids.iter().enumerate() {
                        conn.execute(
                            "INSERT INTO duplicate_members (group_id, media_id, is_preferred) VALUES (?1, ?2, ?3)",
                            params![group_id, id, if j == 0 { 1 } else { 0 }],
                        )?;
                        conn.execute("UPDATE media_files SET sha256_hash = ?1 WHERE id = ?2", params![hash, id])?;
                    }
                    Ok(())
                }).map_err(|e| format!("DB: {}", e))?;

                exact_groups += 1;
                total_duplicates += ids.len() - 1;
                space_savings += *size * (ids.len() as i64 - 1);
            }
        }

        processed += members.len();
        app.emit("duplicate-progress", DuplicateProgress {
            phase: "해시 비교".into(),
            total: total_candidates,
            current: processed,
            detail: format!(
                "{}개 비교 완료 · 중복 {}그룹 발견",
                processed, exact_groups
            ),
        }).ok();
    }

    app.emit("duplicate-progress", DuplicateProgress {
        phase: "complete".into(),
        total: total_files as usize,
        current: total_files as usize,
        detail: format!(
            "완료: 전체 {}개 파일 중 {}그룹 {}개 중복 발견",
            total_files, exact_groups, total_duplicates
        ),
    }).ok();

    Ok(DuplicateScanResult { exact_groups, similar_groups: 0, total_duplicates, space_savings })
}

// Fast: no thumbnail generation, just DB query
#[tauri::command]
pub async fn get_duplicate_groups(db: State<'_, Arc<Database>>) -> Result<DupSummary, String> {
    let db_ref = db.inner().clone();

    db_ref.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, match_type, similarity_score FROM duplicate_groups
             WHERE status = 'pending' ORDER BY match_type ASC"
        )?;
        let groups_raw = stmt.query_map([], |row| {
            Ok((row.get::<_,String>(0)?, row.get::<_,String>(1)?, row.get::<_,Option<f64>>(2)?))
        })?.collect::<Result<Vec<_>, _>>()?;

        let mut all_groups = Vec::new();
        let mut total_duplicates = 0usize;
        let mut total_savings = 0i64;
        let mut total_files = 0usize;

        for (group_id, match_type, sim) in &groups_raw {
            let mut mem_stmt = conn.prepare(
                "SELECT dm.media_id, dm.is_preferred, mf.file_path, mf.file_name, mf.file_size,
                        mf.width, mf.height, me.date_taken
                 FROM duplicate_members dm
                 JOIN media_files mf ON dm.media_id = mf.id
                 LEFT JOIN media_exif me ON mf.id = me.media_id
                 WHERE dm.group_id = ?1"
            )?;
            let members: Vec<DupMember> = mem_stmt.query_map(params![group_id], |row| {
                Ok(DupMember {
                    media_id: row.get(0)?,
                    is_preferred: row.get::<_,i32>(1)? != 0,
                    file_path: row.get(2)?,
                    file_name: row.get(3)?,
                    file_size: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    date_taken: row.get(7)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;

            let dup_count = members.len().saturating_sub(1);
            let savings: i64 = members.iter().filter(|m| !m.is_preferred).map(|m| m.file_size).sum();

            total_duplicates += dup_count;
            total_savings += savings;
            total_files += members.len();

            all_groups.push(DupGroup {
                id: group_id.clone(),
                match_type: match_type.clone(),
                similarity_score: *sim,
                members,
            });
        }

        Ok(DupSummary {
            total_groups: all_groups.len(),
            total_duplicates,
            total_savings,
            total_files_in_groups: total_files,
            groups: all_groups,
        })
    }).map_err(|e| format!("DB: {}", e))
}

// Set a specific member as preferred (keep this one) in a duplicate group
#[tauri::command]
pub async fn set_preferred_member(
    db: State<'_, Arc<Database>>,
    group_id: String,
    media_id: String,
) -> Result<(), String> {
    let db_ref = db.inner().clone();
    db_ref
        .with_conn(|conn| {
            // Reset all members in this group to not preferred
            conn.execute(
                "UPDATE duplicate_members SET is_preferred = 0 WHERE group_id = ?1",
                params![group_id],
            )?;
            // Set the chosen member as preferred
            conn.execute(
                "UPDATE duplicate_members SET is_preferred = 1 WHERE group_id = ?1 AND media_id = ?2",
                params![group_id, media_id],
            )?;
            Ok(())
        })
        .map_err(|e| format!("DB: {}", e))
}

// Dismiss a duplicate group (mark as resolved, keep all files)
#[tauri::command]
pub async fn dismiss_duplicate_group(
    db: State<'_, Arc<Database>>,
    group_id: String,
) -> Result<(), String> {
    let db_ref = db.inner().clone();
    db_ref
        .with_conn(|conn| {
            conn.execute(
                "UPDATE duplicate_groups SET status = 'dismissed' WHERE id = ?1",
                params![group_id],
            )?;
            Ok(())
        })
        .map_err(|e| format!("DB: {}", e))
}

// Trash result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashResult {
    pub success: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

// Shared: move files to trash and clean up DB
fn trash_files_and_cleanup(
    db_ref: &Arc<Database>,
    files_to_trash: &[(String, String)],
) -> Result<TrashResult, String> {
    let mut success = 0usize;
    let mut failed = 0usize;
    let mut errors = Vec::new();
    let mut trashed_ids = Vec::new();

    for (media_id, file_path) in files_to_trash {
        let result = std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "tell application \"Finder\" to delete POSIX file \"{}\"",
                file_path
            ))
            .output();

        match result {
            Ok(output) if output.status.success() => {
                success += 1;
                trashed_ids.push(media_id.clone());
            }
            _ => {
                failed += 1;
                let fname = Path::new(file_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| file_path.clone());
                errors.push(fname);
            }
        }
    }

    if !trashed_ids.is_empty() {
        db_ref
            .with_conn(|conn| {
                let tx = conn.unchecked_transaction()?;
                for id in &trashed_ids {
                    tx.execute("DELETE FROM media_files WHERE id = ?1", params![id])?;
                    tx.execute("DELETE FROM duplicate_members WHERE media_id = ?1", params![id])?;
                }
                // Resolve groups with 0-1 members left
                tx.execute(
                    "UPDATE duplicate_groups SET status = 'resolved'
                     WHERE id IN (
                       SELECT dg.id FROM duplicate_groups dg
                       LEFT JOIN duplicate_members dm ON dg.id = dm.group_id
                       WHERE dg.status = 'pending'
                       GROUP BY dg.id
                       HAVING COUNT(dm.media_id) <= 1
                     )",
                    [],
                )?;
                tx.commit()
            })
            .map_err(|e| format!("DB: {}", e))?;
    }

    Ok(TrashResult { success, failed, errors })
}

// Trash all non-preferred duplicate files across all pending groups
#[tauri::command]
pub async fn trash_duplicate_files(
    db: State<'_, Arc<Database>>,
) -> Result<TrashResult, String> {
    let db_ref = db.inner().clone();

    let files_to_trash: Vec<(String, String)> = db_ref
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT dm.media_id, mf.file_path
                 FROM duplicate_members dm
                 JOIN duplicate_groups dg ON dm.group_id = dg.id
                 JOIN media_files mf ON dm.media_id = mf.id
                 WHERE dg.status = 'pending' AND dm.is_preferred = 0"
            )?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .map_err(|e| format!("DB: {}", e))?;

    trash_files_and_cleanup(&db_ref, &files_to_trash)
}

// Trash non-preferred files in a single group
#[tauri::command]
pub async fn trash_group_duplicates(
    db: State<'_, Arc<Database>>,
    group_id: String,
) -> Result<TrashResult, String> {
    let db_ref = db.inner().clone();

    let files_to_trash: Vec<(String, String)> = db_ref
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT dm.media_id, mf.file_path
                 FROM duplicate_members dm
                 JOIN media_files mf ON dm.media_id = mf.id
                 WHERE dm.group_id = ?1 AND dm.is_preferred = 0"
            )?;
            let rows = stmt
                .query_map(params![group_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .map_err(|e| format!("DB: {}", e))?;

    trash_files_and_cleanup(&db_ref, &files_to_trash)
}

// Reveal file in Finder (select the file in its parent folder)
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    Ok(())
}

// Quick Look preview (spacebar-like)
#[tauri::command]
pub async fn preview_file(path: String) -> Result<(), String> {
    std::process::Command::new("qlmanage")
        .arg("-p")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to preview: {}", e))?;
    Ok(())
}
