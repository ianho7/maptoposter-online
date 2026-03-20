import { images } from "@/assets/images.json";

export interface Poster {
  id: number;
  title: string;
  image: string;
  description?: string;
}

// 从文件名提取城市名： "bangkok-map-poster.png" → "Bangkok"
function formatCityName(filename: string): string {
  return filename
    .replace(/\.(png|webp)$/, "") // 移除扩展名
    .replace(/-/g, " ") // 连字符转空格
    .replace(/\b\w/g, (c) => c.toUpperCase()); // 首字母大写
}

const IMAGE_BASE_URL = "https://img.0v0.one/lossless_webp/";

export const posters: Poster[] = images.map((filename, index) => ({
  id: index + 1,
  title: formatCityName(filename),
  image: `${IMAGE_BASE_URL}${filename.replace(/\.png$/, ".webp")}`,
  description: "",
}));
