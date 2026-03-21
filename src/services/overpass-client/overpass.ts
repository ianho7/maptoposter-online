/**
 * Overpass API 请求核心模块
 *
 * 对标 OSMnx 的 _overpass.py，实现完整的请求闭环：
 *   槽位检查 → 限流等待 → POST 请求 → 错误重试 → Remark 校验 → 返回数据
 *
 * 这是整个库中最核心的文件。
 */

import { overpassConfig, OVERPASS_RACE_ENABLED, OVERPASS_RACE_SERVERS } from "./config";
import {
  buildHeaders,
  hostnameFromUrl,
  log,
  OverpassResponseError,
  parseResponse,
  sleep,
} from "./http";

// ─── Overpass QL 设置字符串 ──────────────────────────────

/**
 * 生成 Overpass QL 查询头部的 settings 字符串。
 *
 * 对标 OSMnx/_overpass.py 的 _make_overpass_settings() (L236-L247)
 *
 * 将 overpassConfig.overpassSettings 中的占位符替换为实际值：
 *   {timeout} → requestsTimeout 转换为秒
 *   {maxsize} → 若 overpassMemory 非空则生成 [maxsize:N]，否则为空
 *
 * @returns 形如 "[out:json][timeout:180][maxsize:1073741824]" 的字符串
 */
export function makeOverpassSettings(): string {
  const timeoutSeconds = Math.round(overpassConfig.requestsTimeout / 1000);
  const maxsize =
    overpassConfig.overpassMemory !== null ? `[maxsize:${overpassConfig.overpassMemory}]` : "";
  return overpassConfig.overpassSettings
    .replace("{timeout}", String(timeoutSeconds))
    .replace("{maxsize}", maxsize);
}

// ─── 槽位管理 ────────────────────────────────────────────

/**
 * 查询 Overpass 服务器 /status 接口，计算需要等待的秒数。
 *
 * 对标 OSMnx/_overpass.py 的 _get_overpass_pause() (L145-L233)
 *
 * Overpass 服务器的 /status 接口返回的是纯文本（非 JSON），典型格式如下：
 *
 * ```
 * Connected as: 1234567890                       ← 第 1 行：连接 ID
 * Current time: 2026-03-12T21:00:00Z             ← 第 2 行：服务器当前 UTC 时间
 * Rate limit: 2                                  ← 第 3 行：你的速率限制
 * 2 slots available now.                         ← 第 4 行：可用槽位数（关键行）
 * Currently running queries (pid, start time):   ← 第 5 行起：正在运行的查询列表
 * ```
 *
 * 解析规则（按第 4 行，即 index=3 的首个 token 判断）：
 *
 * 1. **首 token 是数字**（如 "2"）：
 *    有空闲槽位，返回 pause = 0，立即执行。
 *
 * 2. **首 token 是 "Slot"**（如 "Slot available after: 2026-03-12T21:30:00Z, in 25 seconds."）：
 *    所有槽位被占用。提取 UTC 时间戳，计算与当前时间的差值。
 *    返回 max(差值秒数, 1) 作为等待时间。
 *
 * 3. **首 token 是 "Currently"**（如 "Currently running queries..."）：
 *    之前的查询仍在执行中。等待 recursionPause 秒后递归再次检查。
 *
 * 4. **其他情况**（无法解析、网络异常等）：
 *    保守地返回 defaultPause 秒。
 *
 * @param baseEndpoint Overpass API 基础 URL
 * @param recursionPause 递归检查的间隔秒数，默认 5
 * @param defaultPause 异常情况下的默认等待秒数，默认 60
 * @returns 需要等待的毫秒数
 */
export async function getOverpassPause(
  baseEndpoint: string,
  recursionPause = 5,
  defaultPause = 60
): Promise<number> {
  // 如果用户禁用了限流检查，直接返回 0
  if (!overpassConfig.overpassRateLimit) {
    return 0;
  }

  const statusUrl = baseEndpoint.replace(/\/+$/, "") + "/status";
  let responseText: string;

  // 步骤 1：请求 /status 接口
  try {
    const response = await fetch(statusUrl, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(overpassConfig.requestsTimeout),
    });
    responseText = await response.text();
  } catch (e) {
    // 无法连接到状态接口：保守等待
    log("error", `Unable to reach ${statusUrl}: ${e}`);
    return defaultPause * 1000;
  }

  // 步骤 2：解析文本内容
  // 对标 OSMnx/_overpass.py L196-L231
  try {
    const lines = responseText.split("\n");
    // 关键行的位置可能因服务器版本而异，通常是第 4 行（index 3）
    // 我们搜索包含 "available" 或 "Slot" 或 "Currently" 的行
    let statusLine = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // 跳过前面的元信息行
      if (
        trimmed.startsWith("Connected") ||
        trimmed.startsWith("Current time") ||
        trimmed.startsWith("Rate limit") ||
        trimmed.startsWith("Announced endpoint")
      ) {
        continue;
      }
      statusLine = trimmed;
      break;
    }

    if (!statusLine) {
      log("warn", `Empty status from '${hostnameFromUrl(statusUrl)}'`);
      return defaultPause * 1000;
    }

    const firstToken = statusLine.split(" ")[0];

    // 情况 1：首 token 是数字 → 有空闲槽位
    const slotCount = parseInt(firstToken, 10);
    if (!isNaN(slotCount)) {
      log("info", `[Status] ${slotCount} slot(s) available - proceeding with request`);
      return 0;
    }

    // 情况 2：首 token 是 "Slot" → 被锁定，需等待至指定时间
    if (firstToken === "Slot") {
      // 格式示例: "Slot available after: 2026-03-12T21:30:00Z, in 25 seconds."
      const match = statusLine.match(/after:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
      if (match) {
        const targetTime = new Date(match[1]).getTime();
        const now = Date.now();
        const diffMs = Math.max(targetTime - now, 1000);
        log(
          "info",
          `[Status] Slot locked by another client, waiting ${(diffMs / 1000).toFixed(0)}s until ${match[1]}`
        );
        return diffMs;
      }

      // 如果无法解析时间戳，尝试提取 "in X seconds"
      const secMatch = statusLine.match(/in\s+(\d+)\s+seconds/);
      if (secMatch) {
        const waitSec = Math.max(parseInt(secMatch[1], 10), 1);
        log("info", `Slot locked, waiting ${waitSec}s (parsed from text)`);
        return waitSec * 1000;
      }

      log("warn", `Cannot parse slot time from: '${statusLine}'`);
      return defaultPause * 1000;
    }

    // 情况 3：首 token 是 "Currently" → 正在运行查询，递归等待
    if (firstToken === "Currently") {
      // 统计正在运行的查询数量
      const runningCount = (statusLine.match(/^\d+/g) || []).length;
      log(
        "info",
        `[Status] Server has ${runningCount} running query(ies), waiting ${recursionPause}s before retry...`
      );
      await sleep(recursionPause * 1000);
      return getOverpassPause(baseEndpoint, recursionPause, defaultPause);
    }

    // 情况 4：无法识别 → 保守等待
    log("warn", `Unrecognized server status: '${statusLine}'`);
    return defaultPause * 1000;
  } catch (e) {
    log("error", `Failed to parse status response: ${e}`);
    return defaultPause * 1000;
  }
}

// ─── 多服务器 Race 功能 ─────────────────────────────────

// 官方 Overpass API 地址（优先使用）
const OFFICIAL_OVERPASS_URL = "https://overpass-api.de/api";

/**
 * 【Race 功能】并发查询多个服务器的 /status，返回最快"有可用槽位"的服务器
 *
 * 核心策略（按优先级）：
 * 1. 优先返回 pauseMs=0 的服务器（有槽可用）
 * 2. 若多个服务器都有槽（pauseMs=0），优先选择官方接口
 * 3. 若没有有槽的服务器，选择 pauseMs 最小的
 * 4. 若所有服务器都失败/超时，使用官方接口
 *
 * 特性：
 * - status 请求不重试，只请求一次
 * - 每个请求有 3 秒超时
 *
 * @param servers        服务器 URL 列表
 * @returns              { url: 获胜服务器URL, pauseMs: 需要等待的毫秒数 }
 */
export async function raceForAvailableSlot(
  servers: string[]
): Promise<{ url: string; pauseMs: number }> {
  const STATUS_TIMEOUT_MS = 3000; // 3 秒超时

  // 步骤1：构造所有服务器的 /status 请求 Promise（不重试，只请求一次）
  const statusPromises = servers.map(async (baseUrl) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

    try {
      const statusUrl = baseUrl.replace(/\/+$/, "") + "/status";
      const response = await fetch(statusUrl, {
        headers: buildHeaders(),
        signal: controller.signal as AbortSignal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { url: baseUrl, pauseMs: Infinity, succeeded: false };
      }

      const responseText = await response.text();
      const pauseMs = parseStatusOnce(responseText); // 不重试的解析

      return { url: baseUrl, pauseMs, succeeded: true };
    } catch (e) {
      clearTimeout(timeout);
      return { url: baseUrl, pauseMs: Infinity, succeeded: false, error: e };
    }
  });

  // 步骤2：并发执行所有请求，收集结果
  const results = await Promise.all(statusPromises);

  // 步骤3：筛选成功的服务器
  const succeeded = results.filter((r) => r.succeeded && r.pauseMs < Infinity);

  if (succeeded.length === 0) {
    // 所有服务器都失败，使用官方接口
    log(
      "warn",
      `[Overpass Race] All servers failed, falling back to official: ${OFFICIAL_OVERPASS_URL}`
    );
    return { url: OFFICIAL_OVERPASS_URL, pauseMs: 0 };
  }

  // 步骤4：分类
  // 有槽的（pauseMs=0）和需要等的（pauseMs>0）
  const withSlots = succeeded.filter((r) => r.pauseMs === 0);
  const waiting = succeeded.filter((r) => r.pauseMs > 0).sort((a, b) => a.pauseMs - b.pauseMs);

  let winner: { url: string; pauseMs: number };

  if (withSlots.length > 0) {
    // 多个有槽？优先官方接口
    const officialWinner = withSlots.find((r) => r.url === OFFICIAL_OVERPASS_URL);
    winner = officialWinner || withSlots[0];
    log("info", `[Overpass Race] Winner (has slots): ${winner.url} (pauseMs=${winner.pauseMs})`);
  } else {
    // 没有有槽的，选等待时间最短的
    winner = waiting[0];
    log(
      "info",
      `[Overpass Race] Winner (shortest wait): ${winner.url} (pauseMs=${winner.pauseMs})`
    );
  }

  return { url: winner.url, pauseMs: winner.pauseMs };
}

/**
 * 解析 /status 响应文本（单次，不重试）
 *
 * @param responseText /status 返回的纯文本
 * @returns pauseMs: 0 表示有槽可用，>0 表示需要等待的毫秒数
 */
function parseStatusOnce(responseText: string): number {
  try {
    const lines = responseText.split("\n");
    let statusLine = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (
        trimmed.startsWith("Connected") ||
        trimmed.startsWith("Current time") ||
        trimmed.startsWith("Rate limit") ||
        trimmed.startsWith("Announced endpoint")
      ) {
        continue;
      }
      statusLine = trimmed;
      break;
    }

    if (!statusLine) {
      return Infinity;
    }

    const firstToken = statusLine.split(" ")[0];

    // 有槽可用
    const slotCount = parseInt(firstToken, 10);
    if (!isNaN(slotCount) && slotCount >= 1) {
      return 0;
    }

    // 需要等待到指定时间
    if (firstToken === "Slot") {
      const match = statusLine.match(/in\s+(\d+)\s+seconds/);
      if (match) {
        return Math.max(parseInt(match[1], 10) * 1000, 1000);
      }
      return Infinity;
    }

    // 正在运行/无明确信息
    return Infinity;
  } catch (e) {
    return Infinity;
  }
}

// ─── 请求闭环 ────────────────────────────────────────────

/**
 * 进度回调类型
 */
export type OverpassProgressCallback = (
  progress: number,
  step: string,
  currentBlock?: number,
  totalBlocks?: number,
  secondsRemaining?: number
) => void;

/**
 * 向 Overpass API 发送请求并返回 JSON 数据。
 *
 * 对标 OSMnx/_overpass.py 的 _overpass_request() (L435-L493)
 *
 * 【包装入口】根据 OVERPASS_RACE_ENABLED 开关选择老/新方案：
 *
 * - OVERPASS_RACE_ENABLED = false（默认）：调用原有 _overpassRequestInternal，保持完全一致的行为
 * - OVERPASS_RACE_ENABLED = true：新逻辑，race 多服务器找最快有槽的
 *
 * @param query Overpass QL 查询字符串（完整的，包含 settings 头）
 * @param maxRetries 最大重试次数，防止无限递归。默认 5。
 * @param onProgress 进度回调函数，用于在等待/重试时更新进度
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选）
 * @returns Overpass API 返回的 JSON 数据
 * @throws {OverpassResponseError} 数据不完整或含 remark
 * @throws {OverpassStatusCodeError} HTTP 状态码错误
 */
export async function overpassRequest(
  query: string,
  maxRetries = 5,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<Record<string, unknown>> {
  // 方案A（老逻辑）：关闭开关时，完全沿用原逻辑
  if (!OVERPASS_RACE_ENABLED) {
    return _overpassRequestInternal(query, maxRetries, 0, onProgress, preFetchedPauseMs);
  }

  // 方案B（新逻辑）：多服务器 race
  return _overpassRequestWithRace(query, maxRetries, 0, onProgress, preFetchedPauseMs);
}

async function _overpassRequestInternal(
  query: string,
  maxRetries: number,
  attempt: number,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<Record<string, unknown>> {
  const baseUrl = overpassConfig.overpassUrl.replace(/\/+$/, "");
  const interpreterUrl = `${baseUrl}/interpreter`;
  const hostname = hostnameFromUrl(interpreterUrl);

  // ── 步骤 1：槽位检查与等待 ──
  // 对标 OSMnx/_overpass.py L460-L464
  // 如果传入了预获取的等待时间，直接使用；否则调用 API 获取
  let pauseMs: number;
  if (preFetchedPauseMs !== undefined) {
    pauseMs = preFetchedPauseMs;
    log("info", `[overpassRequest] Using pre-fetched pause: ${pauseMs}ms`);
  } else {
    log("info", `[overpassRequest] No pre-fetched pause, calling getOverpassPause...`);
    pauseMs = await getOverpassPause(baseUrl);
  }
  if (pauseMs > 0) {
    log("info", `Pausing ${(pauseMs / 1000).toFixed(1)}s before POST to '${hostname}'`);
    // 在等待期间每秒更新倒计时
    if (onProgress) {
      let remaining = Math.ceil(pauseMs / 1000);
      while (remaining > 0) {
        onProgress(0, "waiting_slot", undefined, undefined, remaining);
        await new Promise((r) => setTimeout(r, 1000));
        remaining--;
      }
      // 等待结束，通知恢复原来的步骤
      onProgress(0, "waiting_slot_complete");
    } else {
      await sleep(pauseMs);
    }
  }

  // ── 步骤 2：发起 POST 请求 ──
  // 对标 OSMnx/_overpass.py L466-L475
  // Overpass API 接受 application/x-www-form-urlencoded 格式的 POST body
  log("info", `POST ${interpreterUrl} (attempt ${attempt + 1}/${maxRetries})`);

  let response: Response;
  try {
    response = await fetch(interpreterUrl, {
      method: "POST",
      headers: {
        ...buildHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(overpassConfig.requestsTimeout),
    });
  } catch (e) {
    // 网络层错误（DNS 失败、超时等）
    if (attempt < maxRetries - 1) {
      const errorPause = 10_000;
      log("warn", `Network error: ${e}. Retrying in 10s...`);
      // 调用进度回调，显示重试等待
      if (onProgress) {
        let remaining = 10;
        while (remaining > 0) {
          onProgress(0, "retrying_error", undefined, undefined, remaining);
          await new Promise((r) => setTimeout(r, 1000));
          remaining--;
        }
        // 倒计时结束，通知开始新请求
        onProgress(0, "retrying_complete");
      } else {
        await sleep(errorPause);
      }
      return _overpassRequestInternal(query, maxRetries, attempt + 1, onProgress);
    }
    throw new OverpassResponseError(`Network error after ${maxRetries} attempts: ${e}`);
  }

  // ── 步骤 3：处理 429/504 错误码 ──
  // 对标 OSMnx/_overpass.py L478-L486
  // 429 = 请求过多（槽位检查可能失效或被跳过）
  // 504 = 网关超时（服务器处理时间过长）
  // 两种情况都执行 55 秒强制冷却后递归重试
  if (response.status === 429 || response.status === 504) {
    if (attempt < maxRetries - 1) {
      const errorPause = 10_000;
      log(
        "warn",
        `'${hostname}' responded ${response.status} ${response.statusText}: ` +
        `retrying in ${errorPause / 1000}s (attempt ${attempt + 1}/${maxRetries})`
      );
      // 调用进度回调，显示重试等待
      if (onProgress) {
        let remaining = 10;
        while (remaining > 0) {
          onProgress(0, "retrying_error", undefined, undefined, remaining);
          await new Promise((r) => setTimeout(r, 1000));
          remaining--;
        }
        // 倒计时结束，通知开始新请求
        onProgress(0, "retrying_complete");
      } else {
        await sleep(errorPause);
      }
      return _overpassRequestInternal(query, maxRetries, attempt + 1, onProgress);
    }
    throw new OverpassResponseError(
      `Server returned ${response.status} after ${maxRetries} attempts`,
      response.status
    );
  }

  // ── 步骤 4：解析响应 + Remark 校验 ──
  // 对标 OSMnx/_http.py L291-L332
  const data = await parseResponse(response);

  log("info", `Successfully received data from '${hostname}'`);
  return data;
}

// ─── 多服务器 Race 模式的请求实现 ───────────────────────

/**
 * 【新逻辑】使用多服务器 race 的方式发起 Overpass 请求
 *
 * 流程：
 * 1. 若有 preFetchedPauseMs（预计算的等待时间），跳过 race，直接请求
 * 2. 否则，race 多服务器的 /status，选取最快有槽的
 * 3. 等待（如需要）后发起数据请求
 * 4. 若请求失败（429/504），触发单服务器回退重试（回退到单服务器模式）
 *
 * @param query        Overpass QL 查询字符串
 * @param maxRetries   最大重试次数
 * @param attempt      当前尝试次数
 * @param onProgress   进度回调函数
 * @param preFetchedPauseMs 预计算的等待时间（如有）
 */
async function _overpassRequestWithRace(
  query: string,
  maxRetries: number,
  attempt: number,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<Record<string, unknown>> {
  const servers = OVERPASS_RACE_SERVERS;
  const hostname = hostnameFromUrl(servers[0]); // 用于日志

  // ── 步骤 1：槽位检查（Race 模式） ──
  let pauseMs: number;
  let selectedServer: string;

  if (preFetchedPauseMs !== undefined) {
    // 外部已预计算 pause（如分块请求的第一块），跳过 race
    pauseMs = preFetchedPauseMs;
    selectedServer = overpassConfig.overpassUrl.replace(/\/+$/, "");
    log("info", `[Race] Using pre-fetched pause: ${pauseMs}ms on ${selectedServer}`);
  } else {
    // 【核心新逻辑】race 多服务器找可用槽
    log("info", `[Race] Racing ${servers.length} servers for available slot...`);
    const result = await raceForAvailableSlot(servers);
    pauseMs = result.pauseMs;
    selectedServer = result.url;
    log("info", `[Race] Selected server: ${selectedServer}, pauseMs=${pauseMs}`);
  }

  // ── 步骤 2：等待（如需要） ──
  if (pauseMs > 0) {
    log("info", `Racing: Pausing ${(pauseMs / 1000).toFixed(1)}s before POST to '${hostname}'`);
    if (onProgress) {
      let remaining = Math.ceil(pauseMs / 1000);
      while (remaining > 0) {
        onProgress(0, "waiting_slot", undefined, undefined, remaining);
        await new Promise((r) => setTimeout(r, 1000));
        remaining--;
      }
      onProgress(0, "waiting_slot_complete");
    } else {
      await sleep(pauseMs);
    }
  }

  // ── 步骤 3：发起 POST 请求（单服务器模式） ──
  // 注意：race 只是选服务器，实际请求还是单服务器的逻辑
  const interpreterUrl = `${selectedServer}/interpreter`;
  log("info", `Race: POST ${interpreterUrl} (attempt ${attempt + 1}/${maxRetries})`);

  let response: Response;
  try {
    response = await fetch(interpreterUrl, {
      method: "POST",
      headers: {
        ...buildHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(overpassConfig.requestsTimeout),
    });
  } catch (e) {
    // 网络层错误：回退到单服务器重试
    if (attempt < maxRetries - 1) {
      const errorPause = 10_000;
      log(
        "warn",
        `Race: Network error: ${e}. Retrying in ${errorPause / 1000}s (attempt ${attempt + 1}/${maxRetries})`
      );
      if (onProgress) {
        let remaining = 10;
        while (remaining > 0) {
          onProgress(0, "retrying_error", undefined, undefined, remaining);
          await new Promise((r) => setTimeout(r, 1000));
          remaining--;
        }
        onProgress(0, "retrying_complete");
      } else {
        await sleep(errorPause);
      }
      return _overpassRequestWithRace(query, maxRetries, attempt + 1, onProgress);
    }
    throw new OverpassResponseError(`Network error after ${maxRetries} attempts: ${e}`);
  }

  // ── 步骤 4：处理 429/504 错误码（回退到单服务器模式） ──
  if (response.status === 429 || response.status === 504) {
    if (attempt < maxRetries - 1) {
      const errorPause = 10_000;
      log(
        "warn",
        `Race: '${hostname}' responded ${response.status} ${response.statusText}: ` +
        `retrying in ${errorPause / 1000}s (attempt ${attempt + 1}/${maxRetries})`
      );
      if (onProgress) {
        let remaining = 10;
        console.log(`[Overpass] Race 504 retrying_error callback starting, onProgress is defined`);
        while (remaining > 0) {
          console.log(`[Overpass] calling onProgress with retrying_error, remaining=${remaining}`);
          onProgress(0, "retrying_error", undefined, undefined, remaining);
          await new Promise((r) => setTimeout(r, 1000));
          remaining--;
        }
        console.log(`[Overpass] retrying_error countdown complete, calling retrying_complete`);
        onProgress(0, "retrying_complete");
      } else {
        await sleep(errorPause);
      }
      // 回退到单服务器模式（使用原 _overpassRequestInternal）
      return _overpassRequestInternal(query, maxRetries, attempt + 1, onProgress);
    }
    throw new OverpassResponseError(
      `Server returned ${response.status} after ${maxRetries} attempts`,
      response.status
    );
  }

  // ── 步骤 5：解析响应 + Remark 校验 ──
  const data = await parseResponse(response);
  log("info", `Race: Successfully received data from '${hostname}'`);
  return data;
}

// ─── 便捷方法：构造并执行网络查询 ────────────────────────

/**
 * 构造一个针对多边形区域的 Overpass 网络查询并执行。
 *
 * 对标 OSMnx/_overpass.py 的 _download_overpass_network() (L357-L402)
 *
 * @param polygonCoordStrs 多边形坐标串数组（由 geo.ts 的 makeOverpassPolygonCoordStrs 生成）
 * @param wayFilter Overpass 的 way 过滤器字符串，如 '["highway"]["area"!~"yes"]'
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 * @returns 所有子块请求的合并结果
 */
export async function downloadOverpassNetwork(
  polygonCoordStrs: string[],
  wayFilter: string,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<Record<string, unknown>[]> {
  const overpassSettings = makeOverpassSettings();
  const results: Record<string, unknown>[] = [];

  log("info", `Requesting data from API in ${polygonCoordStrs.length} request(s)`);

  // 逐个子块发送请求（不能并发，否则会触发槽位限制）
  for (let i = 0; i < polygonCoordStrs.length; i++) {
    const coordStr = polygonCoordStrs[i];
    const query = `${overpassSettings};(way${wayFilter}(poly:"${coordStr}");>;);out;`;

    log("info", `Sub-request ${i + 1}/${polygonCoordStrs.length}`);
    // 创建带进度上下文的回调
    const progressCallback = onProgress
      ? (progress: number, step: string, seconds?: number) =>
        onProgress(progress, step, i + 1, polygonCoordStrs.length, seconds)
      : undefined;
    // 仅在第一个请求时传入预获取的等待时间，后续请求由于rate limit会自动等待
    const pauseForThisRequest = i === 0 ? preFetchedPauseMs : undefined;
    const result = await overpassRequest(query, 5, progressCallback, pauseForThisRequest);
    results.push(result);
  }

  return results;
}

/**
 * 构造一个针对多边形区域按 tags 查询 features 的 Overpass 请求并执行。
 *
 * 对标 OSMnx/_overpass.py 的 _download_overpass_features() (L405-L432)
 *
 * @param polygonCoordStrs 多边形坐标串数组
 * @param tags 标签过滤器，如 { building: true } 或 { amenity: ["restaurant", "cafe"] }
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 * @returns 所有子块请求的合并结果
 */
export async function downloadOverpassFeatures(
  polygonCoordStrs: string[],
  tags: Record<string, boolean | string | string[]>,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<Record<string, unknown>[]> {
  const overpassSettings = makeOverpassSettings();
  const results: Record<string, unknown>[] = [];

  log("info", `Requesting features from API in ${polygonCoordStrs.length} request(s)`);

  for (let i = 0; i < polygonCoordStrs.length; i++) {
    const coordStr = polygonCoordStrs[i];
    const query = buildFeaturesQuery(overpassSettings, coordStr, tags);

    log("info", `Sub-request ${i + 1}/${polygonCoordStrs.length}`);
    // 创建带进度上下文的回调
    const progressCallback = onProgress
      ? (
        _progress: number,
        _step: string,
        _currentBlock?: number,
        _totalBlocks?: number,
        secondsRemaining?: number
      ) => onProgress(_progress, _step, i + 1, polygonCoordStrs.length, secondsRemaining)
      : undefined;
    // 仅在第一个请求时传入预获取的等待时间，后续请求由于rate limit会自动等待
    const pauseForThisRequest = i === 0 ? preFetchedPauseMs : undefined;
    const result = await overpassRequest(query, 5, progressCallback, pauseForThisRequest);
    results.push(result);
  }

  return results;
}

/**
 * 根据 tags 构造 Overpass 的 features 查询语句。
 *
 * 对标 OSMnx/_overpass.py 的 _create_overpass_features_query() (L286-L354)
 */
function buildFeaturesQuery(
  overpassSettings: string,
  polygonCoordStr: string,
  tags: Record<string, boolean | string | string[]>
): string {
  // 将 tags 展开为 [{key, value}] 列表
  const tagPairs: Array<{ key: string; value: boolean | string }> = [];
  for (const [key, value] of Object.entries(tags)) {
    if (typeof value === "boolean") {
      tagPairs.push({ key, value });
    } else if (typeof value === "string") {
      tagPairs.push({ key, value });
    } else if (Array.isArray(value)) {
      for (const v of value) {
        tagPairs.push({ key, value: v });
      }
    }
  }

  // 为每个 tag pair 生成 node/way/relation 三种查询
  const components: string[] = [];
  for (const { key, value } of tagPairs) {
    const tagStr =
      typeof value === "boolean"
        ? `["${key}"](poly:"${polygonCoordStr}");(._;>;);`
        : `["${key}"="${value}"](poly:"${polygonCoordStr}");(._;>;);`;

    for (const kind of ["node", "way", "relation"]) {
      components.push(`(${kind}${tagStr});`);
    }
  }

  return `${overpassSettings};(${components.join("")});out;`;
}
