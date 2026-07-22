/**
 * One-time script: extract city names from docs/city_directory PDF → data/cities.json
 * Run: npx tsx scripts/extract-cities-from-pdf.ts
 */
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

const PDF_PATH = path.join(__dirname, '../../docs/city_directory (1).pdf');
const OUT_PATH = path.join(__dirname, '../src/data/cities.json');

function parseCities(text: string): string[] {
  const cities: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[•\u2022·]\s*(.+)$/);
    if (!match) continue;
    let name = match[1].trim();
    // Skip page headers/footers accidentally captured
    if (/^Regional Cities Directory|^Page \d+/i.test(name)) continue;
    if (/^-- \d+ of \d+ --/.test(name)) continue;
    // Normalize alternate names: keep display form as in PDF
    if (name.length >= 2 && name.length <= 80) {
      cities.push(name);
    }
  }
  // Deduplicate case-insensitively, keep first canonical spelling
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of cities) {
    const key = c.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

async function main() {
  const buffer = fs.readFileSync(PDF_PATH);
  const { text } = await pdf(buffer);
  const cities = parseCities(text);
  if (cities.length < 100) {
    console.error('Too few cities extracted:', cities.length);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(cities, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${cities.length} cities to ${OUT_PATH}`);
  console.log('Sample:', cities.slice(0, 5).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
