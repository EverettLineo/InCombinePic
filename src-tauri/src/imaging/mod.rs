use crate::error::{AppError, ErrorCode};
use serde::Serialize;
use std::fs;
use std::path::Path;

/// 探测结果：单文件要么成功带元信息，要么失败带可读原因。
/// 批量导入时**永远不因单个文件失败而整体失败**（基线 §6.3）。
#[derive(Debug, Serialize)]
pub struct ProbeOutcome {
    pub path: String,
    pub ok: bool,
    pub meta: Option<ImageMeta>,
    pub error: Option<AppError>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    /// png / jpeg / webp / bmp
    pub format: String,
    pub has_alpha: bool,
    pub file_size: u64,
    /// EXIF Orientation（1..8），已应用到 width/height
    pub exif_orientation: u16,
    /// 解码后 RGBA 估算占用（MB），供前端做导入风险预警
    pub estimated_rgba_mb: f64,
    /// 是否超过单张风险阈值。判定放在 Rust 侧，避免前后端各存一份阈值导致不同步
    pub risky: bool,
}

/// 单张图片超过该像素数时提示内存风险（不是硬性上限，用户可继续）
pub const RISK_MEGAPIXELS: f64 = 40.0;

fn map_format(f: image::ImageFormat) -> Option<&'static str> {
    match f {
        image::ImageFormat::Png => Some("png"),
        image::ImageFormat::Jpeg => Some("jpeg"),
        image::ImageFormat::WebP => Some("webp"),
        image::ImageFormat::Bmp => Some("bmp"),
        _ => None,
    }
}

/// 通过 ftyp box 的 brand 判定 HEIC/HEIF。
/// 不能只看扩展名：用户把 HEIC 改名成 .jpg 的情况很常见。
fn is_heic_signature(bytes: &[u8]) -> bool {
    if bytes.len() < 12 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    let brand = &bytes[8..12];
    matches!(
        brand,
        b"heic" | b"heix" | b"hevc" | b"hevx" | b"heim" | b"heis" | b"mif1" | b"msf1" | b"avif"
    )
}

fn is_heic_extension(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let e = ext.to_ascii_lowercase();
            e == "heic" || e == "heif"
        }
        None => false,
    }
}

/// 读取 EXIF 方向；读不到一律按 1（不旋转）处理，绝不因此判定导入失败
fn read_orientation(path: &Path) -> u16 {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut reader = std::io::BufReader::new(file);
    match exif::Reader::new().read_from_container(&mut reader) {
        Ok(exif) => exif
            .get_field(exif::Tag::Orientation, exif::In::PRIMARY)
            .and_then(|f| f.value.get_uint(0))
            .filter(|v| (1..=8).contains(v))
            .map(|v| v as u16)
            .unwrap_or(1),
        Err(_) => 1,
    }
}

/// 5~8 表示需要交换宽高
fn orientation_swaps_axes(o: u16) -> bool {
    matches!(o, 5 | 6 | 7 | 8)
}

/// 探测单个文件。任何失败都转成 AppError，不 panic、不外抛。
pub fn probe_one(path_str: &str) -> ProbeOutcome {
    let path = Path::new(path_str);
    let fail = |code: ErrorCode, msg: String, hint: Option<&str>| ProbeOutcome {
        path: path_str.to_string(),
        ok: false,
        meta: None,
        error: Some(match hint {
            Some(h) => AppError::new(code, msg).with_hint(h),
            None => AppError::new(code, msg),
        }),
    };

    let file_size = match fs::metadata(path) {
        Ok(m) if m.is_file() => m.len(),
        Ok(_) => {
            return fail(ErrorCode::IoFailed, "目标不是文件".into(), Some("请选择图片文件"));
        }
        Err(e) => {
            return fail(
                ErrorCode::IoFailed,
                format!("无法读取文件：{e}"),
                Some("请确认文件仍存在且未被移动"),
            );
        }
    };

    // 先用文件头判断格式，再解码。两步都要做：
    // T0.8 实测证明截断文件的 guess_format 仍会返回 Png，只有解码才会暴露问题。
    let head = match fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            return fail(ErrorCode::IoFailed, format!("无法读取文件内容：{e}"), None);
        }
    };

    if is_heic_signature(&head) || is_heic_extension(path) {
        return ProbeOutcome {
            path: path_str.to_string(),
            ok: false,
            meta: None,
            error: Some(AppError::heic_unsupported()),
        };
    }

    let format = match image::guess_format(&head) {
        Ok(f) => f,
        Err(_) => {
            return fail(
                ErrorCode::UnsupportedFormat,
                "无法识别的图片格式".into(),
                Some("v1 支持 PNG、JPG、WebP、BMP；HEIC 请先转换为上述格式"),
            );
        }
    };

    let format_name = match map_format(format) {
        Some(n) => n,
        None => {
            return fail(
                ErrorCode::UnsupportedFormat,
                format!("暂不支持该图片格式（{format:?}）"),
                Some("v1 支持 PNG、JPG、WebP、BMP"),
            );
        }
    };

    // 实际解码：验证文件完整可解，而不是只读文件头
    let decoded = image::ImageReader::open(path)
        .and_then(|r| r.with_guessed_format())
        .map_err(|e| e.to_string())
        .and_then(|r| r.decode().map_err(|e| e.to_string()));

    let img = match decoded {
        Ok(img) => img,
        Err(e) => {
            let msg = format!("图片解码失败：{e}");
            // 内存不足的表现形式因后端而异，统一给出可执行建议
            return fail(
                ErrorCode::DecodeFailed,
                msg,
                Some("文件可能已损坏或为不完整下载，请尝试用其他工具打开验证"),
            );
        }
    };

    let orientation = read_orientation(path);
    let (mut w, mut h) = (img.width(), img.height());
    if orientation_swaps_axes(orientation) {
        std::mem::swap(&mut w, &mut h);
    }

    let px = (w as f64) * (h as f64);
    ProbeOutcome {
        path: path_str.to_string(),
        ok: true,
        meta: Some(ImageMeta {
            width: w,
            height: h,
            format: format_name.to_string(),
            has_alpha: img.color().has_alpha(),
            file_size,
            exif_orientation: orientation,
            estimated_rgba_mb: (px * 4.0) / (1024.0 * 1024.0),
            risky: px > RISK_MEGAPIXELS * 1_000_000.0,
        }),
        error: None,
    }
}

/// 批量探测：逐文件隔离，结果顺序与入参一致
pub fn probe_many(paths: &[String]) -> Vec<ProbeOutcome> {
    paths.iter().map(|p| probe_one(p)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage, RgbaImage};

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("pintu_probe_{tag}_{}", std::process::id()));
        let _ = fs::create_dir_all(&d);
        d
    }

    fn write_png(dir: &Path, name: &str, w: u32, h: u32) -> String {
        let p = dir.join(name);
        let img = RgbaImage::from_pixel(w, h, image::Rgba([1, 2, 3, 128]));
        img.save(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn png_with_alpha_is_detected() {
        let d = tmpdir("png");
        let p = write_png(&d, "a.png", 40, 30);
        let r = probe_one(&p);
        assert!(r.ok, "png 应可导入: {:?}", r.error);
        let m = r.meta.unwrap();
        assert_eq!((m.width, m.height), (40, 30));
        assert!(m.has_alpha);
        assert_eq!(m.format, "png");
    }

    #[test]
    fn jpeg_and_bmp_are_supported() {
        let d = tmpdir("jb");
        let j = d.join("a.jpg");
        RgbImage::from_pixel(20, 10, image::Rgb([9, 9, 9]))
            .save_with_format(&j, ImageFormat::Jpeg)
            .unwrap();
        let rj = probe_one(&j.to_string_lossy());
        assert!(rj.ok, "{:?}", rj.error);
        assert_eq!(rj.meta.unwrap().format, "jpeg");

        let b = d.join("a.bmp");
        RgbImage::from_pixel(8, 8, image::Rgb([1, 1, 1]))
            .save_with_format(&b, ImageFormat::Bmp)
            .unwrap();
        let rb = probe_one(&b.to_string_lossy());
        assert!(rb.ok, "{:?}", rb.error);
        assert_eq!(rb.meta.unwrap().format, "bmp");
    }

    #[test]
    fn truncated_png_fails_with_decode_error_not_panic() {
        let d = tmpdir("trunc");
        let src = write_png(&d, "ok.png", 60, 60);
        let bytes = fs::read(&src).unwrap();
        let bad = d.join("bad.png");
        fs::write(&bad, &bytes[..bytes.len() / 3]).unwrap();

        let r = probe_one(&bad.to_string_lossy());
        assert!(!r.ok, "截断文件必须判定为失败");
        let e = r.error.unwrap();
        assert!(
            matches!(e.code, ErrorCode::DecodeFailed | ErrorCode::UnsupportedFormat),
            "错误码应可解释，实际: {:?}",
            e.code
        );
        assert!(e.message.contains("失败") || e.message.contains("识别"));
    }

    #[test]
    fn heic_signature_is_rejected_with_hint() {
        let d = tmpdir("heic");
        let p = d.join("photo.heic");
        let mut bytes: Vec<u8> = vec![0, 0, 0, 0x18];
        bytes.extend_from_slice(b"ftypheic");
        bytes.extend_from_slice(&[0u8; 32]);
        fs::write(&p, &bytes).unwrap();

        let r = probe_one(&p.to_string_lossy());
        assert!(!r.ok);
        let e = r.error.unwrap();
        assert!(matches!(e.code, ErrorCode::UnsupportedFormat));
        assert!(e.hint.is_some(), "HEIC 必须给出转换建议");
    }

    #[test]
    fn heic_renamed_to_jpg_is_still_rejected() {
        // 只看扩展名会漏掉这种情况
        let d = tmpdir("heicjpg");
        let p = d.join("disguised.jpg");
        let mut bytes: Vec<u8> = vec![0, 0, 0, 0x18];
        bytes.extend_from_slice(b"ftypheic");
        bytes.extend_from_slice(&[0u8; 32]);
        fs::write(&p, &bytes).unwrap();

        let r = probe_one(&p.to_string_lossy());
        assert!(!r.ok);
        assert!(matches!(r.error.unwrap().code, ErrorCode::UnsupportedFormat));
    }

    #[test]
    fn missing_file_reports_io_error() {
        let r = probe_one("C:/definitely/not/here/pintu.png");
        assert!(!r.ok);
        assert!(matches!(r.error.unwrap().code, ErrorCode::IoFailed));
    }

    #[test]
    fn batch_isolates_failures_and_keeps_order() {
        let d = tmpdir("batch");
        let good1 = write_png(&d, "1.png", 10, 10);
        let bad = d.join("2.heic");
        fs::write(&bad, {
            let mut b: Vec<u8> = vec![0, 0, 0, 0x18];
            b.extend_from_slice(b"ftypheic");
            b.extend_from_slice(&[0u8; 16]);
            b
        })
        .unwrap();
        let good2 = write_png(&d, "3.png", 12, 12);

        let out = probe_many(&[good1.clone(), bad.to_string_lossy().to_string(), good2.clone()]);
        assert_eq!(out.len(), 3);
        assert!(out[0].ok && !out[1].ok && out[2].ok, "单文件失败不得影响其他文件");
        assert_eq!(out[0].path, good1);
        assert_eq!(out[2].path, good2);
    }

    #[test]
    fn orientation_swaps_axes_only_for_5_to_8() {
        for o in 1..=8u16 {
            let expect = matches!(o, 5 | 6 | 7 | 8);
            assert_eq!(orientation_swaps_axes(o), expect, "orientation {o}");
        }
    }
}
