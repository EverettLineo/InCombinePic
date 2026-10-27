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
        name: "拼图工具".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        offline: true,
    }
}
