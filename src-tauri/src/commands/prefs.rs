//! 偏好持久化。
//!
//! 只存白名单里的偏好项，绝不存文档内容：启动必须是空画布。
//! 文件位置固定为当前用户的应用配置目录，不写到用户图片目录或其他位置。

use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::error::{AppError, ErrorCode};

const PREFS_FILE: &str = "prefs.json";
/// 偏好文件超过该体积视为异常，直接忽略（防止用户手改成巨型文件拖慢启动）
const MAX_BYTES: u64 = 64 * 1024;

fn prefs_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|e| {
        AppError::new(ErrorCode::IoFailed, format!("无法定位配置目录：{e}"))
            .with_hint("请检查当前用户是否有可写的配置目录")
    })?;
    Ok(dir.join(PREFS_FILE))
}

/// 读取偏好 JSON。文件不存在或损坏时返回 None，由前端回落到默认值。
#[tauri::command]
pub fn load_prefs(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    let path = prefs_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let meta = fs::metadata(&path).map_err(|e| {
        AppError::new(ErrorCode::IoFailed, format!("无法读取配置：{e}"))
    })?;
    if meta.len() > MAX_BYTES {
        return Ok(None);
    }
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(_) => Ok(None),
    }
}

/// 写入偏好 JSON：先写临时文件再改名，避免写到一半断电留下坏文件。
#[tauri::command]
pub fn save_prefs(app: tauri::AppHandle, json: String) -> Result<(), AppError> {
    if json.len() as u64 > MAX_BYTES {
        return Err(AppError::new(ErrorCode::WriteDenied, "偏好数据过大"));
    }
    let path = prefs_path(&app)?;
    let dir = path.parent().ok_or_else(|| {
        AppError::new(ErrorCode::IoFailed, "配置目录无效").with_hint("请重启应用后重试")
    })?;
    fs::create_dir_all(dir).map_err(|e| {
        AppError::new(ErrorCode::WriteDenied, format!("无法创建配置目录：{e}"))
            .with_hint("请检查当前用户目录的写入权限")
    })?;

    let tmp = dir.join(".prefs.json.tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| {
        AppError::new(ErrorCode::WriteDenied, format!("保存偏好失败：{e}"))
            .with_hint("请检查配置目录是否可写")
    })?;
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::new(ErrorCode::IoFailed, format!("保存偏好失败：{e}"))
    })?;

    Ok(())
}
