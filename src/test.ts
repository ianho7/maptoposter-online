import * as fs from 'fs';
import * as path from 'path';
import { render_map_binary, init_panic_hook } from '../wasm/pkg/wasm';
import { getCoordinates, fetchGraph, fetchFeatures, flattenRoadsGeoJSON, flattenPolygonsGeoJSON, shardRoadsBinary } from './utils';

// --- 进度管理辅助 ---
class ProgressTracker {
    private current = 0;
    report(percent: number, message: string) {
        this.current = percent;
        // 在控制台打印带进度的消息，模拟 UI 进度条
        const barLength = 20;
        const filled = Math.round(barLength * (percent / 100));
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        console.log(`[${bar}] ${percent.toFixed(0)}% - ${message}`);
    }
}
const progress = new ProgressTracker();

// 定义测试用的主题
const TEST_THEME = {
    "bg": "#EFEBE0",
    "text": "#2C3E50",
    "gradient_color": "#EFEBE0",
    "water": "#A3C1AD",
    "parks": "#C8D6B9",
    "road_motorway": "#34495E",
    "road_primary": "#5D6D7E",
    "road_secondary": "#7F8C8D",
    "road_tertiary": "#95A5A6",
    "road_residential": "#BDC3C7",
    "road_default": "#D5DBDB"
};

// Worker 任务辅助函数
let taskIdCounter = 0;
function runInWorker(worker: Worker, type: string, data: Float64Array): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = taskIdCounter++;
        const handler = (event: MessageEvent) => {
            if (event.data.id === id) {
                worker.removeEventListener('message', handler);
                if (event.data.success) {
                    resolve(event.data.result);
                } else {
                    reject(new Error(`Worker Protocol Error: ${event.data.error}`));
                }
            }
        };
        const errorHandler = (error: ErrorEvent) => {
            reject(new Error(`Worker Crash: ${error.message}`));
        };
        worker.addEventListener('message', handler);
        worker.addEventListener('error', errorHandler, { once: true });
        worker.postMessage({ id, type, data }, [data.buffer]);
    });
}

async function runIntegrationTest() {
    progress.report(0, "初始化引擎与 Worker 线程池...");

    const numWorkers = 4;
    const workers = Array.from({ length: numWorkers }, () => new Worker(path.resolve(__dirname, 'worker.ts')));

    try {
        init_panic_hook();

        const city = "Tokyo";
        const country = "Japan";
        const radius = 5000;
        const width = 360;
        const height = 480;

        progress.report(5, `正在获取 ${city} 坐标...`);
        const coords = await getCoordinates(city, country);

        progress.report(10, "正在从 OSM 下载地图数据 (此步可能较慢)...");

        // 模拟更细粒度的下载进度（通过 Promise 竞争或计数）
        let fetchCount = 0;
        const trackFetch = (p: Promise<any>) => p.then(res => {
            fetchCount++;
            progress.report(10 + (fetchCount * 15), `已获取第 ${fetchCount}/3 部分地理要素...`);
            return res;
        });

        const [roadsGeoJSON, waterGeoJSON, parksGeoJSON] = await Promise.all([
            trackFetch(fetchGraph([coords.latitude, coords.longitude], radius)),
            trackFetch(fetchFeatures([coords.latitude, coords.longitude], radius, { "natural": "water" }, "water")),
            trackFetch(fetchFeatures([coords.latitude, coords.longitude], radius, { "leisure": "park" }, "parks"))
        ]);

        if (!roadsGeoJSON || !waterGeoJSON || !parksGeoJSON) throw new Error("获取数据失败");

        progress.report(60, "数据扁平化与二进制分片中...");
        const roadsTypedFull = flattenRoadsGeoJSON(roadsGeoJSON);
        const roadShards = shardRoadsBinary(roadsTypedFull, numWorkers);
        const waterTyped = flattenPolygonsGeoJSON(waterGeoJSON);
        const parksTyped = flattenPolygonsGeoJSON(parksGeoJSON);

        progress.report(65, "正在并行计算投影坐标 (Worker Pool)...");

        let processedShardsCount = 0;
        const totalShards = roadShards.length + 2; // 道路分片 + 水体 + 公园
        const updateTaskProgress = () => {
            processedShardsCount++;
            const currentPercent = 65 + (processedShardsCount / totalShards) * 20;
            progress.report(currentPercent, `Worker 已处理完成任务: ${processedShardsCount}/${totalShards}`);
        };

        const roadProcessingPromises = roadShards.map((shard, i) =>
            runInWorker(workers[i % numWorkers], 'roads', shard).then(res => { updateTaskProgress(); return res; })
        );
        const waterPromise = runInWorker(workers[0], 'polygons', waterTyped).then(res => { updateTaskProgress(); return res; });
        const parksPromise = runInWorker(workers[1], 'polygons', parksTyped).then(res => { updateTaskProgress(); return res; });

        const [processedRoadShards, waterBin, parksBin] = await Promise.all([
            Promise.all(roadProcessingPromises),
            waterPromise,
            parksPromise
        ]);

        progress.report(85, "正在执行 WASM 图层渲染 (同步阻塞阶段)...");
        const config = {
            center: { lat: coords.latitude, lon: coords.longitude },
            radius: radius,
            theme: TEST_THEME,
            width: width,
            height: height,
            display_city: city,
            display_country: country,
            text_position: "center"
        };

        // 渲染阶段
        const result = render_map_binary(
            processedRoadShards,
            waterBin,
            parksBin,
            JSON.stringify(config)
        );

        progress.report(95, "正在生成 PNG 图片并写入磁盘...");
        if (result.is_success()) {
            const pngData = result.get_data();
            if (pngData) {
                const outputPath = path.resolve(__dirname, '../test_output.png');
                fs.writeFileSync(outputPath, pngData);
                progress.report(100, `渲染成功！文件已存至: ${outputPath}`);
            }
        } else {
            console.error(`❌ 渲染失败: ${result.get_error()}`);
        }

    } catch (error) {
        console.error("\n❌ 测试异常:", error);
    } finally {
        workers.forEach(w => w.terminate());
    }
}

runIntegrationTest();
