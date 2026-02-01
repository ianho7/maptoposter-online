
import * as fs from 'fs';
import * as path from 'path';
import init, { render_map } from '../wasm/pkg/wasm';

// 测试用的简单 GeoJSON 数据
const MOCK_ROADS = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": { "highway": "primary" },
            "geometry": {
                "type": "LineString",
                "coordinates": [[2.35, 48.85], [2.36, 48.86]]
            }
        },
        {
            "type": "Feature",
            "properties": { "highway": "residential" },
            "geometry": {
                "type": "LineString",
                "coordinates": [[2.355, 48.855], [2.365, 48.855]]
            }
        }
    ]
};

const MOCK_WATER = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": { "natural": "water" },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[2.351, 48.851], [2.352, 48.851], [2.352, 48.852], [2.351, 48.852], [2.351, 48.851]]]
            }
        }
    ]
};

const MOCK_PARKS = {
    "type": "FeatureCollection",
    "features": []
};

const TEST_THEME = {
    bg: "#FDF6E3",
    text: "#657B83",
    gradient_color: "#FDF6E3",
    water: "#268BD2",
    parks: "#859900",
    road_motorway: "#CB4B16",
    road_primary: "#B58900",
    road_secondary: "#93A1A1",
    road_tertiary: "#93A1A1",
    road_residential: "#EEE8D5",
    road_default: "#EEE8D5",
};

async function runLocalTest() {
    console.log("🚀 Starting Local Debug Test (No Network)");

    try {
        const wasmPath = path.resolve(__dirname, '../wasm/pkg/wasm_bg.wasm');
        const wasmBuffer = fs.readFileSync(wasmPath);
        await init(wasmBuffer);
        console.log("✅ WASM Initialized");

        const width = 800;
        const height = 1000;
        const radius = 5000;

        // 使用巴黎坐标
        const lat = 48.8566;
        const lon = 2.3522;

        console.log("\n🎨 Preparing render request...");
        const request = {
            center: { lat, lon },
            radius: radius,
            roads: JSON.stringify(MOCK_ROADS),
            water: JSON.stringify(MOCK_WATER),
            parks: JSON.stringify(MOCK_PARKS),
            theme: TEST_THEME,
            width: width,
            height: height,
            display_city: "Paris (Debug)",
            display_country: "France"
        };

        console.log("⚡ Calling WASM render_map()...");
        const startTime = Date.now();
        const result = render_map(JSON.stringify(request));
        const duration = Date.now() - startTime;
        console.log(`✅ Render finished in ${duration}ms`);

        if (result.is_success()) {
            const pngData = result.get_data();
            if (pngData) {
                const outputPath = path.resolve(__dirname, '../test_local_output.png');
                fs.writeFileSync(outputPath, pngData);
                console.log(`\n💾 Image saved to: ${outputPath}`);
                console.log(`   Size: ${(pngData.length / 1024).toFixed(2)} KB`);
            } else {
                console.error("❌ Success but no data!");
            }
        } else {
            console.error(`❌ Render failed: ${result.get_error()}`);
        }

    } catch (error) {
        console.error("\n❌ Test Failed:", error);
    }
}

runLocalTest();
