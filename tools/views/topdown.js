// Top-down orthographic render of the town for layout planning.
const g = window.__game;
const T = g.THREE;
const R = Number(new URLSearchParams(location.search).get('r') || 120);
const cam = new T.OrthographicCamera(-R, R, R, -R, 1, 800);
cam.position.set(0, 300, 0);
cam.up.set(0, 0, -1);
cam.lookAt(0, 0, 0);
g.grass?.mesh && (g.grass.mesh.visible = false);
const r = g.r.renderer;
const size = r.getSize(new T.Vector2());
r.setRenderTarget(null);
r.setViewport(0, 0, size.y, size.y);
r.render(g.r.scene, cam);
const url = r.domElement.toDataURL('image/png');
document.body.innerHTML = `<img src="${url}" style="position:fixed;left:0;top:0;width:${size.y}px;height:${size.y}px;z-index:99999">`;
await new Promise((res) => setTimeout(res, 300));
return 'ok';
