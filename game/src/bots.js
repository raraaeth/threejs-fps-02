// VEILPOINT — bots.js: 9 bots (4 Wardens allies, 5 Jackals defenders). Each bot has a
// route, a hold position, sight (range + FOV + line of sight + smoke) and hearing
// (gunshot noise events). Attackers push a site; defenders hold and rotate on noise;
// the carrier plants when the site is clear, defenders defuse when the bomb is down.
import * as THREE from 'three';
import { moveCircle, segmentBlocked, findPath, nearestNode } from './map.js';
import { WEAPONS, shootHitscan } from './weapons.js';
import { S, TEAM, addNoise } from './state.js';

const BOT_SPEED = 4.1;
const BOT_RADIUS = 0.38;
const SIGHT_RANGE = 34;
const SIGHT_FOV = 0.86; // cos(half-angle) ~ 61 degrees total
const REACT_TIME = 0.45;
const HEAR_RANGE = 26;

const NAMES_W = ['Ash', 'Bram', 'Cleo', 'Dara'];
const NAMES_J = ['Vex', 'Nox', 'Rook', 'Sable', 'Ivo'];

// Shared geometry/materials — built once, reused by every bot.
let _geoBody, _geoHead, _geoGun, _geoVisor;
let _matW, _matJ, _matHead, _matGun, _matVisorW, _matVisorJ;
function mats() {
  if (_geoBody) return;
  _geoBody = new THREE.BoxGeometry(0.62, 0.95, 0.36);
  _geoHead = new THREE.BoxGeometry(0.36, 0.34, 0.34);
  _geoGun = new THREE.BoxGeometry(0.09, 0.12, 0.72);
  _geoVisor = new THREE.BoxGeometry(0.3, 0.07, 0.02);
  _matW = new THREE.MeshStandardMaterial({ color: 0x2e6f73, roughness: 0.8 });
  _matJ = new THREE.MeshStandardMaterial({ color: 0x8a4d1d, roughness: 0.8 });
  _matHead = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.85 });
  _matGun = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.6 });
  _matVisorW = new THREE.MeshStandardMaterial({ color: 0x39c2c9, roughness: 0.2, metalness: 0.4, emissive: 0x0a3a3d });
  _matVisorJ = new THREE.MeshStandardMaterial({ color: 0xe07b2e, roughness: 0.2, metalness: 0.4, emissive: 0x3d1a05 });
}

function makeBotMesh(team) {
  mats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(_geoBody, team === TEAM.WARDEN ? _matW : _matJ);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(_geoHead, _matHead);
  head.position.y = 1.62;
  head.castShadow = true;
  head.userData.head = true;
  const visor = new THREE.Mesh(_geoVisor, team === TEAM.WARDEN ? _matVisorW : _matVisorJ);
  visor.position.set(0, 1.66, 0.18);
  const gun = new THREE.Mesh(_geoGun, _matGun);
  gun.position.set(0.28, 1.15, 0.3);
  g.add(body, head, visor, gun);
  return { group: g, head, body };
}

export function createBots(scene, map) {
  const bots = [];
  const mk = (team, name, spawn, defId) => {
    const { group, head, body } = makeBotMesh(team);
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);
    const bot = {
      id: bots.length, name, team, kind: 'bot',
      pos: { x: spawn[0], z: spawn[1] },
      yaw: team === TEAM.WARDEN ? 0 : Math.PI,
      hp: 100, alive: true, defId,
      path: [], pathI: 0, hold: null, holdT: 0,
      target: null, seenT: -10, reactT: 0, shootT: 0, burst: 0,
      investigate: null, plantT: 0, defuseT: 0, carrier: false,
      speed: BOT_SPEED * (0.92 + Math.random() * 0.16),
      mesh: group, headMesh: head, bodyMesh: body,
      moveX: 0, moveZ: 0,
    };
    head.userData.agent = bot;
    body.userData.agent = bot;
    bots.push(bot);
    return bot;
  };
  map.spawnsW.slice(1).forEach((s, i) => mk(TEAM.WARDEN, NAMES_W[i], s, i === 0 ? 'longshadow' : i === 1 ? 'duskfang' : 'vesper'));
  map.spawnsJ.forEach((s, i) => mk(TEAM.JACKAL, NAMES_J[i], s, i === 0 ? 'longshadow' : i === 1 ? 'duskfang' : 'vesper'));
  return bots;
}

export function resetBots(bots, map, round) {
  const wSpawns = map.spawnsW, jSpawns = map.spawnsJ;
  let wi = 0, ji = 0;
  for (const b of bots) {
    const isW = b.team === TEAM.WARDEN;
    const idx = isW ? wi++ : ji++;
    const s = isW ? wSpawns[idx % wSpawns.length] : jSpawns[idx % jSpawns.length];
    b.pos.x = s[0]; b.pos.z = s[1];
    b.hp = 100; b.alive = true;
    b.yaw = b.team === TEAM.WARDEN ? 0 : Math.PI;
    b.path = []; b.pathI = 0; b.target = null; b.investigate = null;
    b.plantT = 0; b.defuseT = 0; b.carrier = false;
    b.mesh.visible = true;
    b.mesh.rotation.x = 0;
    b.mesh.position.set(s[0], 0, s[1]);
    // Attackers commit to a site; the first Warden bot carries the bomb.
    if (b.team === TEAM.WARDEN) {
      b.site = (idx % 2 === 0) ? 'A' : 'B';
      if (idx === 0) b.carrier = true;
    } else {
      // Defenders hold: two at A, two at B, one mid.
      b.site = idx <= 1 ? 'A' : idx <= 3 ? 'B' : 'mid';
      b.hold = b.site === 'mid' ? { x: 0, z: 0 } : { x: map.sites[b.site].cx + (Math.random() * 6 - 3), z: map.sites[b.site].cz + 4 };
    }
  }
}

// Line of sight: segment test vs colliders, plus smoke spheres block sight.
function canSee(from, to, map) {
  if (segmentBlocked(from.x, 1.5, from.z, to.x, 1.5, to.z, map.colliders)) return false;
  for (const s of S.smokes) {
    if (S.time > s.until) continue;
    // Segment vs sphere (smoke cloud): quick closest-point test.
    const dx = to.x - from.x, dz = to.z - from.z;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((s.x - from.x) * dx + (s.z - from.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = from.x + dx * t - s.x, cz = from.z + dz * t - s.z;
    if (cx * cx + cz * cz < s.r * s.r) return false;
  }
  return true;
}

export function updateBots(bots, dt, ctx) {
  // ctx: { map, player, raycaster, walls, targetMeshes, fx, audio, onDamage, onKill, onPlant, onDefuse }
  const { map } = ctx;
  for (const b of bots) {
    if (!b.alive) continue;
    // --- Sense: nearest visible enemy. ---
    const enemies = b.team === TEAM.WARDEN
      ? bots.filter((o) => o.team === TEAM.JACKAL && o.alive)
      : bots.filter((o) => o.team === TEAM.WARDEN && o.alive);
    let seen = null, seenD = SIGHT_RANGE;
    const consider = (ex, ez, eyeY, agent) => {
      const dx = ex - b.pos.x, dz = ez - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > seenD) return;
      // FOV check.
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      if ((dx * fx + dz * fz) / (d || 1) < SIGHT_FOV && d > 2.5) return;
      if (!canSee(b.pos, { x: ex, z: ez }, map)) return;
      seen = agent; seenD = d;
    };
    for (const e of enemies) consider(e.pos.x, e.pos.z, 1.5, e);
    if (b.team === TEAM.JACKAL && ctx.player.alive) consider(ctx.player.pos.x, ctx.player.pos.z, ctx.player.eye, ctx.player);
    if (seen) {
      if (b.target !== seen) { b.target = seen; b.reactT = REACT_TIME; }
      b.seenT = S.time;
    } else if (b.target && S.time - b.seenT > 1.2) {
      b.target = null;
    }
    // --- Hear: recent gunshots pull defenders toward the noise. ---
    if (!b.target && b.team === TEAM.JACKAL) {
      for (let i = S.noise.length - 1; i >= 0; i--) {
        const n = S.noise[i];
        if (S.time - n.t > 3) continue;
        const d = Math.hypot(n.x - b.pos.x, n.z - b.pos.z);
        if (d < HEAR_RANGE && d > 4) { b.investigate = { x: n.x, z: n.z }; break; }
      }
    }
    // --- Act: engage, plant/defuse, or move along a route. ---
    let moveX = 0, moveZ = 0;
    if (b.target) {
      // Face the target; stop and shoot after the reaction delay.
      const t = b.target;
      const tx = t.pos.x, tz = t.pos.z;
      b.yaw = Math.atan2(-(tx - b.pos.x), -(tz - b.pos.z));
      if (b.reactT > 0) b.reactT -= dt;
      else if (S.time - b.seenT < 2.5) botShoot(b, t, dt, ctx);
      // Small strafe while engaging.
      const strafe = Math.sin(S.time * 1.3 + b.id * 2.1) * 0.5;
      moveX = Math.cos(b.yaw) * strafe;
      moveZ = -Math.sin(b.yaw) * strafe;
    } else if (b.carrier && S.bomb.state === 'carried' && b.team === TEAM.WARDEN) {
      // Carrier pushes to its site and plants when clear.
      const site = map.sites[b.site];
      const dSite = Math.hypot(site.cx - b.pos.x, site.cz - b.pos.z);
      if (dSite < 4) {
        const near = enemies.some((e) => Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) < 12);
        if (!near) {
          b.plantT += dt;
          if (b.plantT > 3) { ctx.onPlant(b, b.site); b.plantT = 0; }
        } else b.plantT = 0;
      } else {
        b.plantT = 0;
        const mv = followPath(b, site.cx, site.cz, map, dt);
        moveX = mv[0]; moveZ = mv[1];
      }
    } else if (S.bomb.state === 'planted' && b.team === TEAM.JACKAL) {
      // Defenders rotate to the planted site and defuse when clear.
      const site = map.sites[S.bomb.site];
      const dSite = Math.hypot(site.cx - b.pos.x, site.cz - b.pos.z);
      if (dSite < 3.5) {
        const near = enemies.some((e) => Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) < 12);
        if (!near) {
          b.defuseT += dt;
          if (b.defuseT > 5) { ctx.onDefuse(b); b.defuseT = 0; }
        } else b.defuseT = 0;
      } else {
        b.defuseT = 0;
        const mv = followPath(b, site.cx, site.cz, map, dt);
        moveX = mv[0]; moveZ = mv[1];
      }
    } else if (b.investigate) {
      const mv = followPath(b, b.investigate.x, b.investigate.z, map, dt);
      moveX = mv[0]; moveZ = mv[1];
      if (Math.hypot(b.investigate.x - b.pos.x, b.investigate.z - b.pos.z) < 1.5) b.investigate = null;
    } else if (b.team === TEAM.WARDEN) {
      const site = map.sites[b.site];
      const mv = followPath(b, site.cx + (b.id % 3 - 1) * 3, site.cz + 3, map, dt);
      moveX = mv[0]; moveZ = mv[1];
    } else if (b.hold) {
      // Defenders hold: walk to the hold spot once, then face the likely approach.
      const d = Math.hypot(b.hold.x - b.pos.x, b.hold.z - b.pos.z);
      if (d > 1.2) {
        const mv = followPath(b, b.hold.x, b.hold.z, map, dt);
        moveX = mv[0]; moveZ = mv[1];
      } else {
        b.holdT += dt;
        b.yaw = Math.atan2(-(0 - b.pos.x), -(20 - b.pos.z)) + Math.sin(b.holdT * 0.4) * 0.5;
      }
    }
    // --- Move with collision. ---
    const ml = Math.hypot(moveX, moveZ);
    if (ml > 0.01) {
      const sp = b.speed * (b.target ? 0.45 : 1);
      moveCircle(b.pos, (moveX / ml) * sp * dt, (moveZ / ml) * sp * dt, BOT_RADIUS, map.colliders);
      b.moveX = moveX / ml; b.moveZ = moveZ / ml;
      if (!b.target) b.yaw = Math.atan2(-moveX / ml, -moveZ / ml);
    } else { b.moveX = 0; b.moveZ = 0; }
    b.mesh.position.set(b.pos.x, 0, b.pos.z);
    b.mesh.rotation.y = b.yaw;
    // Walk bob.
    b.mesh.position.y = ml > 0.01 ? Math.abs(Math.sin(S.time * 9 + b.id)) * 0.03 : 0;
  }
}

function followPath(b, tx, tz, map, dt) {
  if (!b.path.length || b.pathI >= b.path.length) {
    b.path = findPath(map.nodes, b.pos.x, b.pos.z, tx, tz);
    b.pathI = 0;
  }
  const wp = b.path[b.pathI];
  const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.9) {
    b.pathI++;
    if (b.pathI >= b.path.length) return [0, 0];
    return followPath(b, tx, tz, map, dt);
  }
  return [dx / d, dz / d];
}

function botShoot(b, target, dt, ctx) {
  b.shootT -= dt;
  if (b.shootT > 0) return;
  const def = WEAPONS[b.defId];
  b.shootT = def.rof * (def.auto ? 1 : 2.2);
  const tx = target.pos.x, tz = target.pos.z;
  const eyeY = target.eye !== undefined ? target.eye : 1.5;
  const d = Math.hypot(tx - b.pos.x, tz - b.pos.z);
  // Inaccuracy grows with distance and while the target moves.
  const spread = 0.03 + d * 0.0016;
  const origin = new THREE.Vector3(b.pos.x, 1.5, b.pos.z);
  const dir = new THREE.Vector3(tx - b.pos.x, eyeY - 1.5, tz - b.pos.z).normalize();
  shootHitscan({
    origin, dir, def, spread,
    raycaster: ctx.raycaster, walls: ctx.walls, targetMeshes: ctx.targetMeshes,
    fx: ctx.fx, audio: ctx.audio,
    attacker: b,
    onHit: (agent, dmg, head, attacker) => ctx.onDamage(agent, dmg, head, attacker),
  });
  ctx.audio.shot(b.pos, def, false);
  // Bots make noise, so other bots can hear the fight.
  addNoise(b.pos.x, b.pos.z, 26);
}
