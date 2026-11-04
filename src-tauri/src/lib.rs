mod commands;
mod error;
mod imaging;

pub use error::{AppError, ErrorCode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::export::ExportState::default())
        // #[tauri::command] 生成的隐藏符号位于命令所在模块内，这里必须写完整路径
        // commands::<模块>::<函数>；只写到模块会报 E0433。
        .invoke_handler(tauri::generate_handler![
            commands::app_info::app_info,
            commands::app_info::open_author_link,
            commands::import::probe_files,
            commands::import::prepare_thumbnail,
            commands::import::read_image_png,
            commands::clipboard::read_clipboard_image,
            commands::bench::bench_requested,
            commands::bench::save_bench_and_quit,
            commands::export::export_begin,
            commands::export::export_write_strip,
            commands::export::export_finish,
            commands::export::export_abort,
            commands::export::path_exists,
            commands::export::open_exported,
            commands::export::reveal_exported,
            commands::prefs::load_prefs,
            commands::prefs::save_prefs
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
