export function trimCity(city: string): string {
  return city.trim().replace(/\s+/g, ' ');
}

export function isValidCity(city: string): boolean {
  const t = trimCity(city);
  return t.length >= 2 && t.length <= 80;
}
