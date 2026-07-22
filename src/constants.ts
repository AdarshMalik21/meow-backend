import { isAllowedCity, normalizeCity } from './services/cityDirectory';

export function trimCity(city: string): string {
  return city.trim().replace(/\s+/g, ' ');
}

/** City must exist in the directory whitelist. */
export function isValidCity(city: string): boolean {
  return isAllowedCity(trimCity(city));
}

/** Returns canonical directory name or null. */
export function resolveCity(city: string): string | null {
  return normalizeCity(trimCity(city));
}
