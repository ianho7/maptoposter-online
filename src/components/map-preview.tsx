import { MapPosterPreview, type PosterSize } from "@/components/artistic-map";
import { type CustomPOI, type Location } from "@/lib/types";

interface MapColors {
  bg: string;
  text: string;
  gradient_color: string;
  poi_color: string;
  water: string;
  parks: string;
  road_motorway: string;
  road_primary: string;
  road_secondary: string;
  road_tertiary: string;
  road_residential: string;
  road_default: string;
}

interface MapLocation {
  lat: number;
  lon: number;
}

interface MapPreviewProps {
  location: Location;
  selectedSize: PosterSize;
  colors: MapColors;
  customPois: CustomPOI[];
  showCustomPois: boolean;
  fontCacheRef: React.RefObject<Map<string, { data: Uint8Array; fileName: string }> | null>;
  selectedPreset: string;
  baseRadius: number;
  customTitle: string;
  showCoords: boolean;
  showCity: boolean;
  showCountry: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
  /** 预览区底部提示文字，由父组件传 i18n 文案，避免 MapPreview 订阅 paraglide 导致切语言时重渲染 canvas */
  previewHint?: string;
  interactive?: boolean;
  onMove?: (location: MapLocation) => void;
  onMoveEnd?: (location: MapLocation) => void;
}

export function MapPreview({
  location,
  selectedSize,
  colors,
  customPois,
  showCustomPois,
  fontCacheRef,
  selectedPreset,
  baseRadius,
  customTitle,
  showCoords,
  showCity,
  showCountry,
  previewRef,
  previewHint,
  interactive = false,
  onMove,
  onMoveEnd,
}: MapPreviewProps) {
  const previewTheme = {
    bg: colors.bg,
    water: colors.water,
    parks: colors.parks,
    road_motorway: colors.road_motorway,
    road_primary: colors.road_primary,
    road_secondary: colors.road_secondary,
    road_tertiary: colors.road_tertiary,
    road_residential: colors.road_residential,
    road_default: colors.road_default,
    route: colors.poi_color || colors.text || colors.bg,
    poi: colors.poi_color || colors.road_default,
  };

  return (
    <div
      className="flex flex-col items-center justify-center p-8 relative overflow-hidden bg-card border-border md:h-full min-h-[400px]"
      style={{
        maxHeight: "100%",
        maxWidth: "100%",
        background: `
          radial-gradient(ellipse at 30% 20%, ${colors.bg}dd 0%, transparent 50%),
          radial-gradient(ellipse at 70% 80%, ${colors.text}cc 0%, transparent 40%),
          linear-gradient(135deg, ${colors.parks} 0%, ${colors.water}f0 50%, ${colors.poi_color}dd 100%)
        `,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#000 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div
        ref={previewRef}
        className="flex items-center justify-center relative transition-all duration-300 ease-in-out w-full h-full p-4"
        style={{ containerType: "size" }}
      >
        <div
          className="relative shadow-lg"
          style={{
            aspectRatio: `${selectedSize.width} / ${selectedSize.height}`,
            width: `min(${((selectedSize.width / selectedSize.height) * 100).toFixed(4)}cqh, 100cqw)`,
            height: `min(${((selectedSize.height / selectedSize.width) * 100).toFixed(4)}cqw, 100cqh)`,
          }}
        >
          <MapPosterPreview
            location={{ lat: location.lat || 0, lon: location.lng || 0 }}
            city={
              customTitle || location.district?.toUpperCase() || location.city.toUpperCase() || ""
            }
            country={location.country || ""}
            customPois={customPois}
            showCustomPois={showCustomPois}
            zoom={12}
            radius={baseRadius}
            poiDensity="none"
            theme={previewTheme}
            textColor={colors.text}
            gradientColor={colors.gradient_color}
            posterSize={selectedSize}
            fontCacheRef={fontCacheRef}
            selectedPreset={selectedPreset}
            className="w-full h-full"
            roadWidthMultiplier={1}
            showCity={showCity}
            showCountry={showCountry}
            showCoords={showCoords}
            interactive={interactive}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
          />
        </div>
      </div>
      {previewHint ? (
        <p className="text-xs tracking-wide text-white font-light whitespace-nowrap text-shadow-sm select-none">
          {previewHint}
        </p>
      ) : null}
    </div>
  );
}
