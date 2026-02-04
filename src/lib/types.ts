export interface MapColors {
  bg: string;
  text: string;
  gradient_color: string;
  water: string;
  parks: string;
  road_motorway: string;
  road_primary: string;
  road_secondary: string;
  road_tertiary: string;
  road_residential: string;
  road_default: string;
  buildings: string;
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
  lat?: number;
  lng?: number;
}

export interface PosterSize {
  id: string;
  name: string;
  width: number;
  height: number;
  aspect: string;
}

export const POSTER_SIZES: PosterSize[] = [
  { id: 'a4-portrait', name: 'A4 Portrait', width: 2480, height: 3508, aspect: '70.7/100' },
  { id: 'a4-landscape', name: 'A4 Landscape', width: 3508, height: 2480, aspect: '100/70.7' },
  { id: 'square', name: 'Square', width: 3000, height: 3000, aspect: '1/1' },
  { id: 'phone', name: 'Phone Wallpaper', width: 1170, height: 2532, aspect: '9/19.5' },
  { id: '16x9', name: '16:9 Desktop', width: 3840, height: 2160, aspect: '16/9' },
];

export const MAP_THEMES: MapTheme[] = [
  {
    id: 'new',
    name: 'Fresh New',
    colors: {
      "bg": "#FAF8F5",
      "text": "#2C2C2C",
      "gradient_color": "#FAF8F5",
      "water": "#E8E4E0",
      "parks": "#F0EDE8",
      "road_motorway": "#8B2500",
      "road_primary": "#4A4A4A",
      "road_secondary": "#6A6A6A",
      "road_tertiary": "#909090",
      "road_residential": "#B8B8B8",
      "road_default": "#909090",
      "buildings": "#D0C8C0",
    }
  },
  {
    id: 'vintage-sepia',
    name: 'Vintage Sepia',
    colors: {
      bg: '#f4e4bc',
      text: '#3d2914',
      gradient_color: '#d4c4a4',
      water: '#a8c8d8',
      parks: '#b8c89c',
      road_motorway: '#8b5a2b',
      road_primary: '#a0522d',
      road_secondary: '#cd853f',
      road_tertiary: '#d2b48c',
      road_residential: '#deb887',
      road_default: '#e8d4b8',
      buildings: '#d4b490',
    }
  },
  {
    id: 'antique-parchment',
    name: 'Antique Parchment',
    colors: {
      bg: '#e8dcc8',
      text: '#2c1810',
      gradient_color: '#d8ccb8',
      water: '#7ba3a8',
      parks: '#8fa880',
      road_motorway: '#5c3317',
      road_primary: '#6b4423',
      road_secondary: '#8b6914',
      road_tertiary: '#a08050',
      road_residential: '#b8a080',
      road_default: '#c8b898',
      buildings: '#c0b090',
    }
  },
  {
    id: 'navy-gold',
    name: 'Navy & Gold',
    colors: {
      bg: '#1a2634',
      text: '#d4af37',
      gradient_color: '#243447',
      water: '#0d1520',
      parks: '#2d4a3e',
      road_motorway: '#d4af37',
      road_primary: '#c9a227',
      road_secondary: '#b8941f',
      road_tertiary: '#8b7355',
      road_residential: '#5c5c5c',
      road_default: '#3a4a5a',
      buildings: '#3a4a5a',
    }
  },
  {
    id: 'forest-expedition',
    name: 'Forest Expedition',
    colors: {
      bg: '#1e2a1e',
      text: '#c8d4b8',
      gradient_color: '#2a3a2a',
      water: '#2a4858',
      parks: '#3a5a3a',
      road_motorway: '#98b888',
      road_primary: '#88a878',
      road_secondary: '#789868',
      road_tertiary: '#688858',
      road_residential: '#587848',
      road_default: '#486838',
      buildings: '#4a6a4a',
    }
  },
  {
    id: 'midnight-atlas',
    name: 'Midnight Atlas',
    colors: {
      bg: '#0f1729',
      text: '#e8e4dc',
      gradient_color: '#1a2439',
      water: '#0a1019',
      parks: '#1a3a2a',
      road_motorway: '#ffffff',
      road_primary: '#e0e0e0',
      road_secondary: '#b0b0b0',
      road_tertiary: '#808080',
      road_residential: '#505050',
      road_default: '#303030',
      buildings: '#2a3a4a',
    }
  },
];

export const EXAMPLE_LOCATIONS = [
  { country: 'France', state: 'Ile-de-France', city: 'Paris', lat: 48.8566, lng: 2.3522 },
  { country: 'Japan', state: 'Tokyo', city: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { country: 'United States', state: 'New York', city: 'New York City', lat: 40.7128, lng: -74.0060 },
  { country: 'Italy', state: 'Lazio', city: 'Rome', lat: 41.9028, lng: 12.4964 },
  { country: 'United Kingdom', state: 'England', city: 'London', lat: 51.5074, lng: -0.1278 },
  { country: 'China', state: 'Shanghai', city: 'Shanghai', lat: 31.2304, lng: 121.4737 },
];
