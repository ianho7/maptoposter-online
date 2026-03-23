import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, GithubIcon, Loader2 } from "lucide-react";
import { locales } from "@/paraglide/runtime";
type AvailableLanguageTag = (typeof locales)[number];
import * as m from "@/paraglide/messages";

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
  onDownload: () => void;
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
  return (
    <header className="shrink-0 bg-background">
      <div className="mx-0 md:mx-20 px-4 py-4 flex items-center">
        <img className="w-10 h-10 mr-2" src="/icon.svg" alt="icon" />
        <div className="mr-auto select-none">
          <h1 className="text-2xl tracking-wide  text-foreground">{m.app_title()}</h1>
          <p className="text-xs tracking-widest uppercase text-muted-foreground">
            {m.app_subtitle()}
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
          <Button
            onClick={onDownload}
            disabled={isGenerating || locationLoading}
            className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            data-ai-action="download-poster"
            aria-label={isGenerating ? m.generating() : m.download_button()}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {isGenerating ? m.generating() : m.download_button()}
            </span>
          </Button>
          <Button
            onClick={() => window.open("https://github.com/ianho7/maptoposter-online", "_blank")}
            className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            aria-label="Open GitHub repository in new tab"
            data-ai-action="open-github"
          >
            <GithubIcon className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Github</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
