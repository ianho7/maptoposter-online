export interface PoiIconPathDefinition {
  d: string;
  fillRule?: "evenodd" | "nonzero";
  commands: PoiIconPathCommand[];
}

export interface PoiIconDefinition {
  viewBoxWidth: number;
  viewBoxHeight: number;
  paths: PoiIconPathDefinition[];
}

export interface PoiIconPathCommand {
  type: "M" | "L" | "Q" | "C" | "Z";
  values: number[];
}

const poiIconModules = import.meta.glob("../assets/poi-icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

let iconCache: Record<string, PoiIconDefinition> | null = null;

function extractPoiTypeFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() || "";
  return fileName.replace(/\.svg$/i, "");
}

function parseViewBox(value: string | null) {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function normalizeFillRule(value: string | null): "evenodd" | "nonzero" | undefined {
  if (value === "evenodd") return "evenodd";
  if (value === "nonzero") return "nonzero";
  return undefined;
}

function isCommandToken(token: string) {
  return /^[a-zA-Z]$/.test(token);
}

function tokenizePathData(pathData: string) {
  return pathData.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
}

function reflectPoint(px: number, py: number, cx: number, cy: number) {
  return [px * 2 - cx, py * 2 - cy] as const;
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number) {
  const dot = ux * vx + uy * vy;
  const det = ux * vy - uy * vx;
  return Math.atan2(det, dot);
}

function approximateUnitArc(theta1: number, deltaTheta: number) {
  const alpha = (4 / 3) * Math.tan(deltaTheta / 4);
  const x1 = Math.cos(theta1);
  const y1 = Math.sin(theta1);
  const x2 = Math.cos(theta1 + deltaTheta);
  const y2 = Math.sin(theta1 + deltaTheta);

  return [
    x1 - y1 * alpha,
    y1 + x1 * alpha,
    x2 + y2 * alpha * -1,
    y2 - x2 * alpha * -1,
    x2,
    y2,
  ] as const;
}

function arcToCubicCommands(
  startX: number,
  startY: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  endX: number,
  endY: number
): PoiIconPathCommand[] | null {
  if (rx === 0 || ry === 0) {
    return [{ type: "L", values: [endX, endY] }];
  }
  if (startX === endX && startY === endY) {
    return [];
  }

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (startX - endX) / 2;
  const dy2 = (startY - endY) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let adjustedRx = Math.abs(rx);
  let adjustedRy = Math.abs(ry);
  const lambda = (x1p * x1p) / (adjustedRx * adjustedRx) + (y1p * y1p) / (adjustedRy * adjustedRy);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    adjustedRx *= scale;
    adjustedRy *= scale;
  }

  const rxSq = adjustedRx * adjustedRx;
  const rySq = adjustedRy * adjustedRy;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const numerator = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const denominator = rxSq * y1pSq + rySq * x1pSq;
  const factor = denominator === 0 ? 0 : sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = factor * ((adjustedRx * y1p) / adjustedRy);
  const cyp = factor * ((-adjustedRy * x1p) / adjustedRx);

  const centerX = cosPhi * cxp - sinPhi * cyp + (startX + endX) / 2;
  const centerY = sinPhi * cxp + cosPhi * cyp + (startY + endY) / 2;

  const startVectorX = (x1p - cxp) / adjustedRx;
  const startVectorY = (y1p - cyp) / adjustedRy;
  const endVectorX = (-x1p - cxp) / adjustedRx;
  const endVectorY = (-y1p - cyp) / adjustedRy;

  let theta1 = vectorAngle(1, 0, startVectorX, startVectorY);
  let deltaTheta = vectorAngle(startVectorX, startVectorY, endVectorX, endVectorY);

  if (!sweepFlag && deltaTheta > 0) {
    deltaTheta -= Math.PI * 2;
  } else if (sweepFlag && deltaTheta < 0) {
    deltaTheta += Math.PI * 2;
  }

  const segments = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const delta = deltaTheta / segments;
  const commands: PoiIconPathCommand[] = [];

  for (let i = 0; i < segments; i += 1) {
    const [c1x, c1y, c2x, c2y, px, py] = approximateUnitArc(theta1, delta);
    const transformPoint = (x: number, y: number) => {
      const scaledX = x * adjustedRx;
      const scaledY = y * adjustedRy;
      return [
        cosPhi * scaledX - sinPhi * scaledY + centerX,
        sinPhi * scaledX + cosPhi * scaledY + centerY,
      ] as const;
    };

    const [tx1, ty1] = transformPoint(c1x, c1y);
    const [tx2, ty2] = transformPoint(c2x, c2y);
    const [tx, ty] = transformPoint(px, py);

    commands.push({
      type: "C",
      values: [tx1, ty1, tx2, ty2, tx, ty],
    });

    theta1 += delta;
  }

  return commands;
}

function parsePathCommands(pathData: string): PoiIconPathCommand[] | null {
  const tokens = tokenizePathData(pathData);
  if (tokens.length === 0) return null;

  const commands: PoiIconPathCommand[] = [];
  let index = 0;
  let currentCommand = "";
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let lastCubicControlX: number | null = null;
  let lastCubicControlY: number | null = null;
  let lastQuadControlX: number | null = null;
  let lastQuadControlY: number | null = null;

  const readNumber = () => {
    const token = tokens[index];
    if (!token || isCommandToken(token)) return null;
    index += 1;
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };

  const resetControlPoints = () => {
    lastCubicControlX = null;
    lastCubicControlY = null;
    lastQuadControlX = null;
    lastQuadControlY = null;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (isCommandToken(token)) {
      currentCommand = token;
      index += 1;
    } else if (!currentCommand) {
      return null;
    }

    const command = currentCommand;
    const isRelative = command === command.toLowerCase();
    const absoluteCommand = command.toUpperCase();

    if (absoluteCommand === "Z") {
      commands.push({ type: "Z", values: [] });
      currentX = startX;
      currentY = startY;
      resetControlPoints();
      currentCommand = "";
      continue;
    }

    if (absoluteCommand === "M") {
      let firstPoint = true;
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x = readNumber();
        const y = readNumber();
        if (x === null || y === null) return null;
        const nextX = isRelative ? currentX + x : x;
        const nextY = isRelative ? currentY + y : y;
        if (firstPoint) {
          commands.push({ type: "M", values: [nextX, nextY] });
          startX = nextX;
          startY = nextY;
          firstPoint = false;
        } else {
          commands.push({ type: "L", values: [nextX, nextY] });
        }
        currentX = nextX;
        currentY = nextY;
      }
      resetControlPoints();
      currentCommand = isRelative ? "l" : "L";
      continue;
    }

    if (absoluteCommand === "L") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x = readNumber();
        const y = readNumber();
        if (x === null || y === null) return null;
        currentX = isRelative ? currentX + x : x;
        currentY = isRelative ? currentY + y : y;
        commands.push({ type: "L", values: [currentX, currentY] });
      }
      resetControlPoints();
      continue;
    }

    if (absoluteCommand === "H") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x = readNumber();
        if (x === null) return null;
        currentX = isRelative ? currentX + x : x;
        commands.push({ type: "L", values: [currentX, currentY] });
      }
      resetControlPoints();
      continue;
    }

    if (absoluteCommand === "V") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const y = readNumber();
        if (y === null) return null;
        currentY = isRelative ? currentY + y : y;
        commands.push({ type: "L", values: [currentX, currentY] });
      }
      resetControlPoints();
      continue;
    }

    if (absoluteCommand === "C") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x1 = readNumber();
        const y1 = readNumber();
        const x2 = readNumber();
        const y2 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if ([x1, y1, x2, y2, x, y].some((value) => value === null)) return null;
        const nextX1 = isRelative ? currentX + x1! : x1!;
        const nextY1 = isRelative ? currentY + y1! : y1!;
        const nextX2 = isRelative ? currentX + x2! : x2!;
        const nextY2 = isRelative ? currentY + y2! : y2!;
        currentX = isRelative ? currentX + x! : x!;
        currentY = isRelative ? currentY + y! : y!;
        commands.push({
          type: "C",
          values: [nextX1, nextY1, nextX2, nextY2, currentX, currentY],
        });
        lastCubicControlX = nextX2;
        lastCubicControlY = nextY2;
        lastQuadControlX = null;
        lastQuadControlY = null;
      }
      continue;
    }

    if (absoluteCommand === "S") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x2 = readNumber();
        const y2 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if ([x2, y2, x, y].some((value) => value === null)) return null;
        const [x1, y1] =
          lastCubicControlX === null || lastCubicControlY === null
            ? [currentX, currentY]
            : reflectPoint(currentX, currentY, lastCubicControlX, lastCubicControlY);
        const nextX2 = isRelative ? currentX + x2! : x2!;
        const nextY2 = isRelative ? currentY + y2! : y2!;
        currentX = isRelative ? currentX + x! : x!;
        currentY = isRelative ? currentY + y! : y!;
        commands.push({
          type: "C",
          values: [x1, y1, nextX2, nextY2, currentX, currentY],
        });
        lastCubicControlX = nextX2;
        lastCubicControlY = nextY2;
        lastQuadControlX = null;
        lastQuadControlY = null;
      }
      continue;
    }

    if (absoluteCommand === "Q") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x1 = readNumber();
        const y1 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if ([x1, y1, x, y].some((value) => value === null)) return null;
        const nextX1 = isRelative ? currentX + x1! : x1!;
        const nextY1 = isRelative ? currentY + y1! : y1!;
        currentX = isRelative ? currentX + x! : x!;
        currentY = isRelative ? currentY + y! : y!;
        commands.push({ type: "Q", values: [nextX1, nextY1, currentX, currentY] });
        lastQuadControlX = nextX1;
        lastQuadControlY = nextY1;
        lastCubicControlX = null;
        lastCubicControlY = null;
      }
      continue;
    }

    if (absoluteCommand === "T") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const x = readNumber();
        const y = readNumber();
        if ([x, y].some((value) => value === null)) return null;
        const [x1, y1] =
          lastQuadControlX === null || lastQuadControlY === null
            ? [currentX, currentY]
            : reflectPoint(currentX, currentY, lastQuadControlX, lastQuadControlY);
        currentX = isRelative ? currentX + x! : x!;
        currentY = isRelative ? currentY + y! : y!;
        commands.push({ type: "Q", values: [x1, y1, currentX, currentY] });
        lastQuadControlX = x1;
        lastQuadControlY = y1;
        lastCubicControlX = null;
        lastCubicControlY = null;
      }
      continue;
    }

    if (absoluteCommand === "A") {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const rx = readNumber();
        const ry = readNumber();
        const xAxisRotation = readNumber();
        const largeArcFlag = readNumber();
        const sweepFlag = readNumber();
        const x = readNumber();
        const y = readNumber();
        if (
          [rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y].some((value) => value === null)
        ) {
          return null;
        }

        const nextX = isRelative ? currentX + x! : x!;
        const nextY = isRelative ? currentY + y! : y!;
        const arcCommands = arcToCubicCommands(
          currentX,
          currentY,
          rx!,
          ry!,
          xAxisRotation!,
          largeArcFlag! ? 1 : 0,
          sweepFlag! ? 1 : 0,
          nextX,
          nextY
        );
        if (!arcCommands) return null;
        commands.push(...arcCommands);
        currentX = nextX;
        currentY = nextY;
        resetControlPoints();
      }
      continue;
    }

    return null;
  }

  return commands;
}

function parsePoiIcon(svg: string): PoiIconDefinition | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgElement = doc.querySelector("svg");
  if (!svgElement) return null;

  const viewBox = parseViewBox(svgElement.getAttribute("viewBox"));
  if (!viewBox) return null;

  const paths = Array.from(svgElement.querySelectorAll("path"))
    .map((pathElement) => {
      const d = pathElement.getAttribute("d")?.trim() || "";
      if (!d) return null;
      const commands = parsePathCommands(d);
      if (!commands) return null;
      const fillRule = normalizeFillRule(pathElement.getAttribute("fill-rule"));
      return {
        d,
        ...(fillRule ? { fillRule } : {}),
        commands,
      };
    })
    .filter(Boolean) as PoiIconPathDefinition[];

  if (paths.length === 0) return null;

  return {
    viewBoxWidth: viewBox.width,
    viewBoxHeight: viewBox.height,
    paths,
  };
}

function buildPoiIconCache() {
  const nextCache: Record<string, PoiIconDefinition> = {};

  for (const [modulePath, rawSvg] of Object.entries(poiIconModules)) {
    const poiType = extractPoiTypeFromPath(modulePath);
    const icon = parsePoiIcon(rawSvg);
    if (!icon) continue;
    nextCache[poiType] = icon;
  }

  return nextCache;
}

export function getPoiIconDefinition(poiType: string) {
  if (!iconCache) {
    iconCache = buildPoiIconCache();
  }

  return iconCache[poiType] ?? null;
}
