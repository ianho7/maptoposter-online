import {
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import * as m from "@/paraglide/messages";

interface CachedFont {
  data: Uint8Array;
  fileName: string;
}

interface FontManagement {
  customFont: Uint8Array | null;
  fontFileName: string;
  fontFileInputRef: RefObject<HTMLInputElement | null>;
  selectedPreset: string;
  fontLoadingPreset: string | null;
  fontCacheRef: MutableRefObject<Map<string, CachedFont>>;
  handleFontUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearCustomFont: () => void;
  handlePresetFontSelect: (preset: string) => Promise<void>;
}

const MAX_FONT_SIZE_BYTES = 5 * 1024 * 1024;

const fontMap: Record<string, string> = {
  LXGW_Neo_ZhiSong: "/font/LXGWNeoZhiSong.ttf",
  fraunces: "/font/Fraunces_72pt-Regular.ttf",
};

function resetFileInput(inputRef: RefObject<HTMLInputElement | null>) {
  if (inputRef.current) {
    inputRef.current.value = "";
  }
}

function isSupportedFontFile(fileName: string) {
  const normalized = fileName.toLowerCase();
  return normalized.endsWith(".ttf") || normalized.endsWith(".otf");
}

export function useFontManagement(): FontManagement {
  const [customFont, setCustomFont] = useState<Uint8Array | null>(null);
  const [fontFileName, setFontFileName] = useState<string>("");
  const fontFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("default");
  const [fontLoadingPreset, setFontLoadingPreset] = useState<string | null>(null);
  const fontCacheRef = useRef<Map<string, CachedFont>>(new Map());

  const clearCustomFont = () => {
    setCustomFont(null);
    setFontFileName("");
    setSelectedPreset("default");
    resetFileInput(fontFileInputRef);
  };

  const handleFontUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedFontFile(file.name)) {
      alert(m.font_upload_error());
      resetFileInput(fontFileInputRef);
      return;
    }

    if (file.size > MAX_FONT_SIZE_BYTES) {
      alert(m.font_upload_error());
      resetFileInput(fontFileInputRef);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontData = new Uint8Array(arrayBuffer);
      setCustomFont(fontData);
      setFontFileName(file.name);
      setSelectedPreset("custom");
      fontCacheRef.current.set("custom", { data: fontData, fileName: file.name });
    } catch (error) {
      console.error("Font upload failed:", error);
      alert(m.font_upload_error());
      setCustomFont(null);
      setFontFileName("");
      setSelectedPreset("default");
      fontCacheRef.current.delete("custom");
      resetFileInput(fontFileInputRef);
    }
  };

  const handlePresetFontSelect = async (preset: string) => {
    setSelectedPreset(preset);

    if (preset === "default") {
      clearCustomFont();
      return;
    }

    if (fontCacheRef.current.has(preset)) return;

    const fontUrl = fontMap[preset];
    if (!fontUrl) return;

    setFontLoadingPreset(preset);
    try {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error(`Failed to fetch font: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const fontData = new Uint8Array(arrayBuffer);
      const fileName = fontUrl.split("/").pop() || "";
      fontCacheRef.current.set(preset, { data: fontData, fileName });
    } catch (error) {
      console.error("Failed to load preset font:", error);
      alert(m.font_upload_error());
      setSelectedPreset("default");
      clearCustomFont();
    } finally {
      setFontLoadingPreset(null);
    }
  };

  return {
    customFont,
    fontFileName,
    fontFileInputRef,
    selectedPreset,
    fontLoadingPreset,
    fontCacheRef,
    handleFontUpload,
    clearCustomFont,
    handlePresetFontSelect,
  };
}
