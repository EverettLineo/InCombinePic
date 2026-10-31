use crate::error::{AppError, ErrorCode};
use fast_image_resize::IntoImageView;
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

/// 解码后 RGBA 估算（MB）。4 字节/像素、1024 进制，与前端展示口径一致。
///
/// 抽成纯函数的原因：直接用一张 40 MP 的真图去测阈值，单测会吃掉 160 MB 内存；
/// 而阈值本身只是两个数的比较，不该为了测它去造一张大图。
pub fn estimate_rgba_mb(width: u32, height: u32) -> f64 {
    (width as f64 * height as f64 * 4.0) / (1024.0 * 1024.0)
}

/// 是否超过单张风险阈值。阈值只在这里定义一次，前端只读结果。
pub fn is_risky(width: u32, height: u32) -> bool {
    width as f64 * height as f64 > RISK_MEGAPIXELS * 1_000_000.0
}

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
            estimated_rgba_mb: estimate_rgba_mb(w, h),
            risky: is_risky(w, h),
        }),
        error: None,
    }
}

/// 批量探测：逐文件隔离，结果顺序与入参一致
pub fn probe_many(paths: &[String]) -> Vec<ProbeOutcome> {
    paths.iter().map(|p| probe_one(p)).collect()
}

// ---------- 缩略图（分级解码的第一步） ----------

/// 按 EXIF 方向把像素真正转正。
/// 只报告"方向值"而不转像素，会导致缩略图与画布显示方向不一致。
fn apply_orientation(img: image::DynamicImage, orientation: u16) -> image::DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// 解码并转正。探测与缩略图共用，避免两处方向处理不一致。
pub fn decode_oriented(path: &Path) -> Result<image::DynamicImage, AppError> {
    let img = image::ImageReader::open(path)
        .and_then(|r| r.with_guessed_format())
        .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("无法打开图片：{e}")))?
        .decode()
        .map_err(|e| {
            AppError::new(ErrorCode::DecodeFailed, format!("图片解码失败：{e}"))
                .with_hint("文件可能已损坏或为不完整下载")
        })?;
    Ok(apply_orientation(img, read_orientation(path)))
}

/// 解码并编码为 PNG 字节，可按最长边缩放。
///
/// 用途：把位图以 `blob:` 形式交给前端渲染。**不能用 asset 协议**——
/// `asset.localhost` 与页面不同源，用它加载的位图会污染 canvas，
/// 导出时 `canvas.toBlob` 会直接抛 "Tainted canvases may not be exported"
/// （2026-10-31 实测于导出流程）。
///
/// 选 PNG 而不是 JPEG：导出源必须是**无损**的，否则 JPEG 输出会经历两次有损编码。
pub fn png_bytes(path: &Path, max_edge: u32) -> Result<(Vec<u8>, u32, u32), AppError> {
    let img = decode_oriented(path)?;
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 {
        return Err(AppError::new(ErrorCode::DecodeFailed, "图片尺寸为空"));
    }

    let limit = max_edge.max(16);
    let scale = (limit as f64 / w.max(h) as f64).min(1.0);
    // 原图比目标小就不放大，避免无意义插值
    let target = if scale >= 1.0 {
        img
    } else {
        let dw = ((w as f64 * scale).round() as u32).max(1);
        let dh = ((h as f64 * scale).round() as u32).max(1);
        img.resize_exact(dw, dh, image::imageops::FilterType::Lanczos3)
    };

    let (tw, th) = (target.width(), target.height());
    let mut out: Vec<u8> = Vec::new();
    target
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .map_err(|e| AppError::new(ErrorCode::Internal, format!("PNG 编码失败：{e}")))?;
    Ok((out, tw, th))
}

/// 生成缩略图到指定路径，返回实际尺寸。
///
/// 这是"分级解码"的落地：画布与列表只需要显示尺寸的像素，
/// 没必要把原图全量塞进内存（50 张 8000×6000 全量驻留约 9 GB）。
pub fn make_thumbnail(src: &Path, dst: &Path, max_edge: u32) -> Result<(u32, u32), AppError> {
    let img = decode_oriented(src)?;
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 {
        return Err(AppError::new(ErrorCode::DecodeFailed, "图片尺寸为空"));
    }

    let max_edge = max_edge.max(16);
    let scale = (max_edge as f64 / w.max(h) as f64).min(1.0);
    let dw = ((w as f64 * scale).round() as u32).max(1);
    let dh = ((h as f64 * scale).round() as u32).max(1);

    // 原图已经比目标小则不放大，直接存原尺寸，避免无意义的插值模糊
    if scale >= 1.0 {
        img.save(dst)
            .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("缩略图写入失败：{e}")))?;
        return Ok((w, h));
    }

    let pixel_type = img.pixel_type().ok_or_else(|| {
        AppError::new(
            ErrorCode::Internal,
            "不支持的像素格式，无法生成缩略图",
        )
    })?;

    let mut dst_image = fast_image_resize::images::Image::new(dw, dh, pixel_type);
    let mut resizer = fast_image_resize::Resizer::new();
    resizer
        .resize(&img, &mut dst_image, None)
        .map_err(|e| AppError::new(ErrorCode::Internal, format!("缩略图缩放失败：{e}")))?;

    image::save_buffer_with_format(
        dst,
        dst_image.buffer(),
        dw,
        dh,
        img.color(),
        image::ImageFormat::Png,
    )
    .map_err(|e| AppError::new(ErrorCode::IoFailed, format!("缩略图写入失败：{e}")))?;

    Ok((dw, dh))
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

    #[test]
    fn thumbnail_preserves_aspect_ratio_and_is_smaller() {
        let d = tmpdir("thumb");
        let src = d.join("big.png");
        RgbaImage::from_pixel(400, 200, image::Rgba([10, 20, 30, 255]))
            .save(&src)
            .unwrap();
        let dst = d.join("t.png");

        let (w, h) = make_thumbnail(&src, &dst, 100).unwrap();
        assert_eq!((w, h), (100, 50), "等比缩放到最长边 100");
        assert!(dst.exists(), "缩略图文件必须落盘");
    }

    #[test]
    fn thumbnail_does_not_upscale_small_images() {
        let d = tmpdir("thumbsmall");
        let src = d.join("small.png");
        RgbaImage::from_pixel(64, 48, image::Rgba([1, 2, 3, 255]))
            .save(&src)
            .unwrap();
        let dst = d.join("t.png");

        let (w, h) = make_thumbnail(&src, &dst, 256).unwrap();
        assert_eq!((w, h), (64, 48), "小图不应被放大");
    }

    #[test]
    fn png_bytes_scales_and_stays_decodable() {
        // 导出源的新通道：字节必须能被前端解码，且按 max_edge 等比缩放
        let d = tmpdir("pngbytes");
        let p = write_png(&d, "src.png", 400, 200);
        let (bytes, w, h) = png_bytes(std::path::Path::new(&p), 100).unwrap();
        assert_eq!((w, h), (100, 50));
        assert!(!bytes.is_empty());
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (100, 50));
    }

    #[test]
    fn png_bytes_does_not_upscale() {
        let d = tmpdir("pngbytes2");
        let p = write_png(&d, "small.png", 64, 48);
        let (_, w, h) = png_bytes(std::path::Path::new(&p), 256).unwrap();
        assert_eq!((w, h), (64, 48), "原图小于目标尺寸时不应放大");
    }

    #[test]
    fn png_bytes_reports_error_for_missing_file() {
        let r = png_bytes(std::path::Path::new("C:/__not_exists__.png"), 64);
        assert!(r.is_err(), "缺失文件必须返回错误，而不是空字节");
    }

    #[test]
    fn thumbnail_of_corrupt_file_returns_error() {
        let d = tmpdir("thumbbad");
        let bad = d.join("bad.png");
        fs::write(&bad, b"not an image at all").unwrap();
        let dst = d.join("t.png");
        let r = make_thumbnail(&bad, &dst, 64);
        assert!(r.is_err(), "坏文件必须报错而不是产出空图");
    }
}

/// 压力测试（T12.3）。
///
/// 默认 `#[ignore]`：常规 `cargo test` 不该被压测拖慢，但这条必须能随时重跑。
/// 执行方式：`cargo test --release -- --ignored --nocapture stress`
///
/// 为什么必须在 release 下跑：debug 构建的图像解码慢一个数量级，
/// 用 debug 数字做容量判断会得出完全错误的结论。
#[cfg(test)]
mod stress {
    use super::*;
    use image::{Rgb, RgbImage};
    use std::time::Instant;

    #[test]
    #[ignore = "压力测试：50 张 6MP 图片导入，需 --release --ignored 显式执行"]
    fn fifty_photos_probe_within_budget() {
        let dir = std::env::temp_dir().join(format!("pintu_stress_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // 生成 50 张 3000×2000 JPEG：手机照片的典型量级（6 MP / 单张解码约 24 MB RGBA）
        let t = Instant::now();
        let mut paths = Vec::with_capacity(50);
        for i in 0..50u32 {
            let p = dir.join(format!("photo_{i:02}.jpg"));
            let img = RgbImage::from_fn(3000, 2000, |x, y| {
                Rgb([(x % 256) as u8, (y % 256) as u8, ((i * 5) % 256) as u8])
            });
            img.save_with_format(&p, image::ImageFormat::Jpeg).unwrap();
            paths.push(p.to_string_lossy().to_string());
        }
        let gen_time = t.elapsed();

        let t = Instant::now();
        let outcomes = probe_many(&paths);
        let elapsed = t.elapsed();

        let ok = outcomes.iter().filter(|o| o.ok).count();
        let total_mb: f64 = outcomes
            .iter()
            .filter_map(|o| o.meta.as_ref())
            .map(|m| m.estimated_rgba_mb)
            .sum();

        println!("---- T12.3 50 张 3000×2000 JPEG ----");
        println!("生成耗时      : {:.2?}", gen_time);
        println!(
            "探测总耗时    : {:.2?}（{:.1} ms/张）",
            elapsed,
            elapsed.as_secs_f64() * 1000.0 / 50.0
        );
        println!("成功          : {ok}/50");
        println!("解码后总占用  : {:.0} MB（若同时驻留）", total_mb);

        assert_eq!(ok, 50, "50 张正常 JPEG 必须全部探测成功");
        // 顺序解码下峰值只取决于单张，与张数无关
        assert!(total_mb > 1000.0, "50 张 6MP 累计应超过 1 GB，说明估算口径生效");
        // 预算：单张平均不超过 400ms（release）。超出说明探测路径退化成了二次解码
        assert!(
            elapsed.as_secs_f64() / 50.0 < 0.4,
            "单张平均耗时 {:.1} ms 超出预算",
            elapsed.as_secs_f64() * 1000.0 / 50.0
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// 风险阈值的边界用例（对应 T12.2 的「超大」一类）。
///
/// 不造真图：40 MP 的位图要 160 MB 内存，而这里要验的只是两个数的比较。
#[cfg(test)]
mod thresholds {
    use super::*;

    #[test]
    fn rgba_estimate_follows_display_convention() {
        // 4000×3000 = 12 MP → 45.78 MB（前端列表与预警用的就是这个数）
        assert!((estimate_rgba_mb(4000, 3000) - 45.776).abs() < 0.01);
        // 1×1 也必须是正数，不能出现 0 导致"估算为 0 MB"的误导
        assert!(estimate_rgba_mb(1, 1) > 0.0);
    }

    #[test]
    fn risk_flag_flips_just_above_forty_megapixels() {
        // 8000×5000 正好 40 MP：阈值是"大于"，不算风险
        assert!(!is_risky(8000, 5000));
        // 多 1 行就超阈值
        assert!(is_risky(8000, 5001));
        // 20000 宽的单边极端值同样被判为风险
        assert!(is_risky(20_000, 3000));
        // 常见手机照片不触发（4032×3024 ≈ 12.2 MP）
        assert!(!is_risky(4032, 3024));
    }
}
