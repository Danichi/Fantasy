// Free camera: --query="test&from=x,y,z&at=x,y,z[&hud=1]" (y relative to ground).
const g = window.__game;
const T = g.THREE;
const { heightAt } = await import('/src/world/terrain.ts');
const q = new URLSearchParams(location.search);
const [fx, fy, fz] = q.get('from').split(',').map(Number);
const [ax, ay, az] = q.get('at').split(',').map(Number);
if (!q.get('hud')) document.getElementById('ui').style.visibility = 'hidden';
g.player.teleport(new T.Vector3(fx, heightAt(fx, fz) + 0.3, fz));
if (!q.get('player')) g.player.char.root.visible = false;
await new Promise((r) => setTimeout(r, 1500));
g.cam.update = () => {};
g.r.camera.position.set(fx, heightAt(fx, fz) + fy, fz);
g.r.camera.lookAt(ax, heightAt(ax, az) + ay, az);
await new Promise((r) => setTimeout(r, 3000));
return 'ok';
