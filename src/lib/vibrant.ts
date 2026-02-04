/**
 * Vibrant Colors - Browser Version
 * 纯浏览器实现，不依赖 Node.js，可直接在前端项目中使用
 */

/**
 * RGB 颜色接口
 */
interface RGB {
    r: number;
    g: number;
    b: number;
}

/**
 * HSL 颜色接口
 */
interface HSL {
    h: number;
    s: number;
    l: number;
}

/**
 * 颜色格式化输出接口
 */
interface FormattedColor {
    hex: string;
    rgb: string;
    r: number;
    g: number;
    b: number;
}

/**
 * Vibrant 色调结果接口
 */
interface VibrantColors {
    vibrant: FormattedColor;
    darkVibrant: FormattedColor;
    lightVibrant: FormattedColor;
    muted: FormattedColor;
    darkMuted: FormattedColor;
    lightMuted: FormattedColor;
}

/**
 * 颜色变体接口
 */
interface ColorSwatch {
    vibrant: RGB;
    darkVibrant: RGB;
    lightVibrant: RGB;
    muted: RGB;
    darkMuted: RGB;
    lightMuted: RGB;
}

/**
 * K-means 选项接口
 */
interface KmeansOptions {
    k?: number;
    maxIterations?: number;
}

/**
 * 将 RGB 转换为 HSL
 */
function rgbToHsl(r: number, g: number, b: number): HSL {
    r /= 255;
    g /= 255;
    b /= 255;

    const max: number = Math.max(r, g, b);
    const min: number = Math.min(r, g, b);
    let h: number = 0;
    let s: number = 0;
    const l: number = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d: number = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * 将 HSL 转换为 RGB
 */
function hslToRgb(h: number, s: number, l: number): RGB {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r: number;
    let g: number;
    let b: number;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number): number => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q: number = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p: number = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

/**
 * 计算两个 RGB 颜色的欧氏距离
 */
function colorDistance(c1: RGB, c2: RGB): number {
    const dr: number = c1.r - c2.r;
    const dg: number = c1.g - c2.g;
    const db: number = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * K-means 聚类算法
 */
function kmeans(colors: RGB[], k: number = 16, maxIterations: number = 10): RGB[] {
    if (colors.length === 0) {
        return [];
    }

    // 随机初始化中心
    let centroids: RGB[] = [];
    for (let i = 0; i < k && i < colors.length; i++) {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        centroids.push({ ...randomColor });
    }

    let clusters: RGB[][] = Array.from({ length: k }, () => []);

    // 迭代优化
    for (let iter = 0; iter < maxIterations; iter++) {
        clusters = Array.from({ length: k }, () => []);

        // 分配像素到最近的中心
        for (const color of colors) {
            let minDist: number = Infinity;
            let bestCluster: number = 0;

            for (let i = 0; i < centroids.length; i++) {
                const dist: number = colorDistance(color, centroids[i]);
                if (dist < minDist) {
                    minDist = dist;
                    bestCluster = i;
                }
            }
            clusters[bestCluster].push(color);
        }

        // 更新中心
        const newCentroids: RGB[] = [];
        for (const cluster of clusters) {
            if (cluster.length > 0) {
                const avg: RGB = {
                    r: Math.round(
                        cluster.reduce((sum: number, c: RGB) => sum + c.r, 0) / cluster.length
                    ),
                    g: Math.round(
                        cluster.reduce((sum: number, c: RGB) => sum + c.g, 0) / cluster.length
                    ),
                    b: Math.round(
                        cluster.reduce((sum: number, c: RGB) => sum + c.b, 0) / cluster.length
                    )
                };
                newCentroids.push(avg);
            }
        }
        centroids = newCentroids;
    }

    // 按聚类大小排序
    return centroids.sort((a: RGB, b: RGB) => {
        const indexA = centroids.indexOf(a);
        const indexB = centroids.indexOf(b);
        return (clusters[indexB]?.length || 0) - (clusters[indexA]?.length || 0);
    });
}

/**
 * 为单个 RGB 颜色生成 6 种色调变体
 */
function generateSwatch(rgb: RGB): ColorSwatch {
    const hsl: HSL = rgbToHsl(rgb.r, rgb.g, rgb.b);

    return {
        vibrant: rgb,
        darkVibrant: hslToRgb(hsl.h, hsl.s, Math.max(0, hsl.l - 25)),
        lightVibrant: hslToRgb(hsl.h, hsl.s, Math.min(100, hsl.l + 25)),
        muted: hslToRgb(hsl.h, Math.max(0, hsl.s - 30), hsl.l),
        darkMuted: hslToRgb(
            hsl.h,
            Math.max(0, hsl.s - 30),
            Math.max(0, hsl.l - 25)
        ),
        lightMuted: hslToRgb(
            hsl.h,
            Math.max(0, hsl.s - 30),
            Math.min(100, hsl.l + 25)
        )
    };
}

/**
 * RGB 颜色转十六进制格式
 */
function rgbToHex(rgb: RGB): string {
    return `#${[rgb.r, rgb.g, rgb.b]
        .map((x: number) => {
            const hex: string = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
        .toUpperCase()}`;
}

/**
 * RGB 颜色转 rgb() 字符串格式
 */
function rgbToString(rgb: RGB): string {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * 评分颜色的质量
 */
function scoreColor(rgb: RGB, type: keyof ColorSwatch): number {
    const hsl: HSL = rgbToHsl(rgb.r, rgb.g, rgb.b);
    let score: number = 0;

    switch (type) {
        case 'vibrant':
            score = (hsl.s * (100 - Math.abs(hsl.l - 50))) / 100;
            break;
        case 'darkVibrant':
            score = hsl.s * (hsl.l < 50 ? hsl.l : 100 - hsl.l);
            break;
        case 'lightVibrant':
            score = hsl.s * (hsl.l > 50 ? hsl.l : 100 - hsl.l);
            break;
        case 'muted':
            score = ((100 - hsl.s) * (100 - Math.abs(hsl.l - 50))) / 100;
            break;
        case 'darkMuted':
            score = (100 - hsl.s) * (hsl.l < 50 ? hsl.l : 100 - hsl.l);
            break;
        case 'lightMuted':
            score = (100 - hsl.s) * (hsl.l > 50 ? hsl.l : 100 - hsl.l);
            break;
    }

    return score;
}

/**
 * 从候选颜色中选择最佳的指定类型色调
 */
function selectBest(swatches: ColorSwatch[], key: keyof ColorSwatch): RGB {
    if (swatches.length === 0) {
        return { r: 0, g: 0, b: 0 };
    }

    let best: RGB = swatches[0][key];
    let bestScore: number = scoreColor(best, key);

    for (let i = 1; i < swatches.length; i++) {
        const color: RGB = swatches[i][key];
        const score: number = scoreColor(color, key);
        if (score > bestScore) {
            best = color;
            bestScore = score;
        }
    }

    return best;
}

/**
 * 格式化输出结果
 */
function formatResult(colorObj: Record<string, RGB>): VibrantColors {
    const result: any = {};
    for (const [key, rgb] of Object.entries(colorObj)) {
        result[key] = {
            hex: rgbToHex(rgb),
            rgb: rgbToString(rgb),
            r: rgb.r,
            g: rgb.g,
            b: rgb.b
        };
    }
    return result as VibrantColors;
}

/**
 * 从 File 对象或 Blob 提取 Vibrant 颜色（浏览器版本）
 * @param source File、Blob 或 URL
 * @param options K-means 选项
 * @returns Promise<VibrantColors>
 */
async function getVibrant(
    source: File | Blob | string,
    options: KmeansOptions = {}
): Promise<VibrantColors> {
    const { k = 16, maxIterations = 10 } = options;

    try {
        // 加载图片
        const image = await loadImageFromSource(source);
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get canvas context');
        }

        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data: Uint8ClampedArray = imageData.data;

        // 提取所有像素
        const colors: RGB[] = [];
        const step: number = 4; // 采样步长

        for (let i = 0; i < data.length; i += 4 * step) {
            const r: number = data[i];
            const g: number = data[i + 1];
            const b: number = data[i + 2];
            const a: number = data[i + 3];

            // 跳过透明像素
            if (a > 200) {
                colors.push({ r, g, b });
            }
        }

        // K-means 聚类找出主要颜色
        const mainColors: RGB[] = kmeans(colors, k, maxIterations);

        // 为每个主要颜色生成色调变体
        const swatches: ColorSwatch[] = mainColors
            .slice(0, 5)
            .map((color: RGB) => generateSwatch(color));

        // 选择最佳的各个色调
        const result: Record<string, RGB> = {
            vibrant: selectBest(swatches, 'vibrant'),
            darkVibrant: selectBest(swatches, 'darkVibrant'),
            lightVibrant: selectBest(swatches, 'lightVibrant'),
            muted: selectBest(swatches, 'muted'),
            darkMuted: selectBest(swatches, 'darkMuted'),
            lightMuted: selectBest(swatches, 'lightMuted')
        };

        return formatResult(result);
    } catch (error) {
        console.error('Error processing image:', error);
        throw error;
    }
}

/**
 * 从不同来源加载图片
 */
async function loadImageFromSource(source: File | Blob | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));

        if (typeof source === 'string') {
            // URL 字符串
            img.src = source;
        } else {
            // File 或 Blob
            const url = URL.createObjectURL(source);
            img.src = url;
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
        }
    });
}

/**
 * 导出所有函数和接口
 */
export {
    getVibrant,
    rgbToHsl,
    hslToRgb,
    rgbToHex,
    rgbToString,
    colorDistance,
    kmeans,
    generateSwatch,
    scoreColor,
    loadImageFromSource
};
export type {
    RGB,
    HSL,
    FormattedColor,
    VibrantColors,
    ColorSwatch,
    KmeansOptions
};
