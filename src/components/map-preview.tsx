import { MapPosterPreview, type PosterSize } from "@/components/artistic-map";
import { type Location } from "@/lib/types";

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

interface StableTheme {
  bg: string;
  water: string;
  parks: string;
  road_motorway: string;
  road_primary: string;
  road_secondary: string;
  road_tertiary: string;
  road_residential: string;
  road_default: string;
  route: string;
  poi: string;
}

interface MapPreviewProps {
  location: Location;
  selectedSize: PosterSize;
  stableTheme: StableTheme;
  colors: MapColors;
  customFont: Uint8Array | null;
  baseRadius: number;
  customTitle: string;
  previewRef: React.RefObject<HTMLDivElement | null>;
}

export function MapPreview({
  location,
  selectedSize,
  stableTheme,
  colors,
  customFont,
  baseRadius,
  customTitle,
  previewRef,
}: MapPreviewProps) {
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
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full pointer-events-none select-none">
        <span className="text-xs tracking-wide text-white font-light whitespace-nowrap text-shadow-sm">
          Preview
        </span>
      </div>
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
            city={customTitle || location.city.toUpperCase() || ""}
            country={location.country || ""}
            zoom={12}
            radius={baseRadius}
            poiDensity="dense"
            theme={stableTheme}
            textColor={colors.text}
            gradientColor={colors.gradient_color}
            posterSize={selectedSize}
            customFont={customFont || undefined}
            className="w-full h-full"
            roadWidthMultiplier={1}
          />
        </div>
      </div>
    </div>
  );
}
