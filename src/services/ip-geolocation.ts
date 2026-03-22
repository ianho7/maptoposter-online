/**
 * IP Geolocation Service
 * Fetches user location based on IP address
 */

const GEO_API_URL = "https://ip.0v0.one/";

export interface IpGeolocation {
  ip: string;
  country: string; // ISO2 code, e.g., "SG", "CN"
  city: string;
  region: string; // State/Province name, e.g., "Guangdong", "Unknown"
  longitude: number;
  latitude: number;
}

/**
 * Get user geolocation based on IP address
 * @returns Promise<IpGeolocation | null> - Returns null if request fails
 */
export async function getUserGeolocation(): Promise<IpGeolocation | null> {
  try {
    const response = await fetch(GEO_API_URL);
    if (!response.ok) {
      console.error("Failed to fetch geolocation:", response.statusText);
      return null;
    }
    const data = (await response.json()) as IpGeolocation;
    return {
      ...data,
      longitude:
        typeof data.longitude === "number"
          ? data.longitude
          : parseFloat(String(data.longitude)) || 0,
      latitude:
        typeof data.latitude === "number" ? data.latitude : parseFloat(String(data.latitude)) || 0,
    };
  } catch (error) {
    console.error("Error fetching geolocation:", error);
    return null;
  }
}
