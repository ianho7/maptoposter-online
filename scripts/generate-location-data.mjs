/**
 * Generate static location data from @countrystatecity/countries
 * Run: node scripts/generate-location-data.mjs
 *
 * Output format: Compact JSON with short field names
 */

import { getCountries, getStatesOfCountry, getAllCitiesOfCountry } from "@countrystatecity/countries";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, "../public/location-data");

async function generateData() {
  console.log("🚀 Starting location data generation (compressed)...\n");

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Created directory: ${OUTPUT_DIR}`);
  }

  // Step 1: Generate countries (compressed fields)
  console.log("📦 Fetching countries...");
  const rawCountries = await getCountries();
  const countries = rawCountries.map((c) => ({
    i: c.id,
    n: c.name,
    i2: c.iso2,
  }));

  const countriesPath = join(OUTPUT_DIR, "countries.json");
  writeFileSync(countriesPath, JSON.stringify(countries));
  console.log(`✓ Generated ${countries.length} countries: ${countriesPath}`);

  // Step 2: Generate states for all countries (compressed fields)
  console.log("\n📦 Fetching states for all countries...");

  const statesByCountry = {};

  for (const country of countries) {
    try {
      const rawStates = await getStatesOfCountry(country.i2);
      const states = rawStates.map((s) => ({
        i: s.id,
        n: s.name,
        i2: s.iso2 || "",
        c: country.i2,
      }));

      statesByCountry[country.i2] = states;

      // Save individual state file (compressed)
      const statesPath = join(OUTPUT_DIR, `states-${country.i2.toLowerCase()}.json`);
      writeFileSync(statesPath, JSON.stringify(states));

      console.log(`  ✓ ${country.i2}: ${states.length} states`);
    } catch (err) {
      console.error(`  ✗ ${country.i2}: Failed - ${err}`);
      const statesPath = join(OUTPUT_DIR, `states-${country.i2.toLowerCase()}.json`);
      writeFileSync(statesPath, JSON.stringify([]));
    }
  }

  // Step 3: Generate cities for ALL countries (compressed fields, all cities)
  console.log("\n📦 Fetching ALL cities for all countries (this may take a while)...");

  let totalCities = 0;
  let processedCountries = 0;

  for (const country of countries) {
    try {
      // Use getAllCitiesOfCountry to get ALL cities
      const rawCities = await getAllCitiesOfCountry(country.i2);

      // Transform with short field names
      const cities = rawCities.map((c, idx) => ({
        i: idx,
        n: c.name,
        la: c.latitude || "0",
        lo: c.longitude || "0",
        si: c.state_id || 0,
        s: c.state_code || "",
        c: country.i2,
      }));

      // Save to file (compressed, no formatting)
      const citiesPath = join(OUTPUT_DIR, `cities-${country.i2.toLowerCase()}.json`);
      writeFileSync(citiesPath, JSON.stringify(cities));

      totalCities += cities.length;
      processedCountries++;

      if (processedCountries % 50 === 0) {
        console.log(`  Progress: ${processedCountries}/${countries.length} countries, ${totalCities} cities`);
      }
    } catch (err) {
      console.error(`  ✗ ${country.i2}: Failed - ${err}`);
      const citiesPath = join(OUTPUT_DIR, `cities-${country.i2.toLowerCase()}.json`);
      writeFileSync(citiesPath, JSON.stringify([]));
    }
  }

  // Generate index file for easy lookup
  const index = {
    v: "1.0.0",
    g: new Date().toISOString(),
    cc: countries.length,
    cn: countries.map((c) => ({ i2: c.i2, n: c.n })),
  };

  const indexPath = join(OUTPUT_DIR, "index.json");
  writeFileSync(indexPath, JSON.stringify(index));
  console.log(`\n✓ Generated index: ${indexPath}`);

  console.log("\n✅ Data generation complete!");
  console.log(`   Output directory: ${OUTPUT_DIR}`);
  console.log(`   Countries: ${countries.length}`);
  console.log(`   Total cities: ${totalCities}`);
}

generateData().catch(console.error);
