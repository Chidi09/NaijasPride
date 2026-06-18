const { ANIME } = require('@consumet/extensions');
(async () => {
  try {
    const hianime = new ANIME.Hianime();
    const sources = await hianime.fetchEpisodeSources('one-piece-episode-1$sub');
    console.log(JSON.stringify(sources, null, 2));
  } catch (e) {
    console.error(e);
  }
})();
