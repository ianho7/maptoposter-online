import { describe, expect, it } from "bun:test";

import {
  buildResolvedLocation,
  coalesceCoordinates,
  namesReferToSameLocation,
  parseCityCoordinates,
  resolveCitySelection,
} from "./location-resolution";
import type { City, State } from "./location-types";

describe("location resolution", () => {
  const dublinCounty: State = {
    id: 1072,
    country_id: 105,
    name: "Dublin",
    iso2: "D",
  };

  it("prefers exact state_id city matches for normal regions", () => {
    const cities: City[] = [
      {
        id: 1,
        state_id: 10,
        country_id: 33,
        name: "Paris",
        latitude: "48.8566",
        longitude: "2.3522",
        stateCode: "IDF",
      },
    ];

    const result = resolveCitySelection(
      {
        requestedCityName: "Paris",
        state: { id: 10, name: "Ile-de-France", iso2: "IDF" },
        stateCities: cities,
      },
      null
    );

    expect(result).toEqual({
      resolvedCityName: "Paris",
      coordinates: { lat: 48.8566, lng: 2.3522 },
      usedFallback: false,
    });
  });

  it("uses a narrow same-name fallback for broken Dublin hierarchy data", () => {
    const cities: City[] = [
      {
        id: 57223,
        state_id: 1073,
        country_id: 105,
        name: "Dublin",
        latitude: "53.33306",
        longitude: "-6.24889",
        stateCode: "L",
      },
    ];

    const result = resolveCitySelection(
      {
        requestedCityName: "Dublin",
        state: dublinCounty,
        stateCities: cities,
      },
      null
    );

    expect(result).toEqual({
      resolvedCityName: "Dublin",
      coordinates: { lat: 53.33306, lng: -6.24889 },
      usedFallback: false,
    });
  });

  it("keeps empty state results unresolved until a broader verified fallback is provided", () => {
    const result = resolveCitySelection(
      {
        requestedCityName: "Dublin",
        state: dublinCounty,
        stateCities: [],
      },
      null
    );

    expect(result).toEqual({
      resolvedCityName: "Dublin",
      coordinates: null,
      usedFallback: false,
    });
  });

  it("does not apply fallback to unrelated same-country cities", () => {
    const cities: City[] = [
      {
        id: 2,
        state_id: 10,
        country_id: 840,
        name: "Buffalo",
        latitude: "42.8864",
        longitude: "-78.8784",
        stateCode: "NY",
      },
    ];

    const result = resolveCitySelection(
      {
        requestedCityName: "New York",
        state: { id: 10, name: "New York", iso2: "NY" },
        stateCities: cities,
      },
      null
    );

    expect(result).toEqual({
      resolvedCityName: "New York",
      coordinates: null,
      usedFallback: false,
    });
  });

  it("preserves unresolved locations without injecting 0,0 coordinates", () => {
    const location = buildResolvedLocation({
      country: "Ireland",
      state: "Dublin",
      city: "Dublin",
      district: "Dublin",
      coordinates: undefined,
    });

    expect(location).toEqual({
      country: "Ireland",
      state: "Dublin",
      city: "Dublin",
      district: "Dublin",
    });
  });

  it("reuses saved coordinates during restore when a city name resolves but fresh coordinates do not", () => {
    expect(
      coalesceCoordinates(null, {
        lat: 30.6599,
        lng: 104.0633,
      })
    ).toEqual({ lat: 30.6599, lng: 104.0633 });

    expect(coalesceCoordinates(null, { lat: undefined, lng: undefined })).toBeUndefined();
  });

  it("normalizes equivalent location names and extracts coordinates", () => {
    expect(namesReferToSameLocation("New York", "new-york")).toBe(true);
    expect(
      parseCityCoordinates({
        id: 3,
        state_id: 31,
        country_id: 156,
        name: "Shanghai",
        latitude: "31.2304",
        longitude: "121.4737",
      })
    ).toEqual({ lat: 31.2304, lng: 121.4737 });
  });
});
