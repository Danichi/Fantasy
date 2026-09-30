// Explore a route, then open the world map.
const g = window.__game;
const T = g.THREE;
const { heightAt } = await import('/src/world/terrainHeight.ts');
const route = [[0, 10], [600, 90], [1300, 140], [2000, 150], [2700, 150], [1500, -1200], [0, -2200], [-2000, -900], [-3300, -1000]];
for (const [x, z] of route) {
  g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.4, z));
  await new Promise((r) => setTimeout(r, 900));
}
g.player.teleport(new T.Vector3(2700, heightAt(2700, 150) + 0.4, 150));
await new Promise((r) => setTimeout(r, 1500));
g.worldMap.toggle(true);
await new Promise((r) => setTimeout(r, 1200));
return { regions: [...g.discovery.regions], places: Object.fromEntries(g.discovery.places) };
