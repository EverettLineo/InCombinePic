use crate::error::{AppError, ErrorCode};
use crate::imaging::{probe_many, ProbeOutcome};

/// 批量探测图片。返回结果与入参顺序一致，单个文件失败不影响其他文件。
///
/// 放到阻塞线程池执行：解码 50 张图可能耗时数秒，
/// 不能占住异步运行时的线程，否则界面交互会被拖慢（基线 §14.2）。
#[tauri::command]
pub async fn probe_files(paths: Vec<String>) -> Result<Vec<ProbeOutcome>, AppError> {
    tauri::async_runtime::spawn_blocking(move || probe_many(&paths))
        .await
        .map_err(|e| AppError::new(ErrorCode::Internal, format!("探测任务异常：{e}")))
}
