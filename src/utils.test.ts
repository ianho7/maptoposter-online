/**
 * @jest-environment node
 */
import { getCoordinates, fetchGraph, fetchFeatures } from "./utils";
import init from './pkg/wasm'
// import { createCanvas } from "canvas";
// import { writeFileSync } from "node:fs";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runDebug() {
    console.log("🚀 开始简单测试...");

    await init();
    // const mapEngine = new MapEngine();

    try {
        // 1. 测试坐标获取
        console.log("--- 测试 getCoordinates ---");
        const coords = await getCoordinates("San Francisco", "USA");
        console.log("✅ 坐标获取成功:", coords);

        // 2. 测试地图数据获取 (拿个小范围 500米 试试)
        console.log("\n--- 测试 fetchGraph ---");
        const geojson = await fetchGraph([coords.latitude, coords.longitude], 5000);

        if (geojson && geojson.features.length > 0) {
            console.log(geojson);
            console.log(`✅ 街道数据获取成功! 共有 ${geojson.features.length} 条街道数据。`);
        } else {
            console.log("⚠️ 未获取到街道数据，请检查 Overpass API 状态或范围。");
        }

        await sleep(1000);

        // 2. 测试地图数据获取 (拿个小范围 500米 试试)
        console.log("\n--- 测试 fetchGraph ---");
        const water = await fetchFeatures([coords.latitude, coords.longitude], 5000, { "natural": "water", "waterway": "riverbank" }, "water");

        if (water && water.features.length > 0) {
            console.log(water);
            console.log(`✅ 水体数据获取成功! 共有 ${water.features.length} 条水体数据。`);
        } else {
            console.log("⚠️ 未获取到水体数据，请检查 Overpass API 状态或范围。");
        }

        await sleep(1000);

        // 2. 测试地图数据获取 (拿个小范围 500米 试试)
        console.log("\n--- 测试 fetchGraph ---");
        const parks = await fetchFeatures([coords.latitude, coords.longitude], 5000, { "leisure": "park", "landuse": "grass" }, "parks");

        if (parks && parks.features.length > 0) {
            console.log(parks);
            console.log(`✅ 公园数据获取成功! 共有 ${parks.features.length} 条公园数据。`);
        } else {
            console.log("⚠️ 未获取到公园数据，请检查 Overpass API 状态或范围。");
        }

    } catch (error: unknown) {
        console.error("❌ 测试过程中出错:", error);
    }
}

runDebug();

