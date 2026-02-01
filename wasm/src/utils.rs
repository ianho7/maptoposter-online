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
}

/// 解析 hex 颜色为 tiny-skia Color
pub fn parse_hex_color(hex: &str) -> Color {
    let hex = hex.trim_start_matches('#');

    if hex.len() != 6 {
        // 默认黑色
        return Color::from_rgba8(0, 0, 0, 255);
    }

    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);

    Color::from_rgba8(r, g, b, 255)
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
        // 拉丁文：大写 + 双空格字间距
        city.to_uppercase()
            .chars()
            .map(|c| c.to_string())
            .collect::<Vec<String>>()
            .join("  ")
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
        let color = parse_hex_color("#FF5733");
        assert_eq!(color, Color::from_rgba8(255, 87, 51, 255));
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
