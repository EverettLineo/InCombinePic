use crate::error::{AppError, ErrorCode};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct ClipboardImage {
    /// 落盘后的临时文件路径，后续走与普通文件相同的探测/导入流程
    pub path: String,
    pub width: u32,
    pub height: u32,
}

/// 读取剪贴板中的图片并落成临时 PNG 文件。
///
/// 落盘而非走内存：资源库条目以 sourcePath 为标识，缩略图与导出都按路径取像素，
/// 另开一条内存通道会分裂出第二套生命周期。
///
/// 无图时返回 Ok(None)，这是正常情况（剪贴板里是文字），不是错误。
#[tauri::command]
pub async fn read_clipboard_image() -> Result<Option<ClipboardImage>, AppError> {
    tauri::async_runtime::spawn_blocking(read_clipboard_image_blocking)
        .await
        .map_err(|e| AppError::new(ErrorCode::Internal, format!("读取剪贴板任务异常：{e}")))?
}

fn read_clipboard_image_blocking() -> Result<Option<ClipboardImage>, AppError> {
    let mut cb = arboard::Clipboard::new().map_err(|e| {
        AppError::new(ErrorCode::Internal, format!("无法访问剪贴板：{e}"))
            .with_hint("请确认没有其他程序正在占用剪贴板")
    })?;

    let img = match cb.get_image() {
        Ok(i) => i,
        Err(arboard::Error::ContentNotAvailable) => return Ok(None),
        Err(e) => {
            return Err(
                AppError::new(ErrorCode::Internal, format!("剪贴板图片读取失败：{e}"))
                    .with_hint("请尝试重新复制图片，或改用文件导入"),
            )
        }
    };

    let (w, h) = (img.width as u32, img.height as u32);
    if w == 0 || h == 0 {
        return Err(AppError::new(ErrorCode::DecodeFailed, "剪贴板图片尺寸为空"));
    }

    let rgba = image::RgbaImage::from_raw(w, h, img.bytes.into_owned()).ok_or_else(|| {
        AppError::new(ErrorCode::DecodeFailed, "剪贴板图片数据不完整")
    })?;

    // 剪贴板图片可能含透明通道，必须存 PNG；存 JPEG 会丢掉透明度
    let dir = std::env::temp_dir().join("pintu_clipboard");
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("无法创建临时目录：{e}")))?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path: PathBuf = dir.join(format!("clip_{stamp}.png"));
    rgba.save(&path)
        .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("剪贴板图片保存失败：{e}")))?;

    Ok(Some(ClipboardImage {
        path: path.to_string_lossy().to_string(),
        width: w,
        height: h,
    }))
}
