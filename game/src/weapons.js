// VEILPOINT — weapons.js: all original armaments. Firearms stay the main tools;
// Excalibur (sword) and Gunblade are flavour on top of a tactical core, never a fantasy
// pivot. Damage, spread and recoil are per-weapon; spread grows while moving.
import * as THREE from 'three';

export const WEAPONS = {
  vesper: { name: 'Vesper', kind: 'pistol', price: 300, dmg: 34, head: 2.0, rof: 0.14, mag: 12, reserve: 36, spread: 0.011, moveSpread: 0.016, auto: false, kick: 0.5, reload: 1.4, range: 60, tracer: 0xffd27a },
  gunblade: { name: 'Gunblade', kind: 'hybrid', price: 800, dmg: 30, head: 2.0, rof: 0.16, mag: 10, reserve: 30, spread: 0.013, moveSpread: 0.018, auto: false, kick: 0.55, reload: 1.5, range: 55, meleeDmg: 55, meleeRange: 2.4, tracer: 0xffd27a },
  duskfang: { name: 'Duskfang', kind: 'smg', price: 1500, dmg: 26, head: 1.8, rof: 0.075, mag: 25, reserve: 75, spread: 0.02, moveSpread: 0.024, auto: true, kick: 0.4, reload: 1.7, range: 50, tracer: 0xffb36b },
  longshadow: { name: 'Longshadow', kind: 'rifle', price: 2700, dmg: 33, head: 2.5, rof: 0.11, mag: 25, reserve: 75, spread: 0.008, moveSpread: 0.02, auto: true, kick: 0.7, reload: 2.1, range: 70, tracer: 0xffe9a8 },
  nightpiercer: { name: 'Nightpiercer', kind: 'sniper', price: 4750, dmg: 115, head: 2.0, rof: 1.1, mag: 5, reserve: 15, spread: 0.002, moveSpread: 0.09, auto: false, kick: 1.6, reload: 2.6, range: 120, pierce: true, scopedSpread: 0.001, tracer: 0x9fe8ff },
  excalibur: { name: 'Excalibur', kind: 'melee', price: 0, dmg: 65, head: 1.0, rof: 0.45, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, auto: false, kick: 0, reload: 0, range: 2.4, tracer: 0 },
  ember: { name: 'Ember', kind: 'grenade', price: 300, dmg: 90, fuse: 2.2, radius: 7, tracer: 0 },
  veil: { name: 'Veil', kind: 'grenade', price: 300, dmg: 0, fuse: 1.6, radius: 6, tracer: 0 },
};

export const BUY_ORDER = ['vesper', 'gunblade', 'duskfang', 'longshadow', 'nightpiercer', 'ember', 'veil'];
export const SLOT_KEYS = { '1': 'vesper', '2': 'gunblade', '3': 'duskfang', '4': 'longshadow', '5': 'nightpiercer', '6': 'ember', '7': 'veil' };

export function newLoadout() {
  return {
    owned: { vesper: true, excalibur: true },
    grenades: { ember: 0, veil: 0 },
    current: 'vesper',
    mag: 12, reserve: 36, cooldown: 0, reloading: false, reloadT: 0,
    meleeCooldown: 0,
  };
}

// One hitscan shot. ctx: { raycaster, walls, targets, fx, audio, onHit(agent, dmg, head, attacker), attacker, origin, dir, def, spread, pierceWall }
// targets: [{ agent, meshes: [headMesh, bodyMesh...] }] — head mesh flagged userData.head.
export function shootHitscan(ctx) {
  const def = ctx.def;
  const dir = ctx.dir.clone();
  // Spread: random cone around the aim direction.
  dir.x += (Math.random() - 0.5) * 2 * ctx.spread;
  dir.y += (Math.random() - 0.5) * 2 * ctx.spread;
  dir.z += (Math.random() - 0.5) * 2 * ctx.spread;
  dir.normalize();
  const rc = ctx.raycaster;
  rc.set(ctx.origin, dir);
  rc.far = def.range;
  // Walls first, then agent meshes — merge and sort by distance.
  const wallHits = rc.intersectObjects(ctx.walls, false);
  const targetHits = rc.intersectObjects(ctx.targetMeshes, false);
  let end = ctx.origin.clone().addScaledVector(dir, def.range);
  let hitWall = wallHits[0] || null;
  let hitTarget = targetHits[0] || null;
  // Nightpiercer wallbang: a thin wall costs 45% damage and the bullet keeps going.
  if (def.pierce && hitWall && hitWall.object.userData.thin && (!hitTarget || hitWall.distance < hitTarget.distance)) {
    const after = hitWall.point.clone().addScaledVector(dir, 0.3);
    rc.set(after, dir);
    rc.far = def.range - hitWall.distance;
    const again = rc.intersectObjects(ctx.targetMeshes, false);
    if (again[0]) {
      hitTarget = again[0];
      end = hitTarget.point.clone();
      ctx.fx.tracer(ctx.origin, end, def.tracer);
      const head = !!hitTarget.object.userData.head;
      ctx.onHit(hitTarget.object.userData.agent, Math.round(def.dmg * 0.55 * (head ? def.head : 1)), head, ctx.attacker);
      ctx.fx.impact(hitTarget.point, head);
      return { hit: true, head, wallbang: true };
    }
    end = after.addScaledVector(dir, rc.far);
    ctx.fx.tracer(ctx.origin, end, def.tracer);
    ctx.fx.impact(hitWall.point, false);
    return { hit: false, wall: true };
  }
  if (hitTarget && (!hitWall || hitTarget.distance < hitWall.distance)) {
    end = hitTarget.point.clone();
    ctx.fx.tracer(ctx.origin, end, def.tracer);
    const head = !!hitTarget.object.userData.head;
    ctx.onHit(hitTarget.object.userData.agent, Math.round(def.dmg * (head ? def.head : 1)), head, ctx.attacker);
    ctx.fx.impact(hitTarget.point, head);
    return { hit: true, head, wallbang: false };
  }
  if (hitWall) {
    end = hitWall.point.clone();
    ctx.fx.tracer(ctx.origin, end, def.tracer);
    ctx.fx.impact(hitWall.point, false);
    return { hit: false, wall: true };
  }
  ctx.fx.tracer(ctx.origin, end, def.tracer);
  return { hit: false, wall: false };
}

// Melee swing: short-range cone check against agent hit positions.
export function meleeSwing(ctx) {
  const def = ctx.def;
  let best = null, bestD = def.range;
  for (const t of ctx.targets) {
    if (!t.agent.alive) continue;
    const dx = t.agent.pos.x - ctx.origin.x, dz = t.agent.pos.z - ctx.origin.z;
    const d = Math.hypot(dx, dz);
    if (d > def.range) continue;
    // Must be roughly in front (dot with aim dir on XZ).
    const dot = (dx * ctx.dir.x + dz * ctx.dir.z) / (d || 1);
    if (dot < 0.55) continue;
    if (d < bestD) { bestD = d; best = t.agent; }
  }
  if (best) {
    ctx.onHit(best, def.dmg, false, ctx.attacker);
    ctx.fx.slash(ctx.origin, ctx.dir);
    return true;
  }
  ctx.fx.slash(ctx.origin, ctx.dir);
  return false;
}

// ---- Grenades: live projectiles with fuse, bounce and blast. ----
export function createGrenades() {
  return { list: [], _v: new THREE.Vector3() };
}

export function throwGrenade(gr, scene, kind, origin, dir, fx) {
  const g = {
    kind, mesh: null, vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
    pos: origin.clone(), fuse: WEAPONS[kind].fuse, dead: false,
  };
  const geo = new THREE.SphereGeometry(0.14, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: kind === 'ember' ? 0xff5a2a : 0x9fb8b0, roughness: 0.4, metalness: 0.5 });
  g.mesh = new THREE.Mesh(geo, mat);
  g.mesh.position.copy(g.pos);
  scene.add(g.mesh);
  gr.list.push(g);
  fx.throwSound(kind);
  return g;
}

export function updateGrenades(gr, dt, ctx) {
  // ctx: { colliders, agents, fx, audio, onDamage(agent, dmg, attacker), attacker, smokes }
  for (const g of gr.list) {
    if (g.dead) continue;
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Ground bounce.
    if (g.pos.y < 0.14) { g.pos.y = 0.14; g.vel.y = Math.abs(g.vel.y) * 0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    // Wall bounce (cheap AABB push-out, horizontal only).
    for (const c of ctx.colliders) {
      if (g.pos.y < c.maxY && g.pos.x > c.minX - 0.14 && g.pos.x < c.maxX + 0.14 && g.pos.z > c.minZ - 0.14 && g.pos.z < c.maxZ + 0.14) {
        const dxl = g.pos.x - (c.minX - 0.14), dxr = (c.maxX + 0.14) - g.pos.x;
        const dzl = g.pos.z - (c.minZ - 0.14), dzr = (c.maxZ + 0.14) - g.pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl || m === dxr) g.vel.x *= -0.5; else g.vel.z *= -0.5;
        g.pos.x += (m === dxl ? -0.05 : m === dxr ? 0.05 : 0);
        g.pos.z += (m === dzl ? -0.05 : m === dzr ? 0.05 : 0);
      }
    }
    g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) {
      g.dead = true;
      ctx.scene.remove(g.mesh);
      if (g.kind === 'ember') {
        ctx.fx.explosion(g.pos);
        ctx.audio.explosion(g.pos);
        for (const a of ctx.agents) {
          if (!a.alive) continue;
          const d = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
          if (d < WEAPONS.ember.radius) {
            const dmg = Math.round(WEAPONS.ember.dmg * (1 - d / (WEAPONS.ember.radius * 1.4)));
            if (dmg > 0) ctx.onDamage(a, dmg, ctx.attacker);
          }
        }
      } else {
        ctx.fx.smokeCloud(g.pos, ctx.smokes);
        ctx.audio.smokePop(g.pos);
      }
    }
  }
  gr.list = gr.list.filter((g) => !g.dead);
}

// ---- Viewmodels: one small original gun/sword built from boxes, attached to camera. ----
const _gunMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.35 });
const _gunMat2 = new THREE.MeshStandardMaterial({ color: 0xe07b2e, roughness: 0.5, metalness: 0.4 });
const _bladeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.2, metalness: 0.9 });
const _gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.85, metalness: 0.05 });

export function createViewmodel(camera) {
  const group = new THREE.Group();
  group.position.set(0.34, -0.32, -0.62);
  camera.add(group);
  return { group, current: null, parts: {} };
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function setViewmodel(vm, defId) {
  if (vm.current === defId) return;
  vm.current = defId;
  while (vm.group.children.length) vm.group.remove(vm.group.children[0]);
  const g = vm.group;
  if (defId === 'excalibur') {
    // Sword held point-down-forward: blade, guard, grip.
    const blade = box(0.05, 0.62, 0.012, _bladeMat, 0, 0.22, -0.08);
    blade.rotation.x = -0.5;
    g.add(blade);
    const guard = box(0.16, 0.03, 0.04, _gunMat2, 0, -0.08, 0.02);
    guard.rotation.x = -0.5;
    g.add(guard);
    const grip = box(0.045, 0.16, 0.045, _gripMat, 0, -0.17, 0.06);
    grip.rotation.x = -0.5;
    g.add(grip);
    vm.parts.swing = blade;
  } else if (defId === 'gunblade') {
    g.add(box(0.07, 0.11, 0.34, _gunMat, 0, 0.02, -0.1));
    g.add(box(0.06, 0.16, 0.09, _gripMat, 0, -0.09, 0.04));
    const blade = box(0.012, 0.05, 0.3, _bladeMat, 0.045, 0.0, -0.12);
    g.add(blade);
    vm.parts.swing = blade;
  } else {
    const long = defId === 'nightpiercer' || defId === 'longshadow';
    const len = long ? 0.62 : defId === 'duskfang' ? 0.42 : 0.3;
    g.add(box(0.07, 0.1, len, _gunMat, 0, 0.03, -0.1));
    g.add(box(0.06, 0.14, 0.08, _gripMat, 0, -0.08, 0.05));
    if (defId === 'nightpiercer') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), _gunMat2);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.11, -0.12);
      g.add(scope);
    }
    if (defId === 'duskfang') g.add(box(0.05, 0.05, 0.2, _gunMat2, 0, -0.03, -0.22));
    if (defId === 'longshadow') g.add(box(0.02, 0.06, 0.3, _gunMat2, 0, 0.09, -0.18));
  }
}

// Bob + recoil + melee swing. t is render time; kick decays in the caller.
export function updateViewmodel(vm, t, moving, kick, swingT) {
  const g = vm.group;
  const bob = moving ? Math.sin(t * 9) * 0.008 : 0;
  g.position.y = -0.32 + bob;
  g.position.x = 0.34 + (moving ? Math.cos(t * 9) * 0.005 : 0);
  g.position.z = -0.62 + kick * 0.09;
  g.rotation.x = kick * 0.14;
  if (vm.current === 'excalibur' || vm.current === 'gunblade') {
    // Swing: rotate the whole group across the swing window.
    const s = swingT > 0 ? Math.sin((1 - swingT / 0.45) * Math.PI) : 0;
    g.rotation.z = -s * 1.1;
    g.rotation.x = kick * 0.14 - s * 0.5;
  } else {
    g.rotation.z = 0;
  }
}
