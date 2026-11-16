// VEILPOINT — map.js: the original "Duskworks Yard" map. One data table drives the
// visible geometry, the AABB colliders and the waypoint graph, so the three can never
// disagree. Units are metres; y is up; the yard is 64 x 48, sites A (west) and B (east)
// at the north end, Wardens spawn south, Jackals spawn north.
import * as THREE from 'three';

// Palette: dusk industrial — orange sun against teal shade, warm concrete, dark steel.
export const PAL = {
  ground: 0x2b2724, groundLine: 0x3a332d, wall: 0x4a423c, wallDark: 0x35302b,
  teal: 0x2e5f63, tealDark: 0x1d3f43, orange: 0xe07b2e, orangeDim: 0x8a4d1d,
  crate: 0x5a4a38, crateDark: 0x463a2c, roof: 0x241f1c, sky: 0x1c1a26,
  siteA: 0xe07b2e, siteB: 0x39c2c9, dim: 0x14121a,
};

// [cx, cz, w, d, h, colorKey, thin?] — thin walls can be wallbanged by Nightpiercer.
const BOXES = [
  // Perimeter (h 4.5)
  [0, -24.5, 66, 1, 4.5, 'wall'], [0, 24.5, 66, 1, 4.5, 'wall'],
  [-32.5, 0, 1, 50, 4.5, 'wall'], [32.5, 0, 1, 50, 4.5, 'wall'],
  // Mid corridor walls: north segments run to the sites, south segments stop at z=14
  // so the spawn yard stays open east-west. The 4 m gap at z = 0 is the mid door.
  [-6, -14, 1.2, 20, 3.6, 'teal'], [-6, 9, 1.2, 10, 3.6, 'teal'],
  [6, -14, 1.2, 20, 3.6, 'teal'], [6, 9, 1.2, 10, 3.6, 'teal'],
  // A lane: west wall teeth + crates
  [-16, -16, 8, 1.2, 3.2, 'wall'], [-16, 4, 8, 1.2, 3.2, 'wallDark'],
  [-24, -6, 1.2, 8, 3.2, 'wall'], [-22, 12, 4, 4, 1.3, 'crate'],
  [-13, -18, 3, 3, 1.3, 'crate'], [-26, -18, 3, 3, 1.3, 'crateDark'],
  [-19, -13, 2.2, 2.2, 1.1, 'crate'],
  // B lane: east wall teeth + crates (site B pocket is dim)
  [16, -16, 8, 1.2, 3.2, 'wall'], [16, 4, 8, 1.2, 3.2, 'wallDark'],
  [24, -6, 1.2, 8, 3.2, 'wall'], [22, 12, 4, 4, 1.3, 'crate'],
  [13, -18, 3, 3, 1.3, 'crate'], [26, -18, 3, 3, 1.3, 'crateDark'],
  [19, -13, 2.2, 2.2, 1.1, 'crate'],
  // Mid crates + centre pillar (thin ply — Nightpiercer wallbang spot)
  [-2.5, -6, 2.4, 2.4, 1.2, 'crate'], [2.5, 6, 2.4, 2.4, 1.2, 'crate'],
  [0, -2, 1.6, 1.6, 2.6, 'wallDark', true],
  // Spawn cover
  [-8, 18, 4, 1.2, 2.6, 'teal'], [8, 18, 4, 1.2, 2.6, 'teal'],
  [-10, -20, 3, 3, 1.2, 'crate'], [10, -20, 3, 3, 1.2, 'crate'],
  // Site B dim pocket: tall dark walls make the "night" corner. The south wall has a
  // 3 m doorway (x 18.5..21.5) so the pocket is reachable, never sealed.
  [12, -22, 1.2, 6, 4.2, 'wallDark'], [28, -22, 1.2, 6, 4.2, 'wallDark'],
  [15, -19.5, 7, 1.2, 4.2, 'wallDark'], [25, -19.5, 7, 1.2, 4.2, 'wallDark'],
];

// Waypoint graph nodes (x, z): spawns, lanes, sites, mid. Every node sits in open
// space (never inside a wall) and the mid-door gap has its own nodes at (±6, 0).
const NODES = [
  [0, 21], [-12, 21], [12, 21], [-19, 13], [19, 13], [-24, 6], [24, 6],
  [-20, -2], [20, -2], [-3, -9], [3, -9], [0, 0], [-9, 8], [9, 8],
  [0, -8], [-12, -12], [12, -12], [-21, -14], [21, -14], [0, -20],
  [-28, -14], [28, -14], [-16, -20], [20, -21],
  [-6, 0], [6, 0], [20, -17],
];

export const SITES = {
  A: { x0: -30, z0: -23, x1: -11, z1: -9, cx: -20, cz: -16 },
  B: { x0: 11, z0: -23, x1: 30, z1: -9, cx: 20, cz: -16 },
};
export const SPAWNS_W = [[0, 21], [-4, 22], [4, 22], [-8, 20], [8, 20]];
// Jackal spawns sit inside the site B pocket (clear of its walls) and around site A.
export const SPAWNS_J = [[-20, -20], [-12, -21], [0, -21], [14, -22], [20, -22]];

// Reused scratch objects — no per-frame allocation in the hot loop.
const _box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

export function buildMap(scene) {
  const colliders = [];
  const wallMeshes = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = {};
  for (const key of Object.keys(PAL)) {
    if (typeof PAL[key] === 'number') mats[key] = new THREE.MeshStandardMaterial({ color: PAL[key], roughness: 0.92, metalness: 0.04 });
  }
  // Ground + lane striping.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(66, 50), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const stripeGeo = new THREE.PlaneGeometry(1, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ color: PAL.groundLine, roughness: 1 });
  for (const [sx, sz, w, d] of [[-20, 0, 0.35, 40], [20, 0, 0.35, 40], [0, -16, 40, 0.35], [0, 8, 40, 0.35]]) {
    const s = new THREE.Mesh(stripeGeo, stripeMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(sx, 0.02, sz);
    s.scale.set(w, d, 1);
    s.receiveShadow = true;
    scene.add(s);
  }
  // Site floor markers: glowing site letters baked as flat rings.
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? PAL.siteA : PAL.siteB, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.cx, 0.03, site.cz);
    scene.add(ring);
    // Plant crate: the bomb target box.
    const crate = new THREE.Mesh(boxGeo, mats.crate);
    crate.position.set(site.cx + 3.5, 0.55, site.cz + 2);
    crate.scale.set(2.2, 1.1, 2.2);
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    colliders.push({ minX: site.cx + 2.4, maxX: site.cx + 4.6, minZ: site.cz + 0.9, maxZ: site.cz + 3.1, minY: 0, maxY: 1.1, thin: false, mesh: crate });
  }
  // Boxes -> meshes + colliders.
  for (const [cx, cz, w, d, h, colorKey, thin] of BOXES) {
    const mesh = new THREE.Mesh(boxGeo, mats[colorKey]);
    mesh.position.set(cx, h / 2, cz);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.thin = !!thin;
    scene.add(mesh);
    wallMeshes.push(mesh);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: 0, maxY: h, thin: !!thin, mesh });
  }
  // Dusk sun + sky + dim pocket light over site B.
  const sun = new THREE.DirectionalLight(0xff9a4d, 3.0);
  sun.position.set(-28, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fb8c9, 0x3a2c20, 1.3));
  // Cool fill from the north-east so north-facing walls are not pitch black.
  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.85);
  fill.position.set(24, 18, -20);
  scene.add(fill);
  const bLight = new THREE.PointLight(0x39c2c9, 12, 16, 1.6);
  bLight.position.set(20, 4.5, -16);
  scene.add(bLight);
  const aLight = new THREE.PointLight(0xff8c3a, 10, 14, 1.6);
  aLight.position.set(-20, 4.5, -16);
  scene.add(aLight);

  // Waypoint graph: edge between nodes closer than 17 m with clear sight at eye
  // height (1.5 m), so low crates (<= 1.3 m) never sever the graph.
  const nodes = NODES.map(([x, z]) => ({ x, z, edges: [] }));
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = a.x - b.x, dz = a.z - b.z;
      if (dx * dx + dz * dz > 17 * 17) continue;
      if (segmentBlocked(a.x, 1.5, a.z, b.x, 1.5, b.z, colliders)) continue;
      a.edges.push(j);
      b.edges.push(i);
    }
  }
  return { colliders, wallMeshes, nodes, sites: SITES, spawnsW: SPAWNS_W, spawnsJ: SPAWNS_J };
}

// Axis-separated circle-vs-AABB slide. pos is {x, z}; moves by (dx, dz) with radius r.
// A collider the circle already overlaps before an axis move is skipped for that
// axis: pushing out of a collider you spawn inside would teleport you to its far
// side, so the circle walks out instead.
export function moveCircle(pos, dx, dz, r, colliders) {
  const ox = pos.x, oz = pos.z;
  pos.x += dx;
  for (const c of colliders) {
    if (ox + r <= c.minX || ox - r >= c.maxX || oz + r <= c.minZ || oz - r >= c.maxZ) {
      if (pos.z + r > c.minZ && pos.z - r < c.maxZ && pos.x + r > c.minX && pos.x - r < c.maxX) {
        if (dx > 0) pos.x = c.minX - r; else if (dx < 0) pos.x = c.maxX + r;
      }
    }
  }
  pos.z += dz;
  for (const c of colliders) {
    if (pos.x + r <= c.minX || pos.x - r >= c.maxX || oz + r <= c.minZ || oz - r >= c.maxZ) {
      if (pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ) {
        if (dz > 0) pos.z = c.minZ - r; else if (dz < 0) pos.z = c.maxZ + r;
      }
    }
  }
}

// 3D segment vs AABB slab test. Returns true when the segment hits any collider.
export function segmentBlocked(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const c of colliders) {
    let t0 = 0, t1 = 1, ok = true;
    const axes = [[ax, dx, c.minX, c.maxX], [ay, dy, c.minY, c.maxY], [az, dz, c.minZ, c.maxZ]];
    for (const [o, d, mn, mx] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < mn || o > mx) { ok = false; break; }
      } else {
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok) return true;
  }
  return false;
}

// Point inside an AABB (2D + height).
export function insideBox(x, y, z, c) {
  return x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && y >= c.minY && y <= c.maxY;
}

export function nearestNode(nodes, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].x - x, dz = nodes[i].z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS over the waypoint graph. Returns an array of {x, z} waypoints (excluding start).
export function findPath(nodes, sx, sz, tx, tz) {
  const start = nearestNode(nodes, sx, sz);
  const goal = nearestNode(nodes, tx, tz);
  if (start === goal) return [{ x: tx, z: tz }];
  const prev = new Int16Array(nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let qi = 0; qi < queue.length; qi++) {
    const n = queue[qi];
    if (n === goal) break;
    for (const e of nodes[n].edges) {
      if (prev[e] === -1) { prev[e] = n; queue.push(e); }
    }
  }
  if (prev[goal] === -1) return [{ x: tx, z: tz }];
  const path = [];
  let cur = goal;
  while (cur !== start) { path.push({ x: nodes[cur].x, z: nodes[cur].z }); cur = prev[cur]; }
  path.reverse();
  path.push({ x: tx, z: tz });
  return path;
}

export { _box };
