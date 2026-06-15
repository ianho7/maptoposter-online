export interface MapColors {
  bg: string;
  text: string;
  gradient_color: string;
  poi_color: string;
  poi_icon_color: string;
  water: string;
  parks: string;
  road_motorway: string;
  road_primary: string;
  road_secondary: string;
  road_tertiary: string;
  road_residential: string;
  road_default: string;
}

export interface MapTheme {
  id: string;
  name: string;
  colors: MapColors;
}

export interface Location {
  country: string;
  state: string;
  city: string;
  district?: string;
  lat?: number;
  lng?: number;
}

export type PoiSource = "off" | "overpass" | "custom";

export interface CustomPOITypeCategory {
  id: string;
  labelKey: string;
}

export interface CustomPOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  poiType: string;
  address?: string;
  sourceId?: string;
}

export const POI_TYPE_CATEGORIES: CustomPOITypeCategory[] = [
  { id: "cafe", labelKey: "poi_type_cafe" },
  { id: "restaurant", labelKey: "poi_type_restaurant" },
  { id: "snack_bar", labelKey: "poi_type_snack_bar" },
  { id: "bakery", labelKey: "poi_type_bakery" },
  { id: "bar", labelKey: "poi_type_bar" },
  { id: "tea_shop", labelKey: "poi_type_tea_shop" },
  { id: "hotpot", labelKey: "poi_type_hotpot" },
  { id: "bbq", labelKey: "poi_type_bbq" },
  { id: "park", labelKey: "poi_type_park" },
  { id: "sightseeing_spot", labelKey: "poi_type_sightseeing_spot" },
  { id: "museum", labelKey: "poi_type_museum" },
  { id: "landmark", labelKey: "poi_type_landmark" },
  { id: "art_gallery", labelKey: "poi_type_art_gallery" },
  { id: "theme_park", labelKey: "poi_type_theme_park" },
  { id: "zoo_aquarium", labelKey: "poi_type_zoo_aquarium" },
  { id: "historical_site", labelKey: "poi_type_historical_site" },
  { id: "accommodation", labelKey: "poi_type_accommodation" },
  { id: "resort", labelKey: "poi_type_resort" },
  { id: "mall", labelKey: "poi_type_mall" },
  { id: "market", labelKey: "poi_type_market" },
  { id: "duty_free", labelKey: "poi_type_duty_free" },
  { id: "bookstore", labelKey: "poi_type_bookstore" },
  { id: "souvenir_shop", labelKey: "poi_type_souvenir_shop" },
  { id: "beach", labelKey: "poi_type_beach" },
  { id: "mountain", labelKey: "poi_type_mountain" },
  { id: "lake", labelKey: "poi_type_lake" },
  { id: "forest", labelKey: "poi_type_forest" },
  { id: "waterfall", labelKey: "poi_type_waterfall" },
  { id: "garden", labelKey: "poi_type_garden" },
  { id: "temple", labelKey: "poi_type_temple" },
  { id: "church", labelKey: "poi_type_church" },
  { id: "cultural_street", labelKey: "poi_type_cultural_street" },
  { id: "theater", labelKey: "poi_type_theater" },
  { id: "cinema", labelKey: "poi_type_cinema" },
  { id: "ktv", labelKey: "poi_type_ktv" },
  { id: "spa_wellness", labelKey: "poi_type_spa_wellness" },
  { id: "fitness_center", labelKey: "poi_type_fitness_center" },
  { id: "camping_site", labelKey: "poi_type_camping_site" },
  { id: "airport", labelKey: "poi_type_airport" },
  { id: "train_station", labelKey: "poi_type_train_station" },
  { id: "subway_station", labelKey: "poi_type_subway_station" },
  { id: "bus_station", labelKey: "poi_type_bus_station" },
  { id: "port", labelKey: "poi_type_port" },
  { id: "hospital", labelKey: "poi_type_hospital" },
  { id: "bank", labelKey: "poi_type_bank" },
  { id: "post_office", labelKey: "poi_type_post_office" },
  { id: "police_station", labelKey: "poi_type_police_station" },
  { id: "pharmacy", labelKey: "poi_type_pharmacy" },
];

// Point = [lon, lat] in GeoJSON/Overpass/OSM convention
export type Point = [number, number];

export interface PosterSize {
  id: string;
  name: string;
  width: number;
  height: number;
  aspect: string;
}

export const POSTER_SIZES: PosterSize[] = [
  {
    id: "a4-portrait",
    name: "A4 Portrait (1:1.414)",
    width: 2480,
    height: 3508,
    aspect: "70.7/100",
  },
  {
    id: "a4-landscape",
    name: "A4 Landscape (1.414:1)",
    width: 3508,
    height: 2480,
    aspect: "100/70.7",
  },
  { id: "square", name: "Square Poster (1:1)", width: 3000, height: 3000, aspect: "1/1" },
  {
    id: "poster-9x16-portrait",
    name: "Portrait Poster (9:16)",
    width: 2160,
    height: 3840,
    aspect: "9/16",
  },
  {
    id: "poster-4x3-landscape",
    name: "Landscape Poster (4:3)",
    width: 3200,
    height: 2400,
    aspect: "4/3",
  },
  { id: "16x9", name: "Landscape Poster (16:9)", width: 3840, height: 2160, aspect: "16/9" },
];

export const MAP_THEMES: MapTheme[] = [
  {
    id: "Nordic-Frost",
    name: "Nordic Frost",
    colors: {
      bg: "#F0F4F7",
      text: "#2C3E50",
      gradient_color: "#F0F4F7",
      poi_color: "#00A8E8",
      poi_icon_color: "#F4F9FC",
      water: "#D1EAF0",
      parks: "#E2E9E1",
      road_motorway: "#2C3E50",
      road_primary: "#5D6D7E",
      road_secondary: "#85929E",
      road_tertiary: "#AEB6BF",
      road_residential: "#D6DBDF",
      road_default: "#AEB6BF",
    },
  },
  {
    id: "Desert-Rose",
    name: "Desert Rose",
    colors: {
      bg: "#F9F1ED",
      text: "#8E5B4A",
      gradient_color: "#F9F1ED",
      poi_color: "#006D77",
      poi_icon_color: "#FAF2EC",
      water: "#D8E2DC",
      parks: "#EAE2CF",
      road_motorway: "#D67D61",
      road_primary: "#B07D62",
      road_secondary: "#D4A373",
      road_tertiary: "#E2BCA4",
      road_residential: "#EAD7D1",
      road_default: "#E2BCA4",
    },
  },
  {
    id: "Cyberpunk-Neon",
    name: "Cyberpunk Neon",
    colors: {
      bg: "#0D0221",
      text: "#00F2FF",
      gradient_color: "#0D0221",
      poi_color: "#CCFF00",
      poi_icon_color: "#150A2E",
      water: "#0F0535",
      parks: "#1A1B41",
      road_motorway: "#FF00FF",
      road_primary: "#00F2FF",
      road_secondary: "#7000FF",
      road_tertiary: "#4B0082",
      road_residential: "#241744",
      road_default: "#4B0082",
    },
  },
  {
    id: "Sulfur-Slate",
    name: "Sulfur & Slate",
    colors: {
      bg: "#222222",
      text: "#FFD700",
      gradient_color: "#222222",
      poi_color: "#FFFFFF",
      poi_icon_color: "#1A1A1A",
      water: "#1A1A1A",
      parks: "#2A2A2A",
      road_motorway: "#FFD700",
      road_primary: "#C0C0C0",
      road_secondary: "#808080",
      road_tertiary: "#505050",
      road_residential: "#333333",
      road_default: "#505050",
    },
  },
  {
    id: "Vintage-Nautical",
    name: "Vintage Nautical",
    colors: {
      bg: "#E8DCC4",
      text: "#1B3B5A",
      gradient_color: "#E8DCC4",
      poi_color: "#A61C1C",
      poi_icon_color: "#F9F2E2",
      water: "#B4C4D0",
      parks: "#C8D1B7",
      road_motorway: "#1B3B5A",
      road_primary: "#3E5C76",
      road_secondary: "#748CAB",
      road_tertiary: "#A2ABB5",
      road_residential: "#C5CCD3",
      road_default: "#A2ABB5",
    },
  },
  {
    id: "Lavender-Mist",
    name: "Lavender Mist",
    colors: {
      bg: "#F5F3F7",
      text: "#5B4D84",
      gradient_color: "#F5F3F7",
      poi_color: "#312651",
      poi_icon_color: "#FAF8FC",
      water: "#E0E1F0",
      parks: "#E8F0E8",
      road_motorway: "#5B4D84",
      road_primary: "#7B6E9F",
      road_secondary: "#9D92BD",
      road_tertiary: "#BEB7D8",
      road_residential: "#DFDBED",
      road_default: "#BEB7D8",
    },
  },
  {
    id: "Carbon-Fiber",
    name: "Carbon Fiber",
    colors: {
      bg: "#000000",
      text: "#FFFFFF",
      gradient_color: "#000000",
      poi_color: "#39FF14",
      poi_icon_color: "#141414",
      water: "#080808",
      parks: "#111111",
      road_motorway: "#E63946",
      road_primary: "#FFFFFF",
      road_secondary: "#B0B0B0",
      road_tertiary: "#606060",
      road_residential: "#303030",
      road_default: "#606060",
    },
  },
  {
    id: "Mediterranean-Summer",
    name: "Mediterranean Summer",
    colors: {
      bg: "#FFFFFF",
      text: "#005F73",
      gradient_color: "#FFFFFF",
      poi_color: "#FFD100",
      poi_icon_color: "#003D49",
      water: "#008BB9",
      parks: "#94D2BD",
      road_motorway: "#EE9B00",
      road_primary: "#CA6702",
      road_secondary: "#BB3E03",
      road_tertiary: "#AE2012",
      road_residential: "#9B2226",
      road_default: "#AE2012",
    },
  },
  {
    id: "Royal-Velvet",
    name: "Royal Velvet",
    colors: {
      bg: "#2D1B33",
      text: "#E0E0E0",
      gradient_color: "#2D1B33",
      poi_color: "#E0115F",
      poi_icon_color: "#F4EFF4",
      water: "#1F1224",
      parks: "#3A2B42",
      road_motorway: "#C0C0C0",
      road_primary: "#A8A8A8",
      road_secondary: "#888888",
      road_tertiary: "#666666",
      road_residential: "#4A3B52",
      road_default: "#666666",
    },
  },
  {
    id: "Forest-Moss",
    name: "Forest Moss",
    colors: {
      bg: "#0B1A13",
      text: "#D4AF37",
      gradient_color: "#0B1A13",
      poi_color: "#FF595E",
      poi_icon_color: "#FCEEEC",
      water: "#050F0B",
      parks: "#0F261B",
      road_motorway: "#F9D067",
      road_primary: "#D4AF37",
      road_secondary: "#A68930",
      road_tertiary: "#7A6424",
      road_residential: "#4D3F16",
      road_default: "#7A6424",
    },
  },
  {
    id: "Cotton-Candy",
    name: "Cotton Candy",
    colors: {
      bg: "#FFF5F8",
      text: "#6E5A7E",
      gradient_color: "#FFF5F8",
      poi_color: "#FF9EC7",
      poi_icon_color: "#3D2E4D",
      water: "#D0EFFF",
      parks: "#E0FBEF",
      road_motorway: "#B39DDB",
      road_primary: "#CE93D8",
      road_secondary: "#F48FB1",
      road_tertiary: "#FCE4EC",
      road_residential: "#FFFFFF",
      road_default: "#FCE4EC",
    },
  },
  {
    id: "Brutalist-Concrete",
    name: "Brutalist Concrete",
    colors: {
      bg: "#D6D6D6",
      text: "#1A1A1A",
      gradient_color: "#D6D6D6",
      poi_color: "#FFD700",
      poi_icon_color: "#1A1A1A",
      water: "#A0A0A0",
      parks: "#C0C0C0",
      road_motorway: "#FF4500",
      road_primary: "#2D2D2D",
      road_secondary: "#555555",
      road_tertiary: "#888888",
      road_residential: "#B0B0B0",
      road_default: "#888888",
    },
  },
  {
    id: "Solarized-Dark",
    name: "Solarized Dark",
    colors: {
      bg: "#002B36",
      text: "#839496",
      gradient_color: "#002B36",
      poi_color: "#268BD2",
      poi_icon_color: "#03191F",
      water: "#073642",
      parks: "#586E75",
      road_motorway: "#CB4B16",
      road_primary: "#B58900",
      road_secondary: "#859900",
      road_tertiary: "#93A1A1",
      road_residential: "#073642",
      road_default: "#93A1A1",
    },
  },
  {
    id: "Matcha-Latte",
    name: "Matcha Latte",
    colors: {
      bg: "#F1F5E8",
      text: "#3E4C33",
      gradient_color: "#F1F5E8",
      poi_color: "#81B622",
      poi_icon_color: "#33402A",
      water: "#C8D9B6",
      parks: "#DCE5D1",
      road_motorway: "#597D35",
      road_primary: "#719554",
      road_secondary: "#A1C181",
      road_tertiary: "#BFD8AF",
      road_residential: "#FFFFFF",
      road_default: "#BFD8AF",
    },
  },
  {
    id: "Red-Alert",
    name: "Red Alert",
    colors: {
      bg: "#0A0A0A",
      text: "#FF0000",
      gradient_color: "#0A0A0A",
      poi_color: "#FFFFFF",
      poi_icon_color: "#160606",
      water: "#000000",
      parks: "#151515",
      road_motorway: "#FF0000",
      road_primary: "#B30000",
      road_secondary: "#800000",
      road_tertiary: "#4D0000",
      road_residential: "#2A2A2A",
      road_default: "#4D0000",
    },
  },
  {
    id: "Gilded-Noir",
    name: "Gilded Noir",
    colors: {
      bg: "#121212",
      text: "#E5C100",
      gradient_color: "#121212",
      poi_color: "#FFFAF0",
      poi_icon_color: "#1B1606",
      water: "#0D0D0D",
      parks: "#1F1F1F",
      road_motorway: "#FFD700",
      road_primary: "#C5A059",
      road_secondary: "#8E793E",
      road_tertiary: "#635634",
      road_residential: "#3D3728",
      road_default: "#635634",
    },
  },
  {
    id: "Ocean-Abyss",
    name: "Ocean Abyss",
    colors: {
      bg: "#020817",
      text: "#00D1FF",
      gradient_color: "#020817",
      poi_color: "#FFFFFF",
      poi_icon_color: "#03121F",
      water: "#01050D",
      parks: "#04142B",
      road_motorway: "#00E5FF",
      road_primary: "#00A3B5",
      road_secondary: "#007A8A",
      road_tertiary: "#004D57",
      road_residential: "#00282E",
      road_default: "#004D57",
    },
  },
  {
    id: "Sakura-Branch",
    name: "Sakura Branch",
    colors: {
      bg: "#FFFFFF",
      text: "#4A4A4A",
      gradient_color: "#FFFFFF",
      poi_color: "#FF1493",
      poi_icon_color: "#FDF2F7",
      water: "#F0F8FF",
      parks: "#F5F5F5",
      road_motorway: "#FFB7C5",
      road_primary: "#8E8E8E",
      road_secondary: "#B0B0B0",
      road_tertiary: "#D3D3D3",
      road_residential: "#F0F0F0",
      road_default: "#D3D3D3",
    },
  },
  {
    id: "Terra-Clay",
    name: "Terra Clay",
    colors: {
      bg: "#FFF8F2",
      text: "#7A3E3E",
      gradient_color: "#FFF8F2",
      poi_color: "#D2691E",
      poi_icon_color: "#FCF3EA",
      water: "#E0DAD5",
      parks: "#E8E2DD",
      road_motorway: "#A0522D",
      road_primary: "#BC8F8F",
      road_secondary: "#CD853F",
      road_tertiary: "#D2B48C",
      road_residential: "#EADBC8",
      road_default: "#D2B48C",
    },
  },
  {
    id: "Glitch-Purple",
    name: "Glitch Purple",
    colors: {
      bg: "#2B0032",
      text: "#32FF7E",
      gradient_color: "#2B0032",
      poi_color: "#FF0055",
      poi_icon_color: "#1C0024",
      water: "#1A0020",
      parks: "#3B0045",
      road_motorway: "#32FF7E",
      road_primary: "#7158E2",
      road_secondary: "#CD84F1",
      road_tertiary: "#4B0082",
      road_residential: "#1A0020",
      road_default: "#4B0082",
    },
  },
];

export const EXAMPLE_LOCATIONS = [
  { country: "France", state: "Ile-de-France", city: "Paris", lat: 48.8566, lng: 2.3522 },
  { country: "Japan", state: "Tokyo", city: "Tokyo", lat: 35.6762, lng: 139.6503 },
  {
    country: "United States",
    state: "New York",
    city: "New York City",
    lat: 40.7128,
    lng: -74.006,
  },
  { country: "Italy", state: "Lazio", city: "Rome", lat: 41.9028, lng: 12.4964 },
  { country: "United Kingdom", state: "England", city: "London", lat: 51.5074, lng: -0.1278 },
  { country: "China", state: "Shanghai", city: "Shanghai", lat: 31.2304, lng: 121.4737 },
];
