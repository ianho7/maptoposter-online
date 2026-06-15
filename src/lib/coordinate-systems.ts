const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(x: number, y: number) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x: number, y: number) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

function delta(lng: number, lat: number): [number, number] {
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLon(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  const magic = Math.sin(radLat);
  const sqrtMagic = Math.sqrt(1 - EE * magic * magic);

  const adjustedLat =
    (dLat * 180.0) / (((A * (1 - EE)) / ((1 - EE * magic * magic) * sqrtMagic)) * PI);
  const adjustedLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);

  return [adjustedLng, adjustedLat];
}

export function isOutOfChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (isOutOfChina(lng, lat)) {
    return [lng, lat];
  }

  const [dLng, dLat] = delta(lng, lat);
  return [lng + dLng, lat + dLat];
}

export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (isOutOfChina(lng, lat)) {
    return [lng, lat];
  }

  let minLng = lng - 0.01;
  let maxLng = lng + 0.01;
  let minLat = lat - 0.01;
  let maxLat = lat + 0.01;

  let wgsLng = lng;
  let wgsLat = lat;

  for (let i = 0; i < 30; i += 1) {
    wgsLng = (minLng + maxLng) / 2;
    wgsLat = (minLat + maxLat) / 2;
    const [mappedLng, mappedLat] = wgs84ToGcj02(wgsLng, wgsLat);
    const lngDiff = mappedLng - lng;
    const latDiff = mappedLat - lat;

    if (Math.abs(lngDiff) < 1e-7 && Math.abs(latDiff) < 1e-7) {
      break;
    }

    if (lngDiff > 0) {
      maxLng = wgsLng;
    } else {
      minLng = wgsLng;
    }

    if (latDiff > 0) {
      maxLat = wgsLat;
    } else {
      minLat = wgsLat;
    }
  }

  return [wgsLng, wgsLat];
}
