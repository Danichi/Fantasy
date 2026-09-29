const { heightAt, TOWN_R } = await import('/src/world/terrain.ts');
let best = [];
for (let x = -400; x <= 400; x += 8) for (let z = -400; z <= 400; z += 8) {
  const d = Math.hypot(x, z);
  if (d < 130 || d > 320) continue;
  best.push([heightAt(x, z), x, z]);
}
best.sort((a, b) => b[0] - a[0]);
return { top: best.slice(0, 8).map((b) => b.map((n) => Math.round(n))), town: heightAt(0, 0), farm: heightAt(0, 188) };
