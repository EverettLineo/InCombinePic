mod commands;
mod error;
mod imaging;

pub use error::{AppError, ErrorCode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 注意：#[tauri::command] 生成的隐藏符号位于命令所在模块内，
        // 因此这里必须写完整路径 commands::<模块>::<函数>，
        // 写成 commands::<模块> 会报 E0433。
        .invoke_handler(tauri::generate_handler![
            commands::app_info::app_info,
            commands::import::probe_files
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
