use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Python 标准输出的参考高度（12" × 16" @ 300 DPI）
/// 用于计算动态的道路线宽缩放因子
const PYTHON_STANDARD_HEIGHT_PX: f32 = 4800.0;

/// 分辨率缩放因子 - 用于高分辨率输出（如 8x 放大）
/// 当输出分辨率增加 N 倍时，道路线宽也需要相应增加以保持视觉一致性
const RESOLUTION_SCALE: f32 = 8.0;

/// 计算道路线宽的动态缩放因子
///
/// 基于选定的输出尺寸和前端缩放倍数，自动计算出合理的道路线宽缩放因子。
/// 这样可以确保无论前端如何调整缩放比例，道路的相对粗细始终与 Python 版本保持一致。
///
/// # 参数
/// - `selected_size_height`: 选定尺寸的原始高度（像素），例如 A4 Portrait 的 3508
/// - `frontend_scale`: 前端应用的缩放倍数，例如 8
///
/// # 返回值
/// 道路线宽的缩放因子，基于实际输出分辨率与 Python 标准输出的比例
///
/// # 示例
/// ```ignore
/// // 前端已计算：selected_size_height = 3508 * 2 = 7016
/// let scale = calculate_road_width_scale(7016.0, 2.0);
/// // 缩放因子 = 7016 / 4800 = 1.462
/// let width = road_type.get_width_scaled(scale);  // 使用动态缩放
/// ```
pub fn calculate_road_width_scale(selected_size_height: f32, _frontend_scale: f32) -> f32 {
    // selected_size_height 已经包含倍数，直接除以标准高度
    selected_size_height / PYTHON_STANDARD_HEIGHT_PX
}

/// 主题配色方案
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    pub bg: String,
    pub text: String,
    pub gradient_color: String,
    pub water: String,
    pub parks: String,
    pub road_motorway: String,
    pub road_primary: String,
    pub road_secondary: String,
    pub road_tertiary: String,
    pub road_residential: String,
    pub road_default: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextPosition {
    Top,
    Center,
    Bottom,
}

/// 道路类型枚举（对应 Python 的 highway 分类）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoadType {
    Motorway,
    Primary,
    Secondary,
    Tertiary,
    Residential,
    Default,
}

impl RoadType {
    /// 从 OSM highway 标签解析道路类型
    pub fn from_highway(highway: &str) -> Self {
        match highway {
            "motorway" | "motorway_link" => RoadType::Motorway,
            "trunk" | "trunk_link" | "primary" | "primary_link" => RoadType::Primary,
            "secondary" | "secondary_link" => RoadType::Secondary,
            "tertiary" | "tertiary_link" => RoadType::Tertiary,
            "residential" | "living_street" | "unclassified" => RoadType::Residential,
            _ => RoadType::Default,
        }
    }

    pub fn from_u32(val: u32) -> Self {
        match val {
            0 => RoadType::Motorway,
            1 => RoadType::Primary,
            2 => RoadType::Secondary,
            3 => RoadType::Tertiary,
            4 => RoadType::Residential,
            _ => RoadType::Default,
        }
    }

    pub fn to_u32(self) -> u32 {
        match self {
            RoadType::Motorway => 0,
            RoadType::Primary => 1,
            RoadType::Secondary => 2,
            RoadType::Tertiary => 3,
            RoadType::Residential => 4,
            RoadType::Default => 5,
        }
    }

    /// 获取道路线宽（已乘以分辨率缩放因子）
    /// 
    /// 返回值已经考虑了 8x 分辨率放大，确保在高分辨率输出中小道路也能清晰可见
    /// 原始线宽 * RESOLUTION_SCALE:
    /// - Motorway: 1.2 * 8 = 9.6
    /// - Primary: 1.0 * 8 = 8.0
    /// - Secondary: 0.8 * 8 = 6.4
    /// - Tertiary: 0.6 * 8 = 4.8
    /// - Residential/Default: 0.4 * 8 = 3.2
    /// 
    /// 注意：此方法使用固定的 RESOLUTION_SCALE (8.0)，如需动态缩放请使用 get_width_scaled()
    pub fn get_width(self) -> f32 {
        let base_width = match self {
            RoadType::Motorway => 1.2,
            RoadType::Primary => 1.0,
            RoadType::Secondary => 0.8,
            RoadType::Tertiary => 0.6,
            RoadType::Residential | RoadType::Default => 0.4,
        };
        base_width * RESOLUTION_SCALE
    }

    /// 获取道路线宽（使用动态缩放因子）
    ///
    /// 此方法允许传入动态计算的缩放因子，使得当前端改变分辨率倍数时能自动调整线宽。
    /// 这是推荐的方法，特别是当前端的缩放比例不固定时。
    ///
    /// # 参数
    /// - `scale_factor`: 缩放因子，通常由 calculate_road_width_scale() 计算获得
    ///
    /// # 返回值
    /// 基础线宽乘以缩放因子后的结果
    ///
    /// # 示例
    /// ```ignore
    /// let scale = calculate_road_width_scale(3508.0, 8.0);  // 计算缩放因子
    /// let width = RoadType::Primary.get_width_scaled(scale);
    /// ```
    pub fn get_width_scaled(self, scale_factor: f32) -> f32 {
        let base_width = match self {
            RoadType::Motorway => 1.2,
            RoadType::Primary => 1.0,
            RoadType::Secondary => 0.8,
            RoadType::Tertiary => 0.6,
            RoadType::Residential | RoadType::Default => 0.4,
        };
        base_width * scale_factor
    }
}

/// 边界框（投影后的坐标范围）
#[derive(Debug, Clone, Copy)]
pub struct BoundingBox {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

impl BoundingBox {
    pub fn new(min_x: f64, max_x: f64, min_y: f64, max_y: f64) -> Self {
        Self {
            min_x,
            max_x,
            min_y,
            max_y,
        }
    }

    pub fn width(&self) -> f64 {
        self.max_x - self.min_x
    }

    pub fn height(&self) -> f64 {
        self.max_y - self.min_y
    }
}

/// 道路要素
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Road {
    pub coords: Vec<(f64, f64)>,
    pub road_type: RoadType,
}

/// 多边形要素（水体或公园）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolyFeature {
    pub exterior: Vec<(f64, f64)>,
    pub interiors: Vec<Vec<(f64, f64)>>,
}

/// 渲染请求（从 JS 传入）
#[derive(Debug, Deserialize, Serialize)]
pub struct RenderRequest {
    // 地理信息
    pub center: Center,
    pub radius: f64,

    // 预解析的 OSM 数据
    pub roads: Vec<Road>,
    pub water: Vec<PolyFeature>,
    pub parks: Vec<PolyFeature>,

    // 主题配置
    pub theme: Theme,

    // 画布尺寸
    pub width: u32,
    pub height: u32,

    // 文本信息
    pub display_city: String,
    pub display_country: String,
    pub text_position: Option<TextPosition>,

    // 是否需要投影（如果 JS 已经完成了投影则为 false）
    #[serde(default)]
    pub needs_projection: bool,

    // 动态道路线宽缩放相关参数
    // 选定尺寸的原始高度（像素），例如 A4 Portrait 的 3508
    #[serde(default = "default_selected_size_height")]
    pub selected_size_height: u32,
    
    // 前端应用的缩放倍数，例如 8
    #[serde(default = "default_frontend_scale")]
    pub frontend_scale: f32,
}

pub fn default_selected_size_height() -> u32 {
    3508  // A4 Portrait 默认值
}

pub fn default_frontend_scale() -> f32 {
    8.0  // 默认缩放倍数
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Center {
    pub lat: f64,
    pub lon: f64,
}

/// 渲染结果
#[wasm_bindgen]
pub struct RenderResult {
    success: bool,
    width: u32,
    height: u32,
    data: Option<Vec<u8>>,
    error: Option<String>,
}

#[wasm_bindgen]
impl RenderResult {
    pub fn success(width: u32, height: u32, data: Vec<u8>) -> Self {
        Self {
            success: true,
            width,
            height,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(msg: String) -> Self {
        Self {
            success: false,
            width: 0,
            height: 0,
            data: None,
            error: Some(msg),
        }
    }

    pub fn is_success(&self) -> bool {
        self.success
    }

    pub fn get_width(&self) -> u32 {
        self.width
    }

    pub fn get_height(&self) -> u32 {
        self.height
    }

    pub fn get_data(&self) -> Option<Vec<u8>> {
        self.data.clone()
    }

    pub fn get_error(&self) -> Option<String> {
        self.error.clone()
    }
}
