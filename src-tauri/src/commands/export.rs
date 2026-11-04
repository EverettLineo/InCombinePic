//! 导出管线。
//!
//! 分工：
//! - 前端用 Konva 逐条带渲染（与预览同一套代码），把每条条带编码成 PNG；
//! - 本模块负责解码条带、拼进整幅 RGBA 缓冲、按目标格式编码并落盘。
//!
//! 不在 Rust 重画：预览与导出一致性只能靠同一套渲染代码保证，
//! 重写几何意味着裁剪、圆角、边框规则要在两处维护（见 docs/adr/ADR-0008）。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use image::{ExtendedColorType, ImageEncoder};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, ErrorCode};

/// 单边像素上限
pub const MAX_EDGE: u32 = 20_000;
/// 整幅 RGBA 缓冲上限：超过则拒绝，避免把机器拖进交换区
pub const MAX_RGBA_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Png,
    Jpeg,
}

#[derive(Debug)]
struct Job {
    width: u32,
    height: u32,
    format: ExportFormat,
    quality: u8,
    /// 整幅 RGBA8，行优先
    buf: Vec<u8>,
    /// 已写入的行数：finish 时要求等于 height，否则说明有条带丢失
    filled: u32,
}

impl Job {
    fn new(width: u32, height: u32, format: ExportFormat, quality: u8) -> Result<Self, AppError> {
        if width == 0 || height == 0 {
            return Err(AppError::new(ErrorCode::Internal, "导出尺寸必须大于 0"));
        }
        if width > MAX_EDGE || height > MAX_EDGE {
            return Err(AppError::new(
                ErrorCode::OutOfMemory,
                format!("单边上限为 {MAX_EDGE} px，当前 {width} × {height}"),
            )
            .with_hint("请降低输出尺寸后重试"));
        }
        let len = width as u64 * height as u64 * 4;
        if len > MAX_RGBA_BYTES {
            return Err(AppError::new(
                ErrorCode::OutOfMemory,
                format!("导出尺寸 {width} × {height} 需要约 {} MB 内存，超出安全范围", len / 1024 / 1024),
            )
            .with_hint("请降低输出尺寸，或分多次导出"));
        }

        let mut buf: Vec<u8> = Vec::new();
        buf.try_reserve_exact(len as usize).map_err(|_| {
            AppError::new(ErrorCode::OutOfMemory, "无法分配导出缓冲区")
                .with_hint("请关闭其他占用内存的程序，或降低输出尺寸")
        })?;
        buf.resize(len as usize, 0);

        Ok(Self {
            width,
            height,
            format,
            quality: quality.clamp(60, 100),
            buf,
            filled: 0,
        })
    }

    /// 把一条条带写进整幅缓冲。
    ///
    /// `rows` 是实际写入的行数；条带图可能比它高 1 行（重叠），多出的行丢弃，
    /// 否则相邻条带会重复一行像素。
    fn write_strip(&mut self, row_start: u32, rows: u32, rgba: &[u8]) -> Result<(), AppError> {
        if rows == 0 {
            return Ok(());
        }
        if row_start + rows > self.height {
            return Err(AppError::new(
                ErrorCode::Internal,
                format!("条带越界：起点 {row_start} + 行数 {rows} 超过画布高度 {}", self.height),
            ));
        }

        let row_bytes = self.width as usize * 4;
        if rgba.len() < rows as usize * row_bytes {
            return Err(AppError::new(ErrorCode::Internal, "条带数据长度不足"));
        }

        let dst_start = row_start as usize * row_bytes;
        let dst_end = dst_start + rows as usize * row_bytes;
        self.buf[dst_start..dst_end].copy_from_slice(&rgba[..rows as usize * row_bytes]);

        self.filled = (self.filled).max(row_start + rows);
        Ok(())
    }

    fn encode(&self) -> Result<Vec<u8>, AppError> {
        let mut out: Vec<u8> = Vec::new();
        match self.format {
            ExportFormat::Png => {
                image::codecs::png::PngEncoder::new(&mut out)
                    .write_image(&self.buf, self.width, self.height, ExtendedColorType::Rgba8)
                    .map_err(|e| {
                        AppError::new(ErrorCode::Internal, format!("PNG 编码失败：{e}"))
                            .with_hint("请降低输出尺寸后重试")
                    })?;
            }
            ExportFormat::Jpeg => {
                let rgb = rgba_to_rgb(&self.buf);
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, self.quality)
                    .write_image(&rgb, self.width, self.height, ExtendedColorType::Rgb8)
                    .map_err(|e| {
                        AppError::new(ErrorCode::Internal, format!("JPEG 编码失败：{e}"))
                            .with_hint("请降低输出尺寸后重试")
                    })?;
            }
        }
        Ok(out)
    }
}

fn rgba_to_rgb(buf: &[u8]) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(buf.len() / 4 * 3);
    for px in buf.chunks_exact(4) {
        rgb.extend_from_slice(&px[..3]);
    }
    rgb
}

#[derive(Default)]
pub struct ExportState {
    job: Mutex<Option<Job>>,
}

#[derive(Debug, Serialize)]
pub struct FinishResult {
    pub path: String,
    pub bytes: u64,
    pub width: u32,
    pub height: u32,
}

/// 开始一次导出：分配整幅缓冲
#[tauri::command]
pub async fn export_begin(
    state: State<'_, ExportState>,
    width: u32,
    height: u32,
    format: ExportFormat,
    quality: u8,
) -> Result<(), AppError> {
    let job = Job::new(width, height, format, quality)?;
    let mut guard = state.job.lock().map_err(|_| {
        AppError::new(ErrorCode::Internal, "导出状态异常").with_hint("请重启应用后重试")
    })?;
    *guard = Some(job);
    Ok(())
}

/// 写入一条条带。`png_base64` 是前端条带画布导出的 PNG（可能比 rows 多 1 行重叠）
///
/// 声明为 `async`：Tauri 的同步命令在主线程执行，而 PNG 解码是重活，
/// 放在主线程会让窗口在导出期间卡住。
#[tauri::command]
pub async fn export_write_strip(
    state: State<'_, ExportState>,
    row_start: u32,
    rows: u32,
    png_base64: String,
) -> Result<(), AppError> {
    let (width, height, raw) = tauri::async_runtime::spawn_blocking(move || {
        let bytes = B64.decode(png_base64.as_bytes()).map_err(|_| {
            AppError::new(ErrorCode::Internal, "条带数据无法解码").with_hint("请重试导出")
        })?;
        let img =
            image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).map_err(|e| {
                AppError::new(ErrorCode::DecodeFailed, format!("条带解码失败：{e}"))
                    .with_hint("请重试导出；若反复失败请降低输出尺寸")
            })?;
        let rgba = img.to_rgba8();
        Ok::<_, AppError>((rgba.width(), rgba.height(), rgba.into_raw()))
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Internal, format!("条带任务异常：{e}")))??;

    let mut guard = state.job.lock().map_err(|_| {
        AppError::new(ErrorCode::Internal, "导出状态异常").with_hint("请重启应用后重试")
    })?;
    let job = guard.as_mut().ok_or_else(|| {
        AppError::new(ErrorCode::Internal, "没有正在进行的导出任务").with_hint("请重新开始导出")
    })?;

    if width != job.width {
        return Err(AppError::new(
            ErrorCode::Internal,
            format!("条带宽度不匹配：期望 {}，实际 {width}", job.width),
        ));
    }
    if height < rows {
        return Err(AppError::new(
            ErrorCode::Internal,
            format!("条带高度不足：期望至少 {rows} 行，实际 {height} 行"),
        ));
    }

    job.write_strip(row_start, rows, &raw)
}

/// 完成导出：编码并落盘。
///
/// 编码 20,000 px 的图要数秒，必须离开主线程（同 `export_write_strip` 的理由）。
#[tauri::command]
pub async fn export_finish(
    state: State<'_, ExportState>,
    path: String,
) -> Result<FinishResult, AppError> {
    let job = {
        let mut guard = state.job.lock().map_err(|_| {
            AppError::new(ErrorCode::Internal, "导出状态异常").with_hint("请重启应用后重试")
        })?;
        guard.take().ok_or_else(|| {
            AppError::new(ErrorCode::Internal, "没有正在进行的导出任务").with_hint("请重新开始导出")
        })?
    };

    if job.filled != job.height {
        return Err(AppError::new(
            ErrorCode::Internal,
            format!("导出不完整：已写入 {} / {} 行", job.filled, job.height),
        )
        .with_hint("请重试导出"));
    }

    let width = job.width;
    let height = job.height;
    let target = path.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<u64, AppError> {
        let data = job.encode()?;
        write_atomically(Path::new(&target), &data)?;
        Ok(data.len() as u64)
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Internal, format!("导出任务异常：{e}")))??;

    Ok(FinishResult {
        path,
        bytes,
        width,
        height,
    })
}

/// 放弃导出，释放缓冲
#[tauri::command]
pub fn export_abort(state: State<'_, ExportState>) -> Result<(), AppError> {
    let mut guard = state.job.lock().map_err(|_| {
        AppError::new(ErrorCode::Internal, "导出状态异常").with_hint("请重启应用后重试")
    })?;
    *guard = None;
    Ok(())
}

/// 先写临时文件再改名：失败时不会留下半张图（也避免覆盖到一半崩溃）
fn write_atomically(path: &Path, data: &[u8]) -> Result<(), AppError> {
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            return Err(AppError::new(
                ErrorCode::WriteDenied,
                format!("保存目录不存在：{}", dir.display()),
            )
            .with_hint("请选择一个已存在的文件夹"));
        }
    }

    let mut tmp: PathBuf = path.to_path_buf();
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("export.tmp");
    tmp.set_file_name(format!(".{file_name}.tmp"));

    fs::write(&tmp, data).map_err(|e| {
        let code = if e.kind() == std::io::ErrorKind::PermissionDenied {
            ErrorCode::WriteDenied
        } else {
            ErrorCode::IoFailed
        };
        AppError::new(code, format!("写入文件失败：{e}"))
            .with_hint("请检查目标文件夹是否有写入权限，或换一个位置")
    })?;

    // Windows 上 rename 不覆盖已存在文件，先删再改名
    if path.exists() {
        fs::remove_file(path).map_err(|e| {
            AppError::new(ErrorCode::WriteDenied, format!("无法覆盖已有文件：{e}"))
                .with_hint("请关闭正在使用该文件的程序，或换一个文件名")
        })?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::new(ErrorCode::IoFailed, format!("保存文件失败：{e}"))
            .with_hint("请检查目标文件夹是否可写")
    })?;

    Ok(())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn open_exported(path: String) -> Result<(), AppError> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| {
        AppError::new(ErrorCode::Internal, format!("无法打开文件：{e}"))
            .with_hint("请手动到文件夹中打开")
    })
}

#[tauri::command]
pub fn reveal_exported(path: String) -> Result<(), AppError> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| {
        AppError::new(ErrorCode::Internal, format!("无法打开所在文件夹：{e}"))
            .with_hint("请手动打开文件所在目录")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(w: u32, h: u32) -> Job {
        Job::new(w, h, ExportFormat::Png, 92).expect("job")
    }

    #[test]
    fn rejects_oversize_dimensions() {
        let e = Job::new(MAX_EDGE + 1, 10, ExportFormat::Png, 92).unwrap_err();
        assert!(matches!(e.code, ErrorCode::OutOfMemory));
    }

    #[test]
    fn rejects_huge_area() {
        // 20000 × 20000 RGBA = 1.6 GB，超过缓冲上限
        let e = Job::new(20_000, 20_000, ExportFormat::Png, 92).unwrap_err();
        assert!(matches!(e.code, ErrorCode::OutOfMemory));
    }

    #[test]
    fn strip_lands_at_the_right_rows() {
        let mut j = job(2, 3);
        // 第 1 行：红；条带只写第 1 行
        let strip = [255, 0, 0, 255, 255, 0, 0, 255];
        j.write_strip(1, 1, &strip).unwrap();

        let row_bytes = 2 * 4;
        assert_eq!(&j.buf[0..row_bytes], &[0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(&j.buf[row_bytes..row_bytes * 2], &strip[..]);
        assert_eq!(j.filled, 2);
    }

    #[test]
    fn overlap_rows_are_discarded_not_duplicated() {
        let mut j = job(1, 3);
        // 条带高 2 行（含 1 行重叠），但只应写入 1 行
        let strip = [
            10, 10, 10, 255, // 应写入
            99, 99, 99, 255, // 重叠行，应丢弃
        ];
        j.write_strip(0, 1, &strip).unwrap();
        assert_eq!(&j.buf[0..4], &[10, 10, 10, 255]);
        assert_eq!(&j.buf[4..8], &[0, 0, 0, 0]);
        assert_eq!(j.filled, 1);
    }

    #[test]
    fn rejects_strip_beyond_canvas() {
        let mut j = job(1, 2);
        let e = j.write_strip(2, 1, &[0, 0, 0, 0]).unwrap_err();
        assert!(matches!(e.code, ErrorCode::Internal));
    }

    #[test]
    fn rejects_short_strip_data() {
        let mut j = job(2, 2);
        let e = j.write_strip(0, 1, &[0, 0, 0, 0]).unwrap_err();
        assert!(matches!(e.code, ErrorCode::Internal));
    }

    #[test]
    fn png_encode_roundtrip_keeps_pixels() {
        let mut j = job(2, 1);
        j.write_strip(0, 1, &[1, 2, 3, 255, 4, 5, 6, 128]).unwrap();
        let bytes = j.encode().unwrap();
        let decoded = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
            .unwrap()
            .to_rgba8();
        assert_eq!(decoded.width(), 2);
        assert_eq!(decoded.get_pixel(0, 0).0, [1, 2, 3, 255]);
        assert_eq!(decoded.get_pixel(1, 0).0, [4, 5, 6, 128]);
    }

    #[test]
    fn jpeg_output_is_valid_and_drops_alpha() {
        let mut j = Job::new(4, 4, ExportFormat::Jpeg, 92).expect("job");
        j.write_strip(0, 4, &vec![200u8; 4 * 4 * 4]).unwrap();
        let bytes = j.encode().unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xD8]);
        let decoded = image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg).unwrap();
        assert_eq!(decoded.width(), 4);
    }

    #[test]
    fn quality_is_clamped_to_valid_range() {
        let j = Job::new(4, 4, ExportFormat::Jpeg, 5).unwrap();
        assert_eq!(j.quality, 60);
        let j = Job::new(4, 4, ExportFormat::Jpeg, 200).unwrap();
        assert_eq!(j.quality, 100);
    }
}

/// 压力测试：20,000 px 导出的真实成本。
///
/// 默认 `#[ignore]`，执行方式：
/// `cargo test --release -- --ignored --nocapture twenty_thousand`
///
/// 这条要回答三个问题：能不能成功、占多少内存、要跑多久。
/// 三者都只能实测——`validateExportSize` 只证明"尺寸合法"，不证明"真的编得出来"。
#[cfg(test)]
mod stress {
    use super::*;
    use std::io::Cursor;
    use std::time::Instant;

    /// 与前端 STRIP_H 保持一致（domain/export.ts）
    const STRIP_H: u32 = 2048;

    /// 生成一条条带。
    ///
    /// 用「渐变 + 确定性噪声」而不是纯渐变：纯渐变压缩比可达 200:1，
    /// 测出来的编码时间会比真实照片乐观一个数量级（第一版就栽在这里，
    /// PNG 只花了 32ms，因为它几乎没东西可压）。
    fn fill_strip(width: u32, rows: u32, row_offset: u32, total_h: u32) -> Vec<u8> {
        let mut buf = vec![0u8; width as usize * rows as usize * 4];
        for r in 0..rows as usize {
            let y = row_offset as usize + r;
            for c in 0..width as usize {
                let o = (r * width as usize + c) * 4;
                // 确定性伪噪声（xorshift 式混合），不引入随机源，每次结果一致
                let n = (c.wrapping_mul(73_856_093) ^ y.wrapping_mul(19_349_663)) >> 8;
                buf[o] = (((c * 255) / width as usize) as u8).wrapping_add((n & 0x3f) as u8);
                buf[o + 1] = (((y * 255) / total_h as usize) as u8).wrapping_add(((n >> 6) & 0x3f) as u8);
                buf[o + 2] = 128u8.wrapping_add(((n >> 12) & 0x3f) as u8);
                buf[o + 3] = 255;
            }
        }
        buf
    }

    #[test]
    #[ignore = "压力测试：2400×20000 导出，需 --release --ignored 显式执行"]
    fn twenty_thousand_px_export_is_feasible() {
        let w = 2400u32;
        let h = 20_000u32;

        // 1) 分配整幅缓冲（192 MB）
        let t = Instant::now();
        let mut job = Job::new(w, h, ExportFormat::Png, 92).expect("192MB 缓冲应能分配");
        let alloc = t.elapsed();
        assert_eq!(job.buf.len(), w as usize * h as usize * 4);

        // 2) 逐条带写入，模拟前端 10 次 IPC
        let t = Instant::now();
        let mut row = 0u32;
        let mut strips = 0u32;
        while row < h {
            let rows = STRIP_H.min(h - row);
            let buf = fill_strip(w, rows, row, h);
            job.write_strip(row, rows, &buf).unwrap();
            row += rows;
            strips += 1;
        }
        let fill = t.elapsed();
        assert_eq!(job.filled, h);

        // 3) PNG 编码（无损，最坏情况）
        let t = Instant::now();
        let png = job.encode().expect("PNG 编码应成功");
        let png_time = t.elapsed();

        // 4) 同一缓冲改编码 JPEG 92
        job.format = ExportFormat::Jpeg;
        job.quality = 92;
        let t = Instant::now();
        let jpg = job.encode().expect("JPEG 编码应成功");
        let jpg_time = t.elapsed();

        // 5) 只读文件头校验尺寸，不整幅解码（否则又要 192 MB + 十几秒）
        let png_dim = image::ImageReader::new(Cursor::new(&png))
            .with_guessed_format()
            .unwrap()
            .into_dimensions()
            .unwrap();
        let jpg_dim = image::ImageReader::new(Cursor::new(&jpg))
            .with_guessed_format()
            .unwrap()
            .into_dimensions()
            .unwrap();
        assert_eq!(png_dim, (w, h));
        assert_eq!(jpg_dim, (w, h));

        let buf_mb = job.buf.len() / 1024 / 1024;
        let peak_mb = (job.buf.len() + png.len()) / 1024 / 1024;
        println!("---- 2400×20000 导出（渐变+噪声，接近照片熵）----");
        println!("分配缓冲        : {:.2?}（{buf_mb} MB）", alloc);
        println!("写入 {strips} 条条带  : {:.2?}", fill);
        println!("PNG 编码        : {:.2?} → {} MB", png_time, png.len() / 1024 / 1024);
        println!("JPEG 编码       : {:.2?} → {} MB", jpg_time, jpg.len() / 1024 / 1024);
        println!("峰值内存估算    : {peak_mb} MB（缓冲 + PNG 输出）");

        // 预算：整条链路 120 秒内完成。导出是用户显式等待的操作，但仍要有上限
        let total = alloc + fill + png_time;
        assert!(total.as_secs() < 120, "PNG 链路总耗时 {total:.2?} 超出预算");
        // 两种格式都必须产出非空数据（不再假设 PNG 一定比 JPEG 大：
        // 合成图上 PNG 可以比 JPEG 小得多，体积大小取决于内容，不是格式的定律）
        assert!(png.len() > 1024 && jpg.len() > 1024, "编码结果不应为空");
        // 峰值必须仍在可控范围：缓冲 192MB + 输出不超过同量级
        assert!(peak_mb < 700, "峰值 {peak_mb} MB 超出预期");
    }
}
