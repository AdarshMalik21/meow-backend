import corridorsData from '../data/corridors.json';
import { expandCityForSearch, normalizeCity } from './cityDirectory';

export type Corridor = {
  id: string;
  cities: string[];
};

const CORRIDORS: Corridor[] = corridorsData;

function cityIndex(cities: string[], city: string): number {
  const variants = expandCityForSearch(city);
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i].toLowerCase();
    if (variants.some((v) => v.toLowerCase() === c)) return i;
  }
  return -1;
}

function citiesEqual(a: string, b: string): boolean {
  const na = normalizeCity(a);
  const nb = normalizeCity(b);
  if (!na || !nb) return a.toLowerCase() === b.toLowerCase();
  return na.toLowerCase() === nb.toLowerCase();
}

type CorridorMatch = {
  corridor: Corridor;
  fromIdx: number;
  toIdx: number;
};

function findAllCorridorMatches(fromCity: string, toCity: string): CorridorMatch[] {
  const matches: CorridorMatch[] = [];
  for (const corridor of CORRIDORS) {
    const fromIdx = cityIndex(corridor.cities, fromCity);
    const toIdx = cityIndex(corridor.cities, toCity);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
      matches.push({ corridor, fromIdx, toIdx });
    }
  }
  return matches;
}

export function getPathCities(fromCity: string, toCity: string): {
  corridorFound: boolean;
  corridorId: string | null;
  intermediateCities: string[];
  driverFrom: string;
  driverTo: string;
} {
  const driverFrom = normalizeCity(fromCity) ?? fromCity;
  const driverTo = normalizeCity(toCity) ?? toCity;
  const matches = findAllCorridorMatches(driverFrom, driverTo);

  if (matches.length === 0) {
    return {
      corridorFound: false,
      corridorId: null,
      intermediateCities: [],
      driverFrom,
      driverTo,
    };
  }

  const seen = new Set<string>();
  const intermediateCities: string[] = [];

  for (const { corridor, fromIdx, toIdx } of matches) {
    for (let i = fromIdx + 1; i < toIdx; i++) {
      const city = corridor.cities[i];
      const key = city.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        intermediateCities.push(city);
      }
    }
  }

  return {
    corridorFound: true,
    corridorId: matches[0].corridor.id,
    intermediateCities,
    driverFrom,
    driverTo,
  };
}

/** Valid pickup stop: driver origin or an intermediate city on a matching corridor. */
export function validatePickupStops(
  fromCity: string,
  toCity: string,
  stops: string[]
): { ok: true; pickupStops: string[]; corridorId: string | null } | { ok: false; error: string } {
  const driverFrom = normalizeCity(fromCity);
  const driverTo = normalizeCity(toCity);
  if (!driverFrom || !driverTo) {
    return { ok: false, error: 'Pick valid cities from the list.' };
  }

  const path = getPathCities(driverFrom, driverTo);
  const allowed = new Set<string>([driverFrom.toLowerCase()]);
  for (const city of path.intermediateCities) {
    allowed.add(city.toLowerCase());
  }

  const canonicalStops: string[] = [driverFrom];
  const seen = new Set<string>([driverFrom.toLowerCase()]);

  for (const raw of stops) {
    const city = normalizeCity(raw);
    if (!city) {
      return { ok: false, error: `"${raw}" is not a valid city.` };
    }
    if (citiesEqual(city, driverTo)) {
      return { ok: false, error: 'Destination cannot be a pickup stop.' };
    }
    if (!allowed.has(city.toLowerCase())) {
      return {
        ok: false,
        error: `${city} is not on the route between ${driverFrom} and ${driverTo}.`,
      };
    }
    if (!seen.has(city.toLowerCase())) {
      seen.add(city.toLowerCase());
      if (!citiesEqual(city, driverFrom)) {
        canonicalStops.push(city);
      }
    }
  }

  return {
    ok: true,
    pickupStops: canonicalStops,
    corridorId: path.corridorId,
  };
}

export function riderMatchesRide(
  ride: { fromCity: string; toCity: string; pickupStops: string[] },
  riderFrom: string,
  riderTo: string
): 'exact' | 'viaStop' | null {
  const rf = normalizeCity(riderFrom);
  const rt = normalizeCity(riderTo);
  if (!rf || !rt) return null;

  if (!citiesEqual(ride.toCity, rt)) return null;

  if (citiesEqual(ride.fromCity, rf)) return 'exact';

  const stops = ride.pickupStops ?? [];
  if (stops.some((s) => citiesEqual(s, rf))) return 'viaStop';

  return null;
}
