use crate::types::BoundingBox;
use std::f64::consts::PI;

/// Web Mercator 投影（EPSG:3857）
/// 将经纬度（WGS84）转换为平面坐标（米）
pub fn project_point(lon: f64, lat: f64) -> (f64, f64) {
    const EARTH_RADIUS: f64 = 6378137.0;

    let lon_rad = lon * (PI / 180.0);
    let lat_rad = lat * (PI / 180.0);

    let x = lon_rad * EARTH_RADIUS;
    let y = lat_rad.tan().asinh() * EARTH_RADIUS;

    (x, y)
}

/// 批量投影坐标点（原地修改）
pub fn project_points_mut(coords: &mut [(f64, f64)]) {
    for coord in coords.iter_mut() {
        *coord = project_point(coord.0, coord.1);
    }
}

/// 批量投影坐标点
pub fn project_points(coords: &[(f64, f64)]) -> Vec<(f64, f64)> {
    coords
        .iter()
        .map(|(lon, lat)| project_point(*lon, *lat))
        .collect()
}

/// 计算边界框（固定半径，确保所有尺寸看到相同的地理区域）
pub fn calculate_bounds(
    center_lat: f64,
    center_lon: f64,
    radius: f64,
    width: u32,
    height: u32,
) -> BoundingBox {
    // 投影中心点
    let (center_x, center_y) = project_point(center_lon, center_lat);

    // 计算纵横比
    let aspect = width as f64 / height as f64;

    // 使用固定半径，不再根据宽高比调整
    // 这样可以确保所有尺寸的海报都显示相同的地理区域
    // 不同宽高比的画布会在边缘自然裁剪或留白
    let half_x = radius;
    let half_y = radius;

    // 根据宽高比调整边界框，使其适配画布比例
    // 但保持中心区域一致
    let (final_half_x, final_half_y) = if aspect > 1.0 {
        // 横向画布：保持高度，扩展宽度
        (half_y * aspect, half_y)
    } else {
        // 纵向画布：保持宽度，扩展高度
        (half_x, half_x / aspect)
    };

    BoundingBox::new(
        center_x - final_half_x,
        center_x + final_half_x,
        center_y - final_half_y,
        center_y + final_half_y,
    )
}

/// 计算补偿半径（用于数据获取，避免裁切后数据不足）
#[allow(dead_code)]
pub fn calculate_compensated_radius(radius: f64, width: u32, height: u32) -> f64 {
    let max_dim = width.max(height) as f64;
    let min_dim = width.min(height) as f64;
    radius * (max_dim / min_dim) / 4.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_point() {
        // 测试巴黎坐标
        let (x, y) = project_point(2.3522, 48.8566);
        // 大致验证数量级
        assert!(x.abs() > 200000.0 && x.abs() < 300000.0);
        assert!(y.abs() > 6000000.0 && y.abs() < 7000000.0);
    }

    #[test]
    fn test_calculate_bounds() {
        let bounds = calculate_bounds(48.8566, 2.3522, 10000.0, 1200, 1600);
        assert!(bounds.width() > 0.0);
        assert!(bounds.height() > 0.0);
        // 纵向图，宽度应该小于高度
        assert!(bounds.width() < bounds.height());
    }
}
