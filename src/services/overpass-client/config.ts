/**
 * Overpass API 客户端全局配置
 *
 * 对标 OSMnx 的 settings.py
 * 所有配置项均可在运行时动态修改：
 *   import { overpassConfig } from './config';
 *   overpassConfig.overpassUrl = "https://overpass.openstreetmap.fr/api";
 */

export const overpassConfig = {
  /**
   * Overpass API 基础 URL（不含 /interpreter 后缀）。
   *
   * 默认使用单节点镜像，避免负载均衡导致槽位状态不一致。
   * 可切换为：
   *   - "https://overpass-api.de/api"（官方，多节点负载均衡）
   *   - "https://overpass.openstreetmap.fr/api"（法国镜像）
   */
  // overpassUrl: "https://overpass.kumi.systems/api",
  overpassUrl: "https://overpass-api.de/api",

  /**
   * 单次查询允许的最大区域面积（平方米）。
   * 超出此面积的多边形将被自动切割为子块逐一请求。
   * 默认 2,500,000,000 平方米（约 50km × 50km）。
   */
  maxQueryAreaSize: 2_500_000_000,

  /**
   * HTTP 请求超时时间（毫秒），同时也作为 Overpass QL 的 [timeout] 值（秒）。
   * 默认 180 秒。
   */
  requestsTimeout: 180_000,

  /**
   * 向 Overpass 服务器声明的内存配额（字节）。
   * null 表示使用服务器默认值。设置过高可能被拒绝，设置合理可避免 remark 错误。
   */
  overpassMemory: null as number | null,

  /**
   * 是否在请求前检查 /status 接口进行槽位避让。
   * 如果你使用的是自建 Overpass 实例且无限流，可设为 false。
   */
  overpassRateLimit: true,

  /**
   * HTTP User-Agent 头。Overpass 服务器会拒绝空 UA 或常见爬虫 UA 的请求。
   */
  httpUserAgent: "OverpassClient/1.0 (https://github.com/user/project)",

  /**
   * HTTP Referer 头。
   */
  httpReferer: "",

  /**
   * HTTP Accept-Language 头。
   */
  httpAcceptLanguage: "en",

  /**
   * Overpass QL 查询头部模板。{timeout} 和 {maxsize} 会被自动替换。
   */
  overpassSettings: "[out:json][timeout:{timeout}]{maxsize}",

  /**
   * 日志级别："debug" | "info" | "warn" | "error" | "silent"
   */
  logLevel: "info" as "debug" | "info" | "warn" | "error" | "silent",
};

export type OverpassConfig = typeof overpassConfig;

// ─── 多服务器 Race 功能配置 ─────────────────────────────

/**
 * 【功能开关】是否启用多服务器 Race 模式
 *
 * - true:  启用多服务器 race（并发查询多个服务器的 /status）
 * - false: 禁用，沿用原有单服务器逻辑（默认）
 *
 * 当关闭时，所有行为与修改前完全一致，保证老逻辑可用。
 */
export const OVERPASS_RACE_ENABLED = true;

/**
 * 【Race 配置】用于多服务器 race 模式的 Overpass API 服务器列表
 *
 * 包含多个公共 Overpass 镜像，当 OVERPASS_RACE_ENABLED = true 时，
 * 会并发向这些服务器发起 /status 请求，选取最快返回"有槽可用"的服务器。
 *
 * 注意：需与 utils.ts 中的 OVERPASS_SERVERS 列表保持同步。
 */
export const OVERPASS_RACE_SERVERS: string[] = [
  "https://overpass-api.de/api",
  "https://overpass.kumi.systems/api",
  "https://lz4.overpass-api.de/api",
  "https://z.overpass-api.de/api",
];
