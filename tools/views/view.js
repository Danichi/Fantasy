// Look-dev camera for tools/shot.mjs: --script=tools/views/view.js --query=test&view=x,z,yaw,pitch,dist[,hud]
const g = window.__game;
const [x, z, yaw, pitch, dist, hud] = new URLSearchParams(location.search).get('view').split(',').map(Number);
const T = g.THREE;
const { heightAt } = await import('/src/world/terrain.ts');
g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.3, z));
for (let i = 0; i < 40 && !g.player.grounded; i++) await new Promise((r) => setTimeout(r, 50));
g.player.yaw = yaw;
g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.distance = dist;
g.cam.snapTo?.(g.player.pos);
if (!hud) document.getElementById('ui').style.visibility = 'hidden';
await new Promise((r) => setTimeout(r, 2500));
return { pos: g.player.pos.toArray().map((n) => +n.toFixed(1)), fps: window.__fps };
