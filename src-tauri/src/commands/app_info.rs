use crate::error::{AppError, ErrorCode};
use serde::Serialize;

/// 应用元信息：用于验证 IPC 通道可用（G1 门禁要求"一次 IPC 调用成功往返"）
#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub offline: bool,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "In拼图".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        offline: true,
    }
}

/// 打开作者主页。用固定白名单而不是接收任意 URL：
/// 一旦允许传 URL，前端任何一处注入都能借系统浏览器打开恶意地址。
#[tauri::command]
pub fn open_author_link(which: String) -> Result<(), AppError> {
    let url = match which.as_str() {
        "github" => "https://github.com/EverettLineo",
        "site" => "https://everettlineo.github.io/",
        other => {
            return Err(AppError::new(
                ErrorCode::Internal,
                format!("未知的链接标识：{other}"),
            ))
        }
    };
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| {
        AppError::new(ErrorCode::Internal, format!("无法打开浏览器：{e}"))
            .with_hint("请手动访问该地址")
    })
}
