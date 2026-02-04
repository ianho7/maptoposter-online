import init, { process_roads_bin_wasm, process_polygons_bin_wasm, render_map_binary, init_panic_hook } from './pkg/wasm';

// Initialize WASM
const wasmPromise = init().then(() => {
    init_panic_hook();
});

declare var self: Worker;

self.onmessage = async (event: MessageEvent) => {
    await wasmPromise;
    const { id, type, data } = event.data;

    try {
        let result;
        const start = performance.now();

        // 执行全链路处理
        if (type === 'roads') {
            result = process_roads_bin_wasm(data as Float64Array);
        } else if (type === 'polygons') {
            result = process_polygons_bin_wasm(data as Float64Array);
        } else if (type === 'pois') {
            // POI 数据已经是最简形式 [poi_count, x1, y1, x2, y2, ...], 直接返回
            result = data as Float64Array;
        } else if (type === 'render') {
            const { roads_shards, water_bin, parks_bin, config_json } = data as any;
            const renderResult = render_map_binary(roads_shards, water_bin, parks_bin, config_json);
            if (renderResult.is_success()) {
                result = renderResult.get_data(); // 返回 Uint8Array
            } else {
                throw new Error(renderResult.get_error());
            }
        } else {
            throw new Error(`Unknown task type: ${type}`);
        }

        const duration = performance.now() - start;

        // 返回结果
        self.postMessage({
            id,
            success: true,
            result,
            duration
        });

    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: String(error)
        });
    }
};
