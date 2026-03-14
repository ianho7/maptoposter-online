import { useEffect } from "react";

// Cormorant Garamond 覆盖 fr/de/es 所有 Latin Extended 字符
// 与 Sitea 同为高对比衬线风格，气质一致
// fr/de/es 三个语言共用同一 URL，只加载一次
const CORMORANT_URL =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,700;1,400&display=swap";

const FONTS: Record<string, { url?: string; family: string }> = {
  en: {
    family: "'Sitea', 'Playfair Display', Georgia, serif",
  },
  fr: {
    url: CORMORANT_URL,
    family: "'Cormorant Garamond', 'Sitea', Georgia, serif",
  },
  de: {
    url: CORMORANT_URL,
    family: "'Cormorant Garamond', 'Sitea', Georgia, serif",
  },
  es: {
    url: CORMORANT_URL,
    family: "'Cormorant Garamond', 'Sitea', Georgia, serif",
  },
  "zh-CN": {
    url: "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700&display=swap",
    family: "'Noto Serif SC', 'Sitea', STSong, serif",
  },
  ja: {
    url: "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;700&display=swap",
    family: "'Noto Serif JP', 'Sitea', 'Hiragino Mincho ProN', serif",
  },
  ko: {
    url: "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700&display=swap",
    family: "'Noto Serif KR', 'Sitea', 'Apple Myungjo', serif",
  },
};

// 已加载过的 URL 缓存，避免重复插入 <link>
const loaded = new Set<string>();

export function useDynamicFont(locale: string) {
  useEffect(() => {
    const font = FONTS[locale] ?? FONTS["en"];

    // 按需加载 Google Font
    if (font.url && !loaded.has(font.url)) {
      loaded.add(font.url);

      // preconnect 加速（只插一次）
      if (!document.querySelector('link[rel="preconnect"][href="https://fonts.googleapis.com"]')) {
        const pc1 = document.createElement("link");
        pc1.rel = "preconnect";
        pc1.href = "https://fonts.googleapis.com";
        document.head.appendChild(pc1);

        const pc2 = document.createElement("link");
        pc2.rel = "preconnect";
        pc2.href = "https://fonts.gstatic.com";
        (pc2 as any).crossOrigin = "anonymous";
        document.head.appendChild(pc2);
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = font.url;
      document.head.appendChild(link);
    }

    // 更新 CSS 变量 → body 字体自动跟着变
    document.documentElement.style.setProperty("--font-body", font.family);
    // 设置 lang 属性，有助于浏览器断字、引号等排版规则
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);
}
