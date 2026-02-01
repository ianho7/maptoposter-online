use crate::projection::project_points;
use crate::types::{PolyFeature, Road, RoadType};
use crate::utils::{time, time_end};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

// --- 极简解析结构 ---

#[derive(Deserialize)]
struct SimpleFC {
    features: Vec<SimpleFeature>,
}

#[derive(Deserialize)]
struct SimpleFeature {
    geometry: SimpleGeometry,
    properties: SimpleProps,
}

#[derive(Deserialize)]
struct SimpleGeometry {
    #[serde(rename = "type")]
    geom_type: String,
    coordinates: serde_json::Value,
}

#[derive(Deserialize)]
struct SimpleProps {
    #[serde(default)]
    highway: serde_json::Value,
}

/// 解析道路 (从 JS 对象)
pub fn parse_roads_js(js_val: JsValue) -> Result<Vec<Road>, String> {
    time("parse_roads_obj: Total");
    let collection: SimpleFC = serde_wasm_bindgen::from_value(js_val)
        .map_err(|e| format!("Fast-path deserialization failed: {}", e))?;

    let mut roads = Vec::with_capacity(collection.features.len());
    for f in collection.features {
        let highway = match f.properties.highway {
            serde_json::Value::String(s) => s,
            serde_json::Value::Array(a) => a
                .get(0)
                .and_then(|v| v.as_str())
                .unwrap_or("unclassified")
                .to_string(),
            _ => "unclassified".to_string(),
        };
        if f.geometry.geom_type == "LineString" {
            if let Some(coords) = parse_coords_val(&f.geometry.coordinates) {
                roads.push(Road {
                    coords: project_points(&coords),
                    road_type: RoadType::from_highway(&highway),
                });
            }
        } else if f.geometry.geom_type == "MultiLineString" {
            if let Some(lines) = f.geometry.coordinates.as_array() {
                if let Some(first) = lines.get(0) {
                    if let Some(coords) = parse_coords_val(first) {
                        roads.push(Road {
                            coords: project_points(&coords),
                            road_type: RoadType::from_highway(&highway),
                        });
                    }
                }
            }
        }
    }
    time_end("parse_roads_obj: Total");
    Ok(roads)
}

/// 解析道路 (从二进制 TypedArray)
pub fn parse_roads_bin(data: &[f64]) -> Result<Vec<Road>, String> {
    time("parse_roads_bin: Total");
    if data.is_empty() {
        return Ok(vec![]);
    }

    let road_count = data[0] as usize;
    let mut roads = Vec::with_capacity(road_count);
    let mut offset = 1;

    for _ in 0..road_count {
        if offset + 2 > data.len() {
            break;
        }
        let type_val = data[offset] as u32;
        let point_count = data[offset + 1] as usize;
        offset += 2;

        if offset + point_count * 2 > data.len() {
            break;
        }
        let mut coords = Vec::with_capacity(point_count);
        for _ in 0..point_count {
            coords.push((data[offset], data[offset + 1]));
            offset += 2;
        }

        roads.push(Road {
            coords: project_points(&coords),
            road_type: RoadType::from_u32(type_val),
        });
    }
    time_end("parse_roads_bin: Total");
    Ok(roads)
}

/// 解析多边形 (从二进制 TypedArray)
pub fn parse_polygons_bin(data: &[f64]) -> Result<Vec<PolyFeature>, String> {
    time("parse_polygons_bin: Total");
    if data.is_empty() {
        return Ok(vec![]);
    }

    let poly_count = data[0] as usize;
    let mut polys = Vec::with_capacity(poly_count);
    let mut offset = 1;

    for _ in 0..poly_count {
        if offset + 2 > data.len() {
            break;
        }
        let exterior_count = data[offset] as usize;
        let interior_ring_count = data[offset + 1] as usize;
        offset += 2;

        // Exterior
        if offset + exterior_count * 2 > data.len() {
            break;
        }
        let mut exterior = Vec::with_capacity(exterior_count);
        for _ in 0..exterior_count {
            exterior.push((data[offset], data[offset + 1]));
            offset += 2;
        }

        // Interiors
        let mut interiors = Vec::with_capacity(interior_ring_count);
        for _ in 0..interior_ring_count {
            if offset + 1 > data.len() {
                break;
            }
            let ring_point_count = data[offset] as usize;
            offset += 1;

            if offset + ring_point_count * 2 > data.len() {
                break;
            }
            let mut ring = Vec::with_capacity(ring_point_count);
            for _ in 0..ring_point_count {
                ring.push((data[offset], data[offset + 1]));
                offset += 2;
            }
            interiors.push(project_points(&ring));
        }

        polys.push(PolyFeature {
            exterior: project_points(&exterior),
            interiors,
        });
    }
    time_end("parse_polygons_bin: Total");
    Ok(polys)
}

fn parse_coords_val(val: &serde_json::Value) -> Option<Vec<(f64, f64)>> {
    let arr = val.as_array()?;
    let mut coords = Vec::with_capacity(arr.len());
    for p in arr {
        let pair = p.as_array()?;
        if pair.len() >= 2 {
            coords.push((pair[0].as_f64()?, pair[1].as_f64()?));
        }
    }
    Some(coords)
}

pub fn parse_polygons_js(js_val: JsValue) -> Result<Vec<PolyFeature>, String> {
    let collection: SimpleFC = serde_wasm_bindgen::from_value(js_val).map_err(|e| e.to_string())?;
    let mut polys = Vec::with_capacity(collection.features.len());
    for f in collection.features {
        if f.geometry.geom_type == "Polygon" {
            if let Some(rings) = f.geometry.coordinates.as_array() {
                if !rings.is_empty() {
                    if let Some(exterior) = parse_coords_val(&rings[0]) {
                        let mut interiors = Vec::new();
                        for i in 1..rings.len() {
                            if let Some(ring) = parse_coords_val(&rings[i]) {
                                interiors.push(project_points(&ring));
                            }
                        }
                        polys.push(PolyFeature {
                            exterior: project_points(&exterior),
                            interiors,
                        });
                    }
                }
            }
        }
    }
    Ok(polys)
}

pub fn parse_roads(_: &str) -> Result<Vec<Road>, String> {
    Ok(vec![])
}
pub fn parse_polygons(_: &str) -> Result<Vec<PolyFeature>, String> {
    Ok(vec![])
}
