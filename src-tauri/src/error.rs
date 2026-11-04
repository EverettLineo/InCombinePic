use serde::Serialize;

/// 统一错误模型
///
/// 约定：
/// - `code` 为稳定的枚举字符串，前端据此分支，不要解析 message
/// - `message` 为面向用户的中文文案，可直接展示
/// - `hint` 为可执行的下一步建议，可为空
#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    pub hint: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    UnsupportedFormat,
    DecodeFailed,
    OutOfMemory,
    IoFailed,
    WriteDenied,
    Internal,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            hint: None,
        }
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    /// HEIC/HEIF 专用：v1 明确不支持，须给出可执行建议
    pub fn heic_unsupported() -> Self {
        Self::new(
            ErrorCode::UnsupportedFormat,
            "暂不支持 HEIC/HEIF 格式",
        )
        .with_hint("请先将其转换为 JPG、PNG 或 WebP 后再导入")
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::new(ErrorCode::IoFailed, format!("文件操作失败：{e}"))
            .with_hint("请检查文件是否被其他程序占用，或换一个保存位置")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heic_error_is_actionable() {
        let e = AppError::heic_unsupported();
        assert!(e.hint.is_some());
        assert!(e.hint.unwrap().contains("转换"));
    }

    #[test]
    fn io_error_maps_to_io_code() {
        let io = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let e: AppError = io.into();
        assert!(matches!(e.code, ErrorCode::IoFailed));
    }
}
