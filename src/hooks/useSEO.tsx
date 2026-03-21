// src/hooks/useSEO.tsx
// React 19 原生支持 <title> <meta> <link> 自动提升到 <head>
// 无需安装任何额外依赖
import { getLocale } from "@/paraglide/runtime";

const BASE_URL = "https://maptoposter.0v0.one";

const SUPPORTED_LOCALES = ["en", "zh", "fr", "de", "ja", "ko", "es"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

interface SEOProps {
  title?: string;
  description?: string;
  ogImage?: string;
  noIndex?: boolean;
}

const DEFAULT_META: Record<Locale, { title: string; description: string; keywords: string }> = {
  en: {
    title: "MapPoster Online – Turn Cities into Artistic Map Posters",
    description:
      "Create stunning retro-style map posters from OpenStreetMap data — no installation needed. 20 built-in themes, real-time preview, Rust/WASM rendering, 7 languages. Export high-res prints instantly in your browser.",
    keywords:
      "map poster, city map print, openstreetmap poster, custom map art, map generator, printable map, wall art map, map poster maker",
  },
  zh: {
    title: "MapPoster Online – 将城市变成艺术地图海报",
    description:
      "基于 OpenStreetMap 数据在线生成复古风格地图海报，无需安装。20 种内置主题，实时预览，Rust/WASM 渲染引擎，支持 7 种语言，直接导出高清印刷图片。",
    keywords:
      "地图海报, 城市地图, 地图打印, 地图生成器, 艺术地图, OpenStreetMap, 自定义地图, 海报制作",
  },
  fr: {
    title: "MapPoster Online – Transformez vos villes en affiches artistiques",
    description:
      "Créez de superbes affiches de cartes rétro depuis les données OpenStreetMap — sans installation. 20 thèmes intégrés, aperçu en temps réel, moteur Rust/WASM, 7 langues. Exportez en haute résolution directement dans votre navigateur.",
    keywords:
      "affiche carte, carte ville, impression carte, générateur carte, art cartographique, OpenStreetMap, carte personnalisée",
  },
  de: {
    title: "MapPoster Online – Städte als künstlerische Kartenplakate",
    description:
      "Erstelle beeindruckende Retro-Kartenplakate aus OpenStreetMap-Daten – ohne Installation. 20 Themes, Echtzeit-Vorschau, Rust/WASM-Rendering, 7 Sprachen. Hochauflösend im Browser exportieren.",
    keywords:
      "Kartenplakat, Stadtplan Poster, Kartenprint, Kartengenerator, Kartenkunst, OpenStreetMap, individuelles Kartenposter",
  },
  ja: {
    title: "MapPoster Online – 都市をアート地図ポスターに",
    description:
      "OpenStreetMapデータからレトロスタイルの地図ポスターをブラウザで作成。インストール不要、20テーマ搭載、リアルタイムプレビュー、Rust/WASMレンダリング、7言語対応。高解像度で即エクスポート。",
    keywords:
      "地図ポスター, 都市地図, 地図プリント, 地図ジェネレーター, マップアート, OpenStreetMap, カスタム地図",
  },
  ko: {
    title: "MapPoster Online – 도시를 예술 지도 포스터로",
    description:
      "OpenStreetMap 데이터로 레트로 스타일 지도 포스터를 브라우저에서 바로 생성. 설치 불필요, 테마 20종, 실시간 미리보기, Rust/WASM 렌더링, 7개 언어 지원. 고해상도로 즉시 내보내기.",
    keywords:
      "지도 포스터, 도시 지도, 지도 프린트, 지도 생성기, 맵 아트, OpenStreetMap, 커스텀 지도",
  },
  es: {
    title: "MapPoster Online – Convierte ciudades en pósters artísticos",
    description:
      "Crea impresionantes pósters de mapas retro con datos de OpenStreetMap — sin instalación. 20 temas integrados, vista previa en tiempo real, motor Rust/WASM, 7 idiomas. Exporta en alta resolución desde el navegador.",
    keywords:
      "póster de mapa, mapa ciudad, impresión mapa, generador de mapas, arte cartográfico, OpenStreetMap, mapa personalizado",
  },
};

export function SEOHead({ title, description,
  // ogImage, 
  noIndex }: SEOProps = {}) {
  const locale = getLocale() as Locale;
  const defaults = DEFAULT_META[locale] ?? DEFAULT_META.en;

  const resolvedTitle = title ?? defaults.title;
  const resolvedDesc = description ?? defaults.description;
  const resolvedKeywords = defaults.keywords;
  // const resolvedOgImage = ogImage ?? `${BASE_URL}/og-image.png`
  const canonicalUrl = `${BASE_URL}/${locale}/`;

  return (
    <>
      {/* 基础 */}
      <title> {resolvedTitle} </title>
      <meta name="description" content={resolvedDesc} />
      <meta name="keywords" content={resolvedKeywords} />
      <link rel="canonical" href={canonicalUrl} />

      {/* 搜索引擎验证 —— 去各平台获取 token 后取消注释 */}
      {/* <meta name="google-site-verification" content="YOUR_GOOGLE_TOKEN" /> */}
      {/* <meta name="msvalidate.01" content="YOUR_BING_TOKEN" /> */}

      {/* robots */}
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow"} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="MapPoster Online" />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={resolvedDesc} />
      <meta property="og:url" content={canonicalUrl} />
      {/* <meta property="og:image" content={resolvedOgImage} /> */}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="MapPoster Online – Map Poster Generator" />
      <meta property="og:locale" content={locale} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={resolvedDesc} />
      {/* <meta name="twitter:image" content={resolvedOgImage} /> */}

      {/* hreflang 多语言互指 */}
      {SUPPORTED_LOCALES.map((lang) => (
        <link key={lang} rel="alternate" hrefLang={lang} href={`${BASE_URL}/${lang}/`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}/en/`} />

      {/* JSON-LD 结构化数据 */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "MapPoster Online",
          url: BASE_URL,
          description: DEFAULT_META.en.description,
          applicationCategory: "DesignApplication",
          operatingSystem: "Any (Web Browser)",
          browserRequirements: "Requires JavaScript and WebAssembly support",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          inLanguage: ["en", "zh", "fr", "de", "ja", "ko", "es"],
          featureList: [
            "Zero installation required",
            "20 built-in themes",
            "Real-time preview",
            "High-resolution PNG export at 300 DPI",
            "Custom color control",
            "Multiple export formats (A4, Square, Phone, Desktop)",
            "Dynamic font loading (TTF/OTF upload)",
            "Rust/WASM rendering engine",
          ],
          isAccessibleForFree: true,
          license: "https://opensource.org/licenses/MIT",
        })}
      </script>
    </>
  );
}
