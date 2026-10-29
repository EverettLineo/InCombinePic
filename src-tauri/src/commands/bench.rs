use crate::error::{AppError, ErrorCode};
use std::fs;

/// 基准模式标记文件（放在临时目录，由外部脚本创建）
fn flag_path() -> std::path::PathBuf {
    std::env::temp_dir().join("pintu_bench.flag")
}

/// 是否处于基准模式。
///
/// 两种触发方式：
/// - 环境变量 `PINTU_BENCH=1`
/// - 临时目录存在 `pintu_bench.flag` 文件
///
/// 加文件方式是因为环境变量经 shell 转发到原生 GUI 进程时不一定可靠，
/// 而"文件存在"这件事是确定的，便于自动化验证。
#[tauri::command]
pub fn bench_requested() -> bool {
    if std::env::var("PINTU_BENCH").map(|v| v == "1").unwrap_or(false) {
        return true;
    }
    flag_path().exists()
}

/// 写入基准结果并退出应用。
/// 用文件落盘而不是打印到控制台：release 构建没有控制台窗口（windows_subsystem）。
#[tauri::command]
pub fn save_bench_and_quit(app: tauri::AppHandle, json: String) -> Result<String, AppError> {
    let path = std::env::temp_dir().join("pintu_canvas_bench.json");
    fs::write(&path, json)
        .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("基准结果写入失败：{e}")))?;
    let out = path.display().to_string();
    // 标记文件用完即删，避免下次启动又进基准模式
    let _ = fs::remove_file(flag_path());
    app.exit(0);
    Ok(out)
}
