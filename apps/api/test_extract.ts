import { RemoteStreamResolverService } from "./src/modules/movies/remote-stream-resolver.service";

async function main() {
  const service = new RemoteStreamResolverService();
  console.time("extract");
  try {
    const res = await service.resolveFromPage("https://embed.smashystream.com/playere.php?tmdb=533535&season=1&episode=1", { timeoutMs: 45000 });
    console.log(res);
  } catch(e) {
    console.error(e);
  }
  console.timeEnd("extract");
  process.exit(0);
}

main();
