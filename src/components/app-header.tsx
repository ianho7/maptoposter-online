import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, GithubIcon, Heart, Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useState } from "react";
import { locales } from "@/paraglide/runtime";
type AvailableLanguageTag = (typeof locales)[number];
import * as m from "@/paraglide/messages";

const LazySupportDialog = lazy(() =>
  import("@/components/support-dialog").then(({ SupportDialog }) => ({ default: SupportDialog }))
);

const languageNames: Record<AvailableLanguageTag, string> = {
  en: "English",
  zh: "简体中文",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  ru: "Русский",
};

interface AppHeaderProps {
  activeLang: AvailableLanguageTag;
  onLangChange: (lang: AvailableLanguageTag) => void;
  onDownload: (scale: number, format?: "png" | "svg") => void;
  isGenerating: boolean;
  locationLoading: boolean;
}

export function AppHeader({
  activeLang,
  onLangChange,
  onDownload,
  isGenerating,
  locationLoading,
}: AppHeaderProps) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // 移动端点击展开画质菜单
  const [starTarget, setStarTarget] = useState<number | null>(null);
  const localeOptions = { locale: activeLang };
  const downloadMenuId = useId();

  useEffect(() => {
    fetch("https://api.github.com/repos/ianho7/maptoposter-online")
      .then((res) => res.json())
      .then((data) => {
        const count: number = data.stargazers_count ?? 0;
        setStarTarget(Math.ceil((count + 1) / 100) * 100);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="shrink-0 bg-background">
      <div className="mx-0 md:mx-20 px-4 py-4 flex items-center">
        <img className="w-10 h-10 mr-2" src="/icon.svg" alt="icon" />
        <div className="mr-auto select-none">
          <h1 className="text-2xl tracking-wide  text-foreground">
            {m.app_title({}, localeOptions)}
          </h1>
          <p className="text-xs tracking-widest uppercase text-muted-foreground">
            {m.app_subtitle({}, localeOptions)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={activeLang}
            onValueChange={(val) => onLangChange(val as AvailableLanguageTag)}
            data-ai-action="select-language"
          >
            <SelectTrigger
              className="w-[90px] sm:w-[120px] h-9 border-border bg-card text-card-foreground"
              aria-label="Select language"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {languageNames[tag]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* 下载按钮 + 画质选择下拉菜单 */}
          <div className="relative group">
            <Button
              disabled={isGenerating || locationLoading}
              onClick={() => setMenuOpen(!menuOpen)}
              className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              data-ai-action="download-poster"
              aria-label={
                isGenerating
                  ? m.generating({}, localeOptions)
                  : m.download_button({}, localeOptions)
              }
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={downloadMenuId}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {isGenerating
                  ? m.generating({}, localeOptions)
                  : m.download_button({}, localeOptions)}
              </span>
            </Button>
            <div
              id={downloadMenuId}
              role="menu"
              className={[
                "absolute right-0 top-full mt-1 z-50 min-w-[300px] overflow-hidden bg-background border border-border shadow-lg transition-all duration-200",
                menuOpen
                  ? "opacity-100 visible"
                  : "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
              ].join(" ")}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDownload(1);
                }}
                className="w-full flex flex-col items-start gap-0.5 px-3 py-3 text-foreground hover:bg-primary hover:text-vanilla transition-colors cursor-pointer text-left"
              >
                <span className="text-sm font-semibold">
                  1X ({m.recommended({}, localeOptions)})
                </span>
                <span className="text-[12px] leading-tight">
                  {m.download_quality_1x_desc({}, localeOptions)}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDownload(2);
                }}
                className="w-full flex flex-col items-start gap-0.5 px-3 py-3 text-foreground hover:bg-primary hover:text-vanilla transition-colors cursor-pointer text-left"
              >
                <span className="text-sm font-semibold">2X</span>
                <span className="text-[12px] leading-tight">
                  {m.download_quality_2x_desc({}, localeOptions)}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDownload(1, "svg");
                }}
                className="w-full flex flex-col items-start gap-0.5 px-3 py-3 text-foreground hover:bg-primary hover:text-vanilla transition-colors cursor-pointer text-left"
              >
                <span className="text-sm font-semibold">
                  {m.download_svg_export({}, localeOptions)}
                </span>
                <span className="text-[12px] leading-tight">
                  {m.download_svg_export_desc({}, localeOptions)}
                </span>
              </button>
            </div>
          </div>
          <Button
            onClick={() => setSupportOpen(true)}
            className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            aria-label="Open support dialog"
            data-ai-action="open-support-dialog"
          >
            <Heart className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{m.support_button({}, localeOptions)}</span>
          </Button>
          <Button
            onClick={() => window.open("https://github.com/ianho7/maptoposter-online", "_blank")}
            className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            aria-label="Open GitHub repository in new tab"
            data-ai-action="open-github"
          >
            <GithubIcon className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">
              {starTarget ? m.star_hint({ target: starTarget }, localeOptions) : "Github"}
            </span>
          </Button>
        </div>
      </div>
      {supportOpen ? (
        <Suspense fallback={null}>
          <LazySupportDialog open={true} onOpenChange={setSupportOpen} activeLang={activeLang} />
        </Suspense>
      ) : null}
    </header>
  );
}
