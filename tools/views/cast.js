// Look-dev: a line-up of built characters in front of the camera at the plaza.
const g = window.__game;
const T = g.THREE;
const { buildCharacter } = await import('/src/npc/charBuilder.ts');
const looks = JSON.parse(decodeURIComponent(new URLSearchParams(location.search).get('looks')));
g.player.teleport(new T.Vector3(0, 0.3, 10));
g.player.yaw = Math.PI;
g.cam.yaw = 0; g.cam.pitch = 0.08; g.cam.distance = 7.2;
document.getElementById('ui').style.visibility = 'hidden';
const out = [];
for (let i = 0; i < looks.length; i++) {
  try {
    const c = await buildCharacter(looks[i], ['idle']);
    const x = (i - (looks.length - 1) / 2) * 1.1;
    c.root.position.set(x, g.player.pos.y - 0.02, 12.5);
    c.root.rotation.y = Number(new URLSearchParams(location.search).get('face') ?? Math.PI);
    g.r.scene.add(c.root);
    const a = c.mixer._actions?.[0] ?? null;
    const clip = c.mixer._actions?.length ? null : null;
    c.mixer.existingAction && 0;
    const acts = c.mixer._actions;
    if (acts && acts[0]) acts[0].play();
    const tick = () => { c.mixer.update(1 / 60); requestAnimationFrame(tick); };
    tick();
    out.push('ok');
  } catch (e) { out.push(String(e).slice(0, 200)); }
}
g.player.char.root.visible = false;
// Freeze the follow camera and frame the line-up from the front.
const side = new URLSearchParams(location.search).get('side') === '1';
g.cam.update = () => {};
const cam = g.r.camera;
const y0 = g.player.pos.y;
cam.position.set(side ? 3.2 : 0, y0 + 1.35, side ? 12.5 : 12.5 - 3.4 * (looks.length > 3 ? 1.25 : 1));
cam.lookAt(0, y0 + 1.0, 12.5);
await new Promise((r) => setTimeout(r, 2500));
return out;
