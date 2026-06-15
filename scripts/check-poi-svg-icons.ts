import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

interface InvalidIconFile {
  filePath: string;
  reasons: string[];
}

const DEFAULT_TARGET_DIR = "src/assets/poi-icons";
const SVG_EXT = ".svg";

const UNSUPPORTED_ELEMENT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "<rect>", pattern: /<rect\b/i },
  { label: "<circle>", pattern: /<circle\b/i },
  { label: "<ellipse>", pattern: /<ellipse\b/i },
  { label: "<line>", pattern: /<line\b/i },
  { label: "<polyline>", pattern: /<polyline\b/i },
  { label: "<polygon>", pattern: /<polygon\b/i },
  { label: "<clipPath>", pattern: /<clipPath\b/i },
  { label: "<mask>", pattern: /<mask\b/i },
  { label: "<filter>", pattern: /<filter\b/i },
  { label: "<pattern>", pattern: /<pattern\b/i },
  { label: "<symbol>", pattern: /<symbol\b/i },
  { label: "<use>", pattern: /<use\b/i },
];

const UNSUPPORTED_COMPLEX_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "transform attribute", pattern: /\stransform\s*=/i },
  { label: "style attribute", pattern: /\sstyle\s*=/i },
];

function printUsage() {
  console.log("Usage: bun run scripts/check-poi-svg-icons.ts [targetDir]");
  console.log(`Default targetDir: ${DEFAULT_TARGET_DIR}`);
}

async function collectSvgFiles(targetDir: string): Promise<string[]> {
  const entries = await readdir(targetDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(targetDir, entry.name);
      if (entry.isDirectory()) {
        return collectSvgFiles(fullPath);
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(SVG_EXT)) {
        return [fullPath];
      }
      return [];
    })
  );

  return files.flat();
}

function extractPathTags(svg: string) {
  return svg.match(/<path\b[^>]*>/gi) ?? [];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function validateSvgContent(svg: string, filePath: string): InvalidIconFile | null {
  const reasons: string[] = [];

  if (!/<svg\b/i.test(svg)) {
    reasons.push("missing <svg> root");
  }

  if (!/\bviewBox\s*=\s*['"][^'"]+['"]/i.test(svg)) {
    reasons.push("missing viewBox");
  }

  for (const rule of UNSUPPORTED_ELEMENT_PATTERNS) {
    if (rule.pattern.test(svg)) {
      reasons.push(`contains unsupported element ${rule.label}`);
    }
  }

  for (const rule of UNSUPPORTED_COMPLEX_PATTERNS) {
    if (rule.pattern.test(svg)) {
      reasons.push(`contains unsupported ${rule.label}`);
    }
  }

  const pathTags = extractPathTags(svg);
  if (pathTags.length === 0) {
    reasons.push("contains no <path> elements");
  }

  pathTags.forEach((pathTag, index) => {
    if (!/\sd\s*=\s*['"][^'"]+['"]/i.test(pathTag)) {
      reasons.push(`path #${index + 1} is missing d`);
    }
    if (/\sfill\s*=\s*['"]none['"]/i.test(pathTag)) {
      reasons.push(`path #${index + 1} uses fill=\"none\"`);
    }
    if (/\sstroke\s*=/i.test(pathTag)) {
      reasons.push(`path #${index + 1} uses stroke`);
    }
  });

  if (reasons.length === 0) return null;
  return { filePath, reasons: Array.from(new Set(reasons)) };
}

async function main() {
  const rawArg = process.argv[2];
  if (rawArg === "--help" || rawArg === "-h") {
    printUsage();
    return;
  }

  const targetDir = resolve(process.cwd(), rawArg || DEFAULT_TARGET_DIR);
  const targetStats = await stat(targetDir).catch(() => null);
  if (!targetStats || !targetStats.isDirectory()) {
    console.error(`Target directory not found: ${targetDir}`);
    process.exitCode = 1;
    return;
  }

  const svgFiles = await collectSvgFiles(targetDir);
  if (svgFiles.length === 0) {
    console.log(`No SVG files found under ${targetDir}`);
    return;
  }

  const invalidFiles: InvalidIconFile[] = [];

  for (const filePath of svgFiles) {
    const svg = await readFile(filePath, "utf8");
    const invalidFile = validateSvgContent(svg, filePath);
    if (invalidFile) {
      invalidFiles.push(invalidFile);
    }
  }

  if (invalidFiles.length === 0) {
    console.log(`All ${svgFiles.length} SVG files look compatible in ${targetDir}`);
    return;
  }

  console.log(`Found ${invalidFiles.length} incompatible SVG file(s) in ${targetDir}:`);
  for (const invalidFile of invalidFiles) {
    console.log(`- ${invalidFile.filePath}`);
    for (const reason of invalidFile.reasons) {
      console.log(`  - ${normalizeWhitespace(reason)}`);
    }
  }

  process.exitCode = 1;
}

await main();
