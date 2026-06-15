import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gcj02ToWgs84 } from "@/lib/coordinate-systems";
import { cn } from "@/lib/utils";
import { type CustomPOI, POI_TYPE_CATEGORIES } from "@/lib/types";
import { ArrowUp, CheckCircle2, Loader2, Plus, Search, Trash2, XCircle } from "lucide-react";
import * as m from "@/paraglide/messages";

const AMAP_PROXY_ENDPOINT = "https://restapi.amap.com";
const AMAP_API_KEY_TUTORIAL_URL = "https://lbs.amap.com/api/webservice/create-project-and-key";
const DEFAULT_POI_TYPE = "landmark";
const MIN_SEARCH_TERM_LENGTH = 2;

const poiIconUrlModules = import.meta.glob("../assets/poi-icons/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const poiIconUrlMap: Record<string, string> = {};
for (const [path, url] of Object.entries(poiIconUrlModules)) {
  const filename = path
    .split("/")
    .pop()
    ?.replace(/\.svg$/i, "");
  if (filename) poiIconUrlMap[filename] = url;
}

interface AmapSearchResult {
  id: string;
  name: string;
  address: string;
  location: string;
  citycode?: string;
  adcode?: string;
  district?: string;
  city?: string;
}

interface PoiManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customPois: CustomPOI[];
  setCustomPois: (pois: CustomPOI[]) => void;
  amapApiKey: string;
  setAmapApiKey: (value: string) => void;
  currentLat: number | null;
  currentLng: number | null;
  areaCacheKey: string;
  searchCity: string;
}

type ApiKeyStatus = "idle" | "testing" | "success" | "error";
type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

function getPoiTypeLabel(id: string) {
  const labels: Record<string, string> = {
    cafe: m.poi_type_cafe(),
    restaurant: m.poi_type_restaurant(),
    snack_bar: m.poi_type_snack_bar(),
    bakery: m.poi_type_bakery(),
    bar: m.poi_type_bar(),
    tea_shop: m.poi_type_tea_shop(),
    hotpot: m.poi_type_hotpot(),
    bbq: m.poi_type_bbq(),
    park: m.poi_type_park(),
    sightseeing_spot: m.poi_type_sightseeing_spot(),
    museum: m.poi_type_museum(),
    landmark: m.poi_type_landmark(),
    art_gallery: m.poi_type_art_gallery(),
    theme_park: m.poi_type_theme_park(),
    zoo_aquarium: m.poi_type_zoo_aquarium(),
    historical_site: m.poi_type_historical_site(),
    accommodation: m.poi_type_accommodation(),
    resort: m.poi_type_resort(),
    mall: m.poi_type_mall(),
    market: m.poi_type_market(),
    duty_free: m.poi_type_duty_free(),
    bookstore: m.poi_type_bookstore(),
    souvenir_shop: m.poi_type_souvenir_shop(),
    beach: m.poi_type_beach(),
    mountain: m.poi_type_mountain(),
    lake: m.poi_type_lake(),
    forest: m.poi_type_forest(),
    waterfall: m.poi_type_waterfall(),
    garden: m.poi_type_garden(),
    temple: m.poi_type_temple(),
    church: m.poi_type_church(),
    cultural_street: m.poi_type_cultural_street(),
    theater: m.poi_type_theater(),
    cinema: m.poi_type_cinema(),
    ktv: m.poi_type_ktv(),
    spa_wellness: m.poi_type_spa_wellness(),
    fitness_center: m.poi_type_fitness_center(),
    camping_site: m.poi_type_camping_site(),
    airport: m.poi_type_airport(),
    train_station: m.poi_type_train_station(),
    subway_station: m.poi_type_subway_station(),
    bus_station: m.poi_type_bus_station(),
    port: m.poi_type_port(),
    hospital: m.poi_type_hospital(),
    bank: m.poi_type_bank(),
    post_office: m.poi_type_post_office(),
    police_station: m.poi_type_police_station(),
    pharmacy: m.poi_type_pharmacy(),
  };

  return labels[id] ?? id;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getSearchTermLength(value: string) {
  return Array.from(value.trim()).length;
}

function isSameResult(existing: CustomPOI, candidate: AmapSearchResult) {
  if (existing.sourceId && existing.sourceId === candidate.id) return true;
  const [lng, lat] = candidate.location.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  // Fall back to exact address + coordinate proximity when upstream ids are coarse.
  const sameAddress = normalizeText(existing.address || "") === normalizeText(candidate.address);
  const closeEnough =
    Math.abs(existing.lat - lat) < 0.0001 && Math.abs(existing.lng - lng) < 0.0001;

  return sameAddress && closeEnough;
}

export function POIManagementDialog({
  open,
  onOpenChange,
  customPois,
  setCustomPois,
  amapApiKey,
  setAmapApiKey,
  currentLat,
  currentLng,
  areaCacheKey,
  searchCity,
}: PoiManagementDialogProps) {
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>("idle");
  const [apiKeyMessage, setApiKeyMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = searchTerm.trim();
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [results, setResults] = useState<AmapSearchResult[]>([]);
  const [resolvedCityCode, setResolvedCityCode] = useState("");

  const normalizedSearchCity = searchCity.trim();
  const normalizedAreaCacheKey = areaCacheKey.trim();
  const cityCodeCacheStorageKey = "maptoposter_amap_citycode_cache";

  const poiOptions = POI_TYPE_CATEGORIES.map((item) => ({
    id: item.id,
    label: getPoiTypeLabel(item.id),
  }));

  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setSearchStatus("idle");
      setSearchMessage("");
      setResults([]);
      setApiKeyStatus("idle");
      setApiKeyMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !amapApiKey.trim()) return;
    if (currentLat === null || currentLng === null) return;
    if (!normalizedAreaCacheKey) return;

    const rawCache = localStorage.getItem(cityCodeCacheStorageKey);
    let parsedCache: Record<string, string> = {};
    try {
      parsedCache = rawCache ? JSON.parse(rawCache) : {};
    } catch {
      parsedCache = {};
    }
    const cachedCityCode = parsedCache[normalizedAreaCacheKey];
    if (cachedCityCode) {
      setResolvedCityCode(cachedCityCode);
      return;
    }

    const controller = new AbortController();
    const resolveCityCode = async () => {
      try {
        const response = await fetch(
          `${AMAP_PROXY_ENDPOINT}/v3/geocode/regeo?key=${encodeURIComponent(amapApiKey)}&location=${encodeURIComponent(`${currentLng},${currentLat}`)}`,
          { signal: controller.signal }
        );
        const payload = await response.json();
        if (!response.ok || payload.status === "0") {
          return;
        }

        const cityCode = String(payload?.regeocode?.addressComponent?.citycode || "").trim();
        if (!cityCode) return;

        parsedCache[normalizedAreaCacheKey] = cityCode;
        localStorage.setItem(cityCodeCacheStorageKey, JSON.stringify(parsedCache));
        setResolvedCityCode(cityCode);
      } catch {
        // Citycode resolution should not block dialog usage.
      }
    };

    void resolveCityCode();

    return () => {
      controller.abort();
    };
  }, [amapApiKey, currentLat, currentLng, normalizedAreaCacheKey, open]);

  useEffect(() => {
    if (!open) return;
    if (!amapApiKey.trim()) {
      setSearchStatus("idle");
      setResults([]);
      return;
    }
    if (!deferredSearchTerm) {
      setSearchStatus("idle");
      setSearchMessage("");
      setResults([]);
      return;
    }
    if (getSearchTermLength(deferredSearchTerm) < MIN_SEARCH_TERM_LENGTH) {
      setSearchStatus("idle");
      setSearchMessage("");
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchStatus("loading");
      setSearchMessage("");
      try {
        const region = resolvedCityCode || normalizedSearchCity;
        const response = await fetch(
          `${AMAP_PROXY_ENDPOINT}/v5/place/text?keywords=${encodeURIComponent(deferredSearchTerm)}&region=${encodeURIComponent(region)}&key=${encodeURIComponent(amapApiKey)}`,
          { signal: controller.signal }
        );
        const payload = await response.json();
        if (!response.ok || payload.status === "0") {
          throw new Error(payload.info || payload.message || m.custom_poi_search_error_generic());
        }

        const pois: AmapSearchResult[] = Array.isArray(payload.pois)
          ? payload.pois
              .filter(
                (item: any) => typeof item.location === "string" && item.location.includes(",")
              )
              .map((item: any) => ({
                id: String(item.id || item.location),
                name: String(item.name || deferredSearchTerm),
                address: String(item.address || ""),
                location: String(item.location),
                citycode: String(item.citycode || ""),
                adcode: String(item.adcode || ""),
                district: String(item.adname || ""),
                city: String(item.cityname || ""),
              }))
          : [];

        setResults(pois);
        if (pois.length === 0) {
          setSearchStatus("empty");
          setSearchMessage(m.custom_poi_search_empty());
          return;
        }

        setSearchStatus("success");
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchStatus("error");
        setSearchMessage(
          error instanceof Error ? error.message : m.custom_poi_search_error_generic()
        );
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [amapApiKey, deferredSearchTerm, normalizedSearchCity, open, resolvedCityCode]);

  const handleTestApiKey = async () => {
    if (!amapApiKey.trim()) {
      setApiKeyStatus("error");
      setApiKeyMessage(m.custom_poi_api_key_missing());
      return;
    }

    setApiKeyStatus("testing");
    setApiKeyMessage("");
    try {
      const testKeyword = "渔人码头";
      const testRegion = resolvedCityCode || normalizedSearchCity || "0757";
      const response = await fetch(
        `${AMAP_PROXY_ENDPOINT}/v5/place/text?keywords=${encodeURIComponent(testKeyword)}&region=${encodeURIComponent(testRegion)}&key=${encodeURIComponent(amapApiKey)}`
      );
      const payload = await response.json();
      if (!response.ok || payload.status === "0" || !Array.isArray(payload.pois)) {
        throw new Error(payload.info || payload.message || m.custom_poi_api_key_invalid());
      }

      setApiKeyStatus("success");
      setApiKeyMessage(m.custom_poi_api_key_valid());
    } catch (error) {
      setApiKeyStatus("error");
      setApiKeyMessage(error instanceof Error ? error.message : m.custom_poi_api_key_invalid());
    }
  };

  const handleAddPoi = (result: AmapSearchResult) => {
    if (customPois.some((item) => isSameResult(item, result))) return;
    const [gcjLng, gcjLat] = result.location.split(",").map(Number);
    if (!Number.isFinite(gcjLat) || !Number.isFinite(gcjLng)) return;
    const [lng, lat] = gcj02ToWgs84(gcjLng, gcjLat);

    const nextPoi: CustomPOI = {
      id: crypto.randomUUID(),
      name: result.name,
      lat,
      lng,
      poiType: DEFAULT_POI_TYPE,
      address: result.address,
      sourceId: result.id,
    };

    setCustomPois([...customPois, nextPoi]);
  };

  const movePoi = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= customPois.length) return;
    const nextPois = [...customPois];
    const [item] = nextPois.splice(index, 1);
    nextPois.splice(nextIndex, 0, item);
    setCustomPois(nextPois);
  };

  const updatePoiType = (id: string, poiType: string) => {
    setCustomPois(customPois.map((item) => (item.id === id ? { ...item, poiType } : item)));
  };

  const removePoi = (id: string) => {
    setCustomPois(customPois.filter((item) => item.id !== id));
  };

  const renderApiMessage = () => {
    if (!apiKeyMessage) return null;
    const isSuccess = apiKeyStatus === "success";
    const Icon = isSuccess ? CheckCircle2 : XCircle;

    return (
      <p
        className={cn(
          "flex items-center gap-2 text-xs",
          isSuccess ? "text-emerald-600" : "text-destructive"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{apiKeyMessage}</span>
      </p>
    );
  };

  const renderSearchBody = () => {
    if (searchStatus === "loading") {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{m.custom_poi_search_loading()}</span>
        </div>
      );
    }

    if (searchStatus === "error" || searchStatus === "empty") {
      return <p className="px-3 py-4 text-xs text-muted-foreground">{searchMessage}</p>;
    }

    if (searchStatus === "idle") {
      return <p className="text-xs text-muted-foreground">{m.custom_poi_search_idle_hint()}</p>;
    }

    return (
      <div className="max-h-[320px] space-y-2 overflow-y-auto custom-scrollbar">
        {results.map((result) => {
          const exists = customPois.some((item) => isSameResult(item, result));
          return (
            <div
              key={result.id}
              className="flex items-center justify-between gap-3 border border-border bg-card px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{result.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.city || ""} {result.district || ""}{" "}
                  {result.address || m.custom_poi_address_missing()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={exists ? "secondary" : "default"}
                disabled={exists}
                onClick={() => handleAddPoi(result)}
              >
                <Plus className="h-4 w-4" />
                {exists ? m.custom_poi_added_short() : m.custom_poi_add_button()}
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[65vw] overflow-hidden border-border bg-background p-0">
        <DialogHeader className="border-b border-border p-6">
          <DialogTitle>{m.custom_poi_dialog_title()}</DialogTitle>
          <DialogDescription>{m.custom_poi_dialog_description()}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-0 md:grid-cols-[1fr_1fr]">
          <section className="border-b border-border px-6 py-2 md:border-b-0 md:border-r">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">
                    1. {m.custom_poi_api_key_label()}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {m.custom_poi_api_key_help()}{" "}
                    <a
                      href={AMAP_API_KEY_TUTORIAL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 transition-opacity hover:opacity-80"
                    >
                      {m.custom_poi_api_key_tutorial()}
                    </a>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={amapApiKey}
                    onChange={(event) => setAmapApiKey(event.target.value)}
                    placeholder={m.custom_poi_api_key_placeholder()}
                    className="border-border bg-card"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestApiKey}
                    disabled={apiKeyStatus === "testing"}
                  >
                    {apiKeyStatus === "testing" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {m.custom_poi_api_key_test_button()}
                  </Button>
                </div>
                {renderApiMessage()}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">
                    2. {m.custom_poi_search_label()}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {m.custom_poi_search_help()}
                    {/* {resolvedCityCode ? ` Citycode: ${resolvedCityCode}` : ""} */}
                  </p>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={m.custom_poi_search_placeholder()}
                    className="border-border bg-card pl-9"
                  />
                </div>
                {renderSearchBody()}
              </div>
            </div>
          </section>

          <section className="px-6 py-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  3. {m.custom_poi_list_title()}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {m.custom_poi_added_count({ count: String(customPois.length) })}
                </p>
              </div>
            </div>

            {customPois.length === 0 ? (
              <div className="text-xs text-muted-foreground">{m.custom_poi_empty_state()}</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {customPois.map((poi, index) => (
                  <div
                    key={poi.id}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(148px,1fr)_auto] items-center gap-3 border-b border-border py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{poi.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {poi.address || `${poi.lat.toFixed(4)}, ${poi.lng.toFixed(4)}`}
                      </p>
                    </div>

                    <Select
                      value={poi.poiType}
                      onValueChange={(value) => updatePoiType(poi.id, value)}
                    >
                      <SelectTrigger size="sm" className="w-full border-border bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {poiOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <span className="flex items-center gap-2">
                              {poiIconUrlMap[option.id] ? (
                                <img
                                  src={poiIconUrlMap[option.id]}
                                  className="h-4 w-4 opacity-70"
                                  alt=""
                                />
                              ) : (
                                <span className="h-4 w-4" />
                              )}
                              {option.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={index === 0}
                        onClick={() => movePoi(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removePoi(poi.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {m.custom_poi_done_button()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
