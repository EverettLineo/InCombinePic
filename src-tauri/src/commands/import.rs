use crate::error::{AppError, ErrorCode};
use crate::imaging::{make_thumbnail, probe_many, ProbeOutcome};
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::Manager;

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

#[derive(Serialize)]
pub struct ThumbnailResult {
    /// 缩略图文件绝对路径，前端用 convertFileSrc 转成 asset URL
    pub path: String,
    pub width: u32,
    pub height: u32,
}

/// 缩略图缓存文件名：源路径 + 修改时间 + 目标尺寸的哈希。
/// 带上 mtime 是为了源文件被替换后能自动失效，避免显示旧图。
fn cache_file_name(source: &Path, max_edge: u32) -> String {
    let mtime = fs::metadata(source)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut h = DefaultHasher::new();
    source.to_string_lossy().hash(&mut h);
    mtime.hash(&mut h);
    max_edge.hash(&mut h);
    format!("{:016x}.png", h.finish())
}

fn thumb_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("无法定位缓存目录：{e}")))?
        .join("thumbnails");
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("无法创建缓存目录：{e}")))?;
    Ok(dir)
}

/// 生成（或复用）显示用缩略图。命中缓存直接返回路径，避免每次渲染都重新解码大图。
#[tauri::command]
pub async fn prepare_thumbnail(
    app: tauri::AppHandle,
    path: String,
    max_edge: u32,
) -> Result<ThumbnailResult, AppError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ThumbnailResult, AppError> {
        let dir = thumb_dir(&app)?;
        let source = PathBuf::from(&path);
        let dst = dir.join(cache_file_name(&source, max_edge));

        if dst.exists() {
            // 缓存命中：尺寸从文件重新读，避免额外维护索引
            let cached = image::ImageReader::open(&dst)
                .and_then(|r| r.with_guessed_format())
                .ok()
                .and_then(|r| r.decode().ok());
            if let Some(img) = cached {
                return Ok(ThumbnailResult {
                    path: dst.to_string_lossy().to_string(),
                    width: img.width(),
                    height: img.height(),
                });
            }
            // 缓存损坏则删除后重新生成
            let _ = fs::remove_file(&dst);
        }

        let (w, h) = make_thumbnail(&source, &dst, max_edge)?;
        Ok(ThumbnailResult {
            path: dst.to_string_lossy().to_string(),
            width: w,
            height: h,
        })
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Internal, format!("缩略图任务异常：{e}")))?
}
