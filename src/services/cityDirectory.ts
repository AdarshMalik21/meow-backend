import citiesData from '../data/cities.json';

const CITIES: readonly string[] = citiesData;

/** Lowercase key → canonical display name */
const byLower = new Map<string, string>();
for (const name of CITIES) {
  byLower.set(name.toLowerCase(), name);
}

export function getAllCities(): readonly string[] {
  return CITIES;
}

export function normalizeCity(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return byLower.get(trimmed.toLowerCase()) ?? null;
}

export function isAllowedCity(input: string): boolean {
  return normalizeCity(input) !== null;
}

export function searchCities(query: string, limit = 15): string[] {
  const q = query.trim().toLowerCase();
  const cap = Math.min(Math.max(limit, 1), 30);

  if (!q) {
    return CITIES.slice(0, cap);
  }

  const prefix: string[] = [];
  const substring: string[] = [];

  for (const city of CITIES) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q)) {
      prefix.push(city);
    } else if (lower.includes(q)) {
      substring.push(city);
    }
    if (prefix.length + substring.length >= cap * 2) break;
  }

  return [...prefix, ...substring].slice(0, cap);
}
