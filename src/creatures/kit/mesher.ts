import type { Sculpt } from './sdf';

// Field to mesh: surface nets on a fine grid, then every vertex is pulled
// exactly onto the surface and relaxed so the triangles are even, and the
// normals come straight from the field's gradient (glassy smooth shading).
// Far from the surface the grid is filled from a coarse pass, which keeps a
// 2 cm sculpt to a few hundred milliseconds.

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export function meshSculpt(S: Sculpt, cell: number, relax = 2): MeshData {
  const B = S.bounds(cell * 3);
  const ox = B.min.x, oy = B.min.y, oz = B.min.z;
  const nx = Math.ceil((B.max.x - ox) / cell) + 1;
  const ny = Math.ceil((B.max.y - oy) / cell) + 1;
  const nz = Math.ceil((B.max.z - oz) / cell) + 1;
  const F = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // Coarse pass.
  const C = 4;
  const cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const G = new Float32Array(cx * cy * cz);
  const gat = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) G[gat(i, j, k)] = S.at(ox + i * C * cell, oy + j * C * cell, oz + k * C * cell);
  const diag = C * cell * 1.8;
  const done = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < cz - 1; k++)
    for (let j = 0; j < cy - 1; j++)
      for (let i = 0; i < cx - 1; i++) {
        let near = false;
        for (let c = 0; c < 8 && !near; c++) if (Math.abs(G[gat(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]) < diag) near = true;
        if (!near) continue;
        for (let kk = k * C; kk <= Math.min(nz - 1, (k + 1) * C); kk++)
          for (let jj = j * C; jj <= Math.min(ny - 1, (j + 1) * C); jj++)
            for (let ii = i * C; ii <= Math.min(nx - 1, (i + 1) * C); ii++) {
              const id = at(ii, jj, kk);
              if (done[id]) continue;
              done[id] = 1;
              F[id] = S.at(ox + ii * cell, oy + jj * cell, oz + kk * cell);
            }
      }
  // Everything else: trilinear from the coarse grid (far from the surface, only the sign matters).
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const id = at(i, j, k);
        if (done[id]) continue;
        const fi = i / C, fj = j / C, fk = k / C;
        const i0 = Math.min(cx - 2, Math.floor(fi)), j0 = Math.min(cy - 2, Math.floor(fj)), k0 = Math.min(cz - 2, Math.floor(fk));
        const tx = fi - i0, ty = fj - j0, tz = fk - k0;
        const l = (a: number, b: number, t: number) => a + (b - a) * t;
        F[id] = l(
          l(l(G[gat(i0, j0, k0)], G[gat(i0 + 1, j0, k0)], tx), l(G[gat(i0, j0 + 1, k0)], G[gat(i0 + 1, j0 + 1, k0)], tx), ty),
          l(l(G[gat(i0, j0, k0 + 1)], G[gat(i0 + 1, j0, k0 + 1)], tx), l(G[gat(i0, j0 + 1, k0 + 1)], G[gat(i0 + 1, j0 + 1, k0 + 1)], tx), ty),
          tz,
        );
      }

  // Surface nets: one vertex per cell the surface crosses.
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const P: number[] = [];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], // x
    [0, 2], [1, 3], [4, 6], [5, 7], // y
    [0, 4], [1, 5], [2, 6], [3, 7], // z
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = F[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
          const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
          sx += ax + (bx - ax) * t;
          sy += ay + (by - ay) * t;
          sz += az + (bz - az) * t;
          n++;
        }
        cellVert[cat(i, j, k)] = P.length / 3;
        P.push(ox + (i + sx / n) * cell, oy + (j + sy / n) * cell, oz + (k + sz / n) * cell);
      }

  // Quads across every grid edge with a sign change.
  const quads: number[] = [];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const inside = F[at(i, j, k)] < 0;
        // x edge
        if (j > 0 && k > 0 && inside !== F[at(i + 1, j, k)] < 0)
          quads.push(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)]);
        if (i > 0 && k > 0 && inside !== F[at(i, j + 1, k)] < 0)
          quads.push(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)]);
        if (i > 0 && j > 0 && inside !== F[at(i, j, k + 1)] < 0)
          quads.push(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)]);
      }

  const nv = P.length / 3;
  const pos = new Float32Array(P);
  const e = cell * 0.25;
  const grad = (x: number, y: number, z: number, out: number[]) => {
    out[0] = S.at(x + e, y, z) - S.at(x - e, y, z);
    out[1] = S.at(x, y + e, z) - S.at(x, y - e, z);
    out[2] = S.at(x, y, z + e) - S.at(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  };
  const g = [0, 0, 0];
  const project = (it: number) => {
    for (let vi = 0; vi < nv; vi++) {
      for (let s = 0; s < it; s++) {
        const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
        const d = S.at(x, y, z);
        if (Math.abs(d) < cell * 0.002) break;
        grad(x, y, z, g);
        const step = Math.max(-cell, Math.min(cell, d));
        pos[vi * 3] -= g[0] * step;
        pos[vi * 3 + 1] -= g[1] * step;
        pos[vi * 3 + 2] -= g[2] * step;
      }
    }
  };
  project(3);

  // Relax: move each vertex toward its neighbours' average, then back onto the surface.
  if (relax > 0) {
    const nbr: Set<number>[] = Array.from({ length: nv }, () => new Set());
    for (let q = 0; q < quads.length; q += 4)
      for (let s = 0; s < 4; s++) {
        const a = quads[q + s], b = quads[q + ((s + 1) & 3)];
        nbr[a].add(b);
        nbr[b].add(a);
      }
    const tmp = new Float32Array(pos.length);
    for (let r = 0; r < relax; r++) {
      for (let vi = 0; vi < nv; vi++) {
        let ax = 0, ay = 0, az = 0;
        for (const o of nbr[vi]) {
          ax += pos[o * 3];
          ay += pos[o * 3 + 1];
          az += pos[o * 3 + 2];
        }
        const n = nbr[vi].size || 1;
        tmp[vi * 3] = pos[vi * 3] * 0.5 + (ax / n) * 0.5;
        tmp[vi * 3 + 1] = pos[vi * 3 + 1] * 0.5 + (ay / n) * 0.5;
        tmp[vi * 3 + 2] = pos[vi * 3 + 2] * 0.5 + (az / n) * 0.5;
      }
      pos.set(tmp);
      project(3);
    }
  }

  const nor = new Float32Array(pos.length);
  for (let vi = 0; vi < nv; vi++) {
    grad(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2], g);
    nor[vi * 3] = g[0];
    nor[vi * 3 + 1] = g[1];
    nor[vi * 3 + 2] = g[2];
  }

  // Quads to triangles along the shorter diagonal, wound to face outward.
  const idx: number[] = [];
  const d2 = (a: number, b: number) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
  const tri = (a: number, b: number, c: number) => {
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx2 = nor[a * 3] + nor[b * 3] + nor[c * 3], ny2 = nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1], nz2 = nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };
  for (let q = 0; q < quads.length; q += 4) {
    const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    if (d2(a, c) < d2(b, d)) {
      tri(a, b, c);
      tri(a, c, d);
    } else {
      tri(a, b, d);
      tri(b, c, d);
    }
  }
  return { positions: pos, normals: nor, indices: new Uint32Array(idx) };
}
