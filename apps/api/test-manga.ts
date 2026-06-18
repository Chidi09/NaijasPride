import { AsuraSource } from "./src/modules/books/sources/providers/asura.source";
import { WeebCentralSource } from "./src/modules/books/sources/providers/weebcentral.source";
import { ManhwaTopSource } from "./src/modules/books/sources/providers/manhwatop.source";
import { MangaDexSource } from "./src/modules/books/sources/providers/mangadex.source";

async function testSource(name, SourceClass) {
  console.log(`\n--- Testing ${name} ---`);
  try {
    const source = new SourceClass();
    const result = await source.getDiscoverManga(5);
    console.log(
      `Success! Found ${result.recentlyUpdated?.length} recently updated. First item:`,
      result.recentlyUpdated[0]?.title,
    );
  } catch (err) {
    console.error(`Failed!`, err.message);
  }
}

async function run() {
  await testSource("Asura", AsuraSource);
  await testSource("WeebCentral", WeebCentralSource);
  await testSource("ManhwaTop", ManhwaTopSource);
  await testSource("MangaDex", MangaDexSource);
}

run();
