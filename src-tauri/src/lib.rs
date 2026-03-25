#![allow(dead_code)]

mod ai;
mod commands;
mod core;
mod db;

use std::sync::Arc;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_data_dir = app
                .handle()
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            let database =
                Database::new(&app_data_dir).expect("Failed to initialize database");
            app.manage(Arc::new(database));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_directory,
            commands::scan::cancel_scan,
            commands::scan::process_phase1,
            commands::scan::generate_thumbnails_for,
            commands::folders::add_source_folder,
            commands::folders::get_source_folders,
            commands::folders::remove_source_folder,
            commands::folders::reset_library,
            commands::folders::update_folder_scan_time,
            commands::media::get_media_list,
            commands::media::get_media_stats,
            commands::media::get_date_groups,
            commands::media::get_folder_groups,
            commands::media::get_preview_image,
            commands::media::get_preview_video_frame,
            commands::media::get_thumbnail,
            commands::duplicate::detect_duplicates,
            commands::duplicate::get_duplicate_groups,
            commands::duplicate::open_file,
            commands::duplicate::preview_file,
            commands::duplicate::set_preferred_member,
            commands::duplicate::dismiss_duplicate_group,
            commands::duplicate::trash_duplicate_files,
            commands::duplicate::trash_group_duplicates,
            commands::fileops::list_directory,
            commands::fileops::move_files,
            commands::fileops::copy_files,
            commands::fileops::create_directory,
            commands::fileops::analyze_folder,
            commands::fileops::get_folder_tree,
            commands::fileops::scan_date_folders,
            commands::fileops::rename_date_folders,
            commands::organize::preview_organize,
            commands::organize::execute_organize,
            commands::undo::get_undo_history,
            commands::undo::undo_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
