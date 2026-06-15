import { gcj02ToWgs84, isOutOfChina, wgs84ToGcj02 } from "./coordinate-systems";

function expectClose(actual: number, expected: number, tolerance: number) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${actual} to be within ${tolerance} of ${expected}`);
  }
}

const beijingWgs84: [number, number] = [116.397128, 39.916527];
const [beijingGcjLng, beijingGcjLat] = wgs84ToGcj02(beijingWgs84[0], beijingWgs84[1]);
const [roundTripLng, roundTripLat] = gcj02ToWgs84(beijingGcjLng, beijingGcjLat);

expectClose(roundTripLng, beijingWgs84[0], 1e-5);
expectClose(roundTripLat, beijingWgs84[1], 1e-5);

const paris: [number, number] = [2.3522, 48.8566];
const [parisLng, parisLat] = gcj02ToWgs84(paris[0], paris[1]);

if (!isOutOfChina(paris[0], paris[1])) {
  throw new Error("Paris should be outside China bounds");
}

expectClose(parisLng, paris[0], 1e-12);
expectClose(parisLat, paris[1], 1e-12);
