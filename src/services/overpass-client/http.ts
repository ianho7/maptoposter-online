/**
 * HTTP 工具层
 *
 * 对标 OSMnx 的 _http.py：
 *   - _get_http_headers  → buildHeaders
 *   - _parse_response    → parseResponse
 *   - sleep 工具          → sleep
 *   - 日志工具            → log
 */

import { overpassConfig } from "./config";

// ─── 日志 ───────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 } as const;

/**
 * 带级别的日志输出。只有 >= overpassConfig.logLevel 的消息才会打印。
 */
export function log(
  level: "debug" | "info" | "warn" | "error",
  ...args: unknown[]
): void {
  if (LOG_LEVELS[level] >= LOG_LEVELS[overpassConfig.logLevel]) {
    const prefix = `[OverpassClient][${level.toUpperCase()}]`;
    switch (level) {
      case "debug":
        console.debug(prefix, ...args);
        break;
      case "info":
        console.info(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "error":
        console.error(prefix, ...args);
        break;
    }
  }
}

// ─── 错误类型 ────────────────────────────────────────────

/**
 * 当 Overpass 返回的 JSON 包含 remark 或数据不完整时抛出。
 * 对标 OSMnx 的 InsufficientResponseError。
 */
export class OverpassResponseError extends Error {
  public statusCode?: number;

  constructor(
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "OverpassResponseError";
    this.statusCode = statusCode;
  }
}

/**
 * 当 HTTP 状态码非 2xx 且非可重试的 429/504 时抛出。
 * 对标 OSMnx 的 ResponseStatusCodeError。
 */
export class OverpassStatusCodeError extends Error {
  public statusCode: number;

  constructor(
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "OverpassStatusCodeError";
    this.statusCode = statusCode;
  }
}

// ─── HTTP Headers ────────────────────────────────────────

/**
 * 构建符合 Overpass API 使用规范的 HTTP 请求头。
 *
 * 对标 OSMnx/_http.py 的 _get_http_headers()。
 * Overpass 服务器会拒绝空 User-Agent 的请求。
 */
export function buildHeaders(): HeadersInit {
  return {
    "User-Agent": overpassConfig.httpUserAgent,
    Referer: overpassConfig.httpReferer,
    "Accept-Language": overpassConfig.httpAcceptLanguage,
  };
}

// ─── 响应解析 ────────────────────────────────────────────

/**
 * 解析 Overpass API 的 JSON 响应。
 *
 * 对标 OSMnx/_http.py 的 _parse_response()。
 *
 * 关键逻辑：
 * 1. 检查 HTTP 状态码（429/504 由上层处理，此处处理其他非 2xx 错误）
 * 2. 解析 JSON
 * 3. 检查 remark 字段——这是 Overpass 的"伪成功"陷阱：
 *    服务器可能返回 HTTP 200 但 JSON 内包含 remark 说明查询超时/内存溢出，
 *    数据实际上是不完整的。必须抛异常拦截，否则你会得到残缺的地图数据。
 *
 * @returns 干净的 JSON 数据（elements 数组等）
 * @throws {OverpassResponseError} 当数据含 remark 或解析失败时
 * @throws {OverpassStatusCodeError} 当 HTTP 状态码异常时
 */
export async function parseResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const hostname = new URL(response.url).hostname;
  const sizeKb = Number(response.headers.get("content-length") || 0) / 1000;
  log(
    "info",
    `Downloaded ${sizeKb.toFixed(1)}kB from '${hostname}' with status ${response.status}`,
  );

  // 如果状态码不是 2xx（429/504 由上层 overpassRequest 处理，不会到这里）
  if (!response.ok) {
    const text = await response.text().catch(() => "(unreadable)");
    const msg = `'${hostname}' responded: ${response.status} ${response.statusText} ${text}`;
    log("error", msg);
    throw new OverpassStatusCodeError(msg, response.status);
  }

  // 解析 JSON
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch (e) {
    const msg = `Failed to parse JSON from '${hostname}': ${e}`;
    log("error", msg);
    throw new OverpassResponseError(msg, response.status);
  }

  // ★ 关键：检测 remark 字段（Overpass 的"伪成功"）
  // 对标 OSMnx/_http.py L323-L325
  // 常见 remark 内容：
  //   "runtime error: Query timed out in \"query\" at line..."
  //   "runtime error: Query run out of memory in \"query\" at line..."
  if ("remark" in data && typeof data.remark === "string") {
    const msg = `'${hostname}' remarked: '${data.remark}'`;
    log("warn", msg);
    // 注意：含 remark 的数据绝不能缓存，否则会反复返回残缺数据
    throw new OverpassResponseError(
      `Overpass returned incomplete data: ${data.remark}`,
      response.status,
    );
  }

  return data;
}

// ─── 工具函数 ────────────────────────────────────────────

/**
 * Promise 化的延迟函数。
 */
export function sleep(ms: number): Promise<void> {
  log("debug", `Sleeping for ${(ms / 1000).toFixed(1)}s...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从 URL 中提取 hostname。
 */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
