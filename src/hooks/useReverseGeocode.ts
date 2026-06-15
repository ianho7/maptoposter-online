import { useRef } from "react";
import { type State, type City, type District, type Country } from "@/services/location-types";
import { type Location } from "@/lib/types";
import { reverseGeocode } from "@/services/reverse-geocoding";
import { createFuse, fuzzySearchOne } from "@/services/fuzzy-matcher";

interface ReverseGeocodeSetters {
  setSelectedCountry: (v: string) => void;
  setSelectedState: (v: string) => void;
  setSelectedCity: (v: string) => void;
  setSelectedDistrict: (v: string) => void;
  setStates: (v: State[]) => void;
  setCities: (v: City[]) => void;
  setDistricts: (v: District[]) => void;
  setIsStatesLoading: (v: boolean) => void;
  setIsCitiesLoading: (v: boolean) => void;
  setIsDistrictsLoading: (v: boolean) => void;
  setLocation: (fn: (prev: Location) => Location) => void;
}

interface UseReverseGeocodeParams {
  countries: Country[];
  getStatesByCountry: (id: number) => Promise<State[]>;
  getCitiesByState: (id: number) => Promise<City[]>;
  getDistrictsByCity: (city: string, state: string, country: string) => Promise<District[]>;
  setters: ReverseGeocodeSetters;
}

/**
 * 反地理编码 Hook
 *
 * 接收坐标 → Nominatim /reverse → 国家/省/市/区匹配 → 同步级联下拉框
 * 内置 300ms 防抖避免频繁请求
 */
export function useReverseGeocode({
  countries,
  getStatesByCountry,
  getCitiesByState,
  getDistrictsByCity,
  setters,
}: UseReverseGeocodeParams): {
  handleCoordinateReverseGeocode: (lat: number, lng: number) => void;
} {
  const reverseGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestRequestIdRef = useRef(0);

  const handleCoordinateReverseGeocode = (lat: number, lng: number) => {
    const requestId = ++latestRequestIdRef.current;

    // 防抖：300ms 内重复调用只执行最后一次
    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }
    reverseGeocodeTimerRef.current = setTimeout(async () => {
      if (requestId !== latestRequestIdRef.current) return;
      console.log(`[GeoMatch] caller triggered: lat=${lat}, lng=${lng}`);
      const result = await reverseGeocode(lat, lng);
      if (requestId !== latestRequestIdRef.current) return;
      if (!result) return;

      const { address } = result;

      // 1. 匹配国家
      const country = countries.find(
        (c) =>
          c.name.toLowerCase() === address.country.toLowerCase() ||
          c.iso2.toLowerCase() === address.countryCode.toLowerCase()
      );
      console.log(
        `[GeoMatch] country: ${address.country}(${address.countryCode})->${country?.name || "×"}`
      );
      if (!country) return;

      setters.setSelectedCountry(country.name);

      // 2. 加载省份，匹配省/州
      setters.setIsStatesLoading(true);
      try {
        const countryStates = await getStatesByCountry(country.id);
        if (requestId !== latestRequestIdRef.current) return;
        setters.setStates(countryStates);
        setters.setIsStatesLoading(false);

        const stateQuery = address.state || address.iso3166_2_lvl4 || "";
        const stateFuse = createFuse(countryStates);
        let matchedState: State | null = null;
        if (address.state) {
          matchedState = fuzzySearchOne<State>(stateFuse, address.state, 0.35);
        }
        // 直辖市降级：ISO3166-2-lvl4 → state.iso2
        if (!matchedState && address.iso3166_2_lvl4) {
          const parts = address.iso3166_2_lvl4.split("-");
          const regionCode = parts[parts.length - 1];
          matchedState =
            countryStates.find((s) => s.iso2.toLowerCase() === regionCode.toLowerCase()) || null;
          if (matchedState) {
            console.log(
              `[GeoMatch] state: iso3166 ${address.iso3166_2_lvl4}->${matchedState.name}`
            );
          }
        }
        console.log(`[GeoMatch] state: ${stateQuery}->${matchedState?.name || "×"}`);
        if (!matchedState) return;

        setters.setSelectedState(matchedState.name);

        // 3. 加载城市，匹配城市名
        setters.setIsCitiesLoading(true);
        const stateCities = await getCitiesByState(matchedState.id);
        if (requestId !== latestRequestIdRef.current) return;
        setters.setCities(stateCities);
        setters.setIsCitiesLoading(false);

        const cityFuse = createFuse(stateCities);
        const rawCityName =
          address.city ||
          address.town ||
          address.village ||
          address.county ||
          address.municipality ||
          address.suburb ||
          address.quarter ||
          matchedState.name;
        const cityName = rawCityName.replace(
          /\s+(District|City|County|Town|Village|Subdistrict|Area)\s*$/,
          ""
        );
        let matchedCity = fuzzySearchOne<City>(cityFuse, cityName, 0.4);

        // County 兜底
        const countyQuery = address.county?.replace(
          /\s+(District|City|County|Town|Village|Subdistrict|Area)\s*$/,
          ""
        );
        if (!matchedCity && countyQuery && countyQuery !== cityName) {
          const countyMatch = fuzzySearchOne<City>(cityFuse, countyQuery, 0.4);
          if (countyMatch) {
            console.log(
              `[GeoMatch] city: ${cityName}->× | county: ${address.county}->${countyMatch.name}`
            );
            matchedCity = countyMatch;
          }
        }
        // 直辖市/特别行政区兜底：用省名匹配城市
        if (!matchedCity) {
          const stateMatch = fuzzySearchOne<City>(cityFuse, matchedState.name, 0.4);
          if (stateMatch) {
            console.log(
              `[GeoMatch] city: ${cityName}->× | state: ${matchedState.name}->${stateMatch.name}`
            );
            matchedCity = stateMatch;
          }
        }
        console.log(`[GeoMatch] city: ${cityName}->${matchedCity?.name || "×"}`);
        if (!matchedCity) return;

        setters.setSelectedCity(matchedCity.name);

        // 4. 加载区/县
        setters.setIsDistrictsLoading(true);
        setters.setDistricts([{ id: 0, name: matchedCity.name, lat, lng }]);
        let matchedDistrictName = matchedCity.name;
        try {
          const apiDistricts = await getDistrictsByCity(
            matchedCity.name,
            matchedState.name,
            country.name
          );
          if (requestId !== latestRequestIdRef.current) return;
          const fullDistricts = [{ id: 0, name: matchedCity.name, lat, lng }, ...apiDistricts];
          setters.setDistricts(fullDistricts);

          const districtQuery = address.town || address.suburb || address.quarter;
          if (districtQuery) {
            const districtFuse = createFuse(fullDistricts);
            const matchedDistrict = fuzzySearchOne<District>(districtFuse, districtQuery, 0.35);
            if (matchedDistrict) {
              matchedDistrictName = matchedDistrict.name;
            }
          }
          setters.setSelectedDistrict(matchedDistrictName);
          console.log(`[GeoMatch] district: ${districtQuery || "(none)"}->${matchedDistrictName}`);
        } catch {
          setters.setSelectedDistrict(matchedCity.name);
          console.log(`[GeoMatch] district: fallback->${matchedCity.name}`);
        }
        setters.setIsDistrictsLoading(false);

        // 5. 更新 location
        if (requestId !== latestRequestIdRef.current) return;
        setters.setLocation((prev) => ({
          ...prev,
          country: country.name,
          state: matchedState.name,
          city: matchedCity.name,
          district: matchedDistrictName,
        }));
      } catch {
        if (requestId !== latestRequestIdRef.current) return;
        setters.setIsStatesLoading(false);
        setters.setIsCitiesLoading(false);
        setters.setIsDistrictsLoading(false);
      }
    }, 300);
  };

  return { handleCoordinateReverseGeocode };
}
