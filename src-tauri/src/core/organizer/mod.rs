use std::fs;
use std::path::{Path, PathBuf};

use crate::db::queries::UndoEntry;

#[derive(Debug, Clone)]
pub struct MoveOperation {
    pub source: PathBuf,
    pub target: PathBuf,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct OrganizeResult {
    pub moved: Vec<MoveOperation>,
    pub failed: Vec<(MoveOperation, String)>,
}

pub fn execute_moves(operations: &[MoveOperation]) -> OrganizeResult {
    let mut moved = Vec::new();
    let mut failed = Vec::new();

    for op in operations {
        if let Some(parent) = op.target.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                failed.push((op.clone(), format!("Failed to create directory: {}", e)));
                continue;
            }
        }

        match fs::rename(&op.source, &op.target) {
            Ok(_) => moved.push(op.clone()),
            Err(e) => {
                // Try copy + delete for cross-device moves
                match fs::copy(&op.source, &op.target) {
                    Ok(_) => {
                        if let Err(e) = fs::remove_file(&op.source) {
                            failed.push((
                                op.clone(),
                                format!("Copied but failed to remove source: {}", e),
                            ));
                        } else {
                            moved.push(op.clone());
                        }
                    }
                    Err(_) => {
                        failed.push((op.clone(), format!("Failed to move file: {}", e)));
                    }
                }
            }
        }
    }

    OrganizeResult { moved, failed }
}

pub fn move_to_trash(path: &Path, trash_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(trash_dir).map_err(|e| format!("Failed to create trash dir: {}", e))?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let trash_name = format!("{}_{}", timestamp, file_name);
    let trash_path = trash_dir.join(&trash_name);

    fs::rename(path, &trash_path)
        .or_else(|_| fs::copy(path, &trash_path).and_then(|_| fs::remove_file(path)))
        .map_err(|e| format!("Failed to trash file: {}", e))?;

    Ok(trash_path)
}

pub fn undo_moves(entries: &[UndoEntry]) -> Vec<(String, Result<(), String>)> {
    let mut results = Vec::new();

    for entry in entries.iter().rev() {
        match entry.operation.as_str() {
            "move" => {
                if let (Some(source), Some(target)) = (&entry.source_path, &entry.target_path) {
                    let result = fs::rename(target, source)
                        .or_else(|_| {
                            fs::copy(target, source).and_then(|_| fs::remove_file(target))
                        })
                        .map_err(|e| format!("Undo failed: {}", e));
                    results.push((entry.id.clone(), result));
                }
            }
            "delete" => {
                if let (Some(source), Some(target)) = (&entry.source_path, &entry.target_path) {
                    let result = fs::rename(target, source)
                        .map_err(|e| format!("Restore from trash failed: {}", e));
                    results.push((entry.id.clone(), result));
                }
            }
            _ => {}
        }
    }

    results
}
