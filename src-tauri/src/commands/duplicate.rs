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

    app.emit("duplicate-progress", DuplicateProgress {
        phase: "크기별 그룹핑...".into(), total: 0, current: 0,
    }).ok();

    // Only files > 100KB (skip tiny thumbnails/cache)
    let min_size: i64 = 100 * 1024;
    let size_groups: Vec<(i64, Vec<(String, String)>)> = db_ref
        .with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT file_size, id, file_path FROM media_files
                 WHERE media_type = 'image' AND file_size > ?1 ORDER BY file_size"
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

    if total_candidates == 0 {
        app.emit("duplicate-progress", DuplicateProgress {
            phase: "complete".into(), total: 0, current: 0,
        }).ok();
        return Ok(DuplicateScanResult {
            exact_groups: 0, similar_groups: 0, total_duplicates: 0, space_savings: 0,
        });
    }

    app.emit("duplicate-progress", DuplicateProgress {
        phase: "해시 비교 중...".into(), total: total_candidates, current: 0,
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
            phase: "해시 비교 중...".into(), total: total_candidates, current: processed,
        }).ok();
    }

    app.emit("duplicate-progress", DuplicateProgress {
        phase: "complete".into(), total: total_candidates, current: total_candidates,
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

// Open file with system default app (Finder/Preview)
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;
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
