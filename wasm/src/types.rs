use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

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

    /// 获取道路线宽
    pub fn get_width(self) -> f32 {
        match self {
            RoadType::Motorway => 1.2,
            RoadType::Primary => 1.0,
            RoadType::Secondary => 0.8,
            RoadType::Tertiary => 0.6,
            RoadType::Residential | RoadType::Default => 0.4,
        }
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
