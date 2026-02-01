// 1. 定义坐标接口
export interface Coordinates {
    latitude: number;
    longitude: number;
}

// 2. 定义 Nominatim 响应结果接口 (仅包含我们需要的字段)
export interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
    [key: string]: unknown; // 允许其他不确定的字段
}

// 定义坐标类型
export type Point = [number, number]; // [lat, lon]