use tiny_skia::Color;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);

    #[wasm_bindgen(js_namespace = console)]
    pub fn time(s: &str);

    #[wasm_bindgen(js_namespace = console, js_name = timeEnd)]
    pub fn time_end(s: &str);

    #[wasm_bindgen(js_namespace = ["performance"], js_name = now)]
    pub fn performance_now() -> f64;
}

/// 解析 hex 颜色为 tiny-skia Color，支持透明/半透明
///
/// 支持格式：#RGB, #RRGGBB, #RRGGBBAA
/// 3 字符 hex 自动展开；8 字符 hex 末两位为 alpha
pub fn parse_hex_color(hex: &str) -> Color {
    let hex = hex.trim_start_matches('#');

    match hex.len() {
        3 => {
            // #RGB → #RRGGBB
            let r = u8::from_str_radix(&hex[0..1], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[1..2], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[2..3], 16).unwrap_or(0);
            Color::from_rgba8(r * 17, g * 17, b * 17, 255)
        }
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            Color::from_rgba8(r, g, b, 255)
        }
        8 => {
            // #RRGGBBAA 含 alpha 通道，支持透明/半透明
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            let a = u8::from_str_radix(&hex[6..8], 16).unwrap_or(255);
            Color::from_rgba8(r, g, b, a)
        }
        _ => Color::from_rgba8(0, 0, 0, 255), // 非法长度 → 默认黑色
    }
}

/// 检测是否为拉丁文字（与 Python 版本相同逻辑）
pub fn is_latin_script(text: &str) -> bool {
    if text.is_empty() {
        return true;
    }

    let latin_count = text
        .chars()
        .filter(|c| c.is_alphabetic())
        .filter(|c| (*c as u32) < 0x250)
        .count();

    let total_alpha = text.chars().filter(|c| c.is_alphabetic()).count();

    if total_alpha == 0 {
        return true;
    }

    (latin_count as f32 / total_alpha as f32) > 0.8
}

/// 格式化城市名（拉丁文加字间距，非拉丁文保持原样）
pub fn format_city_name(city: &str) -> String {
    if is_latin_script(city) {
        let char_count = city.chars().count();
        let mut formatted = String::with_capacity(city.len() * 2 + char_count.saturating_sub(1));
        for (idx, ch) in city.chars().enumerate() {
            if idx > 0 {
                formatted.push(' ');
            }
            formatted.push(ch);
        }
        formatted
    } else {
        // 非拉丁文：保持原样
        city.to_string()
    }
}

/// 格式化坐标显示
pub fn format_coordinates(lat: f64, lon: f64) -> String {
    let lat_dir = if lat >= 0.0 { "N" } else { "S" };
    let lon_dir = if lon >= 0.0 { "E" } else { "W" };

    format!(
        "{:.4}° {} / {:.4}° {}",
        lat.abs(),
        lat_dir,
        lon.abs(),
        lon_dir
    )
}

/// 动态计算字体大小
/// 当字符数超过阈值时，字体大小按比例缩小，阈值越大，字体越大
pub fn calculate_font_size(text: &str, base_size: f32, threshold: usize) -> f32 {
    if text.len() > threshold {
        (base_size * threshold as f32 / text.len() as f32).max(10.0)
    } else {
        base_size
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_color() {
        // 6 字符 hex
        let color = parse_hex_color("#FF5733");
        assert_eq!(color, Color::from_rgba8(255, 87, 51, 255));
        // 3 字符 hex 展开
        let color3 = parse_hex_color("#F53");
        assert_eq!(color3, Color::from_rgba8(0xFF, 0x55, 0x33, 255));
        // 8 字符 hex 含 alpha
        let color8a = parse_hex_color("#FF573380");
        assert_eq!(color8a, Color::from_rgba8(255, 87, 51, 128));
        // 8 字符 hex 全透明
        let trans = parse_hex_color("#00000000");
        assert_eq!(trans, Color::from_rgba8(0, 0, 0, 0));
        // 非法长度 → 回退黑色
        let invalid = parse_hex_color("#12");
        assert_eq!(invalid, Color::from_rgba8(0, 0, 0, 255));
    }

    #[test]
    fn test_is_latin_script() {
        assert!(is_latin_script("Paris"));
        assert!(is_latin_script("New York"));
        assert!(!is_latin_script("东京"));
        assert!(!is_latin_script("北京"));
    }

    #[test]
    fn test_format_city_name() {
        assert_eq!(format_city_name("Paris"), "P  A  R  I  S");
        assert_eq!(format_city_name("东京"), "东京");
    }
}
