/* tslint:disable */
/* eslint-disable */

/**
 * 渲染结果
 */
export class RenderResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static error(msg: string): RenderResult;
    get_data(): Uint8Array | undefined;
    get_error(): string | undefined;
    get_height(): number;
    get_width(): number;
    is_success(): boolean;
    static success(width: number, height: number, data: Uint8Array): RenderResult;
}

/**
 * 获取版本信息
 */
export function get_version(): string;

/**
 * 测试函数
 */
export function hello_wasm(name: string): string;

/**
 * 初始化 panic hook
 */
export function init_panic_hook(): void;

export function parse_polygons_to_bin(geojson_str: string): any;

export function parse_polygons_typed(data: Float64Array): any;

export function parse_polygons_val(geojson: any): any;

export function parse_roads_to_bin(geojson_str: string): any;

export function parse_roads_typed(data: Float64Array): any;

export function parse_roads_val(geojson: any): any;

export function process_polygons_bin_wasm(data: Float64Array): Float64Array;

/**
 * 极速处理：接收二进制，在 WASM 内部投影并返回新的二进制（Float64Array）
 */
export function process_roads_bin_wasm(data: Float64Array): Float64Array;

/**
 * 主渲染函数 (JSON 版本)
 */
export function render_map(request_json: string): RenderResult;

/**
 * 主渲染函数 (二进制直读版本)
 */
export function render_map_binary(roads_shards: any, water_bin: Float64Array, parks_bin: Float64Array, config_json: string): RenderResult;

/**
 * 主渲染函数 (带自定义字体版本)
 */
export function render_map_binary_with_font(roads_shards: any, water_bin: Float64Array, parks_bin: Float64Array, config_json: string, font_data: Uint8Array): RenderResult;

/**
 * 主渲染函数 (MessagePack 版本)
 */
export function render_map_msgpack(request_bin: Uint8Array): RenderResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_renderresult_free: (a: number, b: number) => void;
    readonly get_version: (a: number) => void;
    readonly hello_wasm: (a: number, b: number, c: number) => void;
    readonly init_panic_hook: () => void;
    readonly parse_polygons_to_bin: (a: number, b: number, c: number) => void;
    readonly parse_polygons_typed: (a: number, b: number, c: number) => void;
    readonly parse_polygons_val: (a: number, b: number) => void;
    readonly parse_roads_to_bin: (a: number, b: number, c: number) => void;
    readonly parse_roads_typed: (a: number, b: number, c: number) => void;
    readonly parse_roads_val: (a: number, b: number) => void;
    readonly process_polygons_bin_wasm: (a: number, b: number, c: number) => void;
    readonly process_roads_bin_wasm: (a: number, b: number, c: number) => void;
    readonly render_map: (a: number, b: number) => number;
    readonly render_map_binary: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly render_map_binary_with_font: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly render_map_msgpack: (a: number, b: number) => number;
    readonly renderresult_error: (a: number, b: number) => number;
    readonly renderresult_get_data: (a: number, b: number) => void;
    readonly renderresult_get_error: (a: number, b: number) => void;
    readonly renderresult_get_height: (a: number) => number;
    readonly renderresult_get_width: (a: number) => number;
    readonly renderresult_is_success: (a: number) => number;
    readonly renderresult_success: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
