// VEILPOINT — main.js: boot + the one loop. A fixed 60 Hz simulation feeds rendering
// at the display rate. ?shot=buy|duel|plant&seed=N stages a deterministic frame for a
// capture, renders it twice, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { S, TEAM, addNoise } from './state.js';
import { buildMap, SITES } from './map.js';
import { createPlayer, updatePlayer, eyePos, aimDir } from './player.js';
import { createBots, resetBots, updateBots } from './bots.js';
import { WEAPONS, SLOT_KEYS, newLoadout, shootHitscan, meleeSwing, createGrenades, throwGrenade, updateGrenades, createViewmodel, setViewmodel, updateViewmodel } from './weapons.js';
import { createFx, fxApi, updateFx } from './fx.js';
import { createAudio } from './audio.js';
import { createHud, updateHud, showProgress, hideProgress, showBanner, renderBuy, setBuyOpen, setOverlay } from './hud.js';
import { startRound, endRound, damageAgent, updateRound } from './rounds.js';
import { tryBuy, equip, cycleWeapon } from './buy.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
if (shot) {
  const rnd = mulberry32(seed);
  Math.random = rnd;
}

// ---- Debug surface for headless checks (also catches window errors). ----
const debugEl = document.getElementById('debug');
function debug(obj) { if (debugEl) debugEl.textContent = JSON.stringify(obj); }
window.addEventListener('error', (e) => debug({ error: String(e.message) }));

// ---- Renderer / scene. ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1a26);
scene.fog = new THREE.Fog(0x1c1a26, 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);
// Small warm light riding with the camera so the viewmodel never reads as a black slab.
const camLight = new THREE.PointLight(0xffe0b8, 1.4, 4, 1.2);
camLight.position.set(0.3, 0.1, -0.4);
camera.add(camLight);

const map = buildMap(scene);
const fxObj = createFx(scene);
const audio = createAudio();
const fx = fxApi(fxObj, audio);
const hud = createHud();
const player = createPlayer(map.spawnsW[0]);
const bots = createBots(scene, map);
const grenades = createGrenades();
const raycaster = new THREE.Raycaster();

// Bomb prop (visible when planted/dropped).
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.28), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.6 }));
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b2e }));
bombLight.position.set(0.12, 0.14, 0);
bombMesh.add(bombBody, bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// Loadout + viewmodel.
const loadout = newLoadout();
const vm = createViewmodel(camera);
scene.add(camera);
fxObj.flash.position.set(0.34, -0.26, -0.85);
camera.add(fxObj.flash);
setViewmodel(vm, loadout.current);

// Target meshes for hitscan: bot head/body + player is never a target.
function targetMeshes() {
  const out = [];
  for (const b of bots) if (b.alive) { out.push(b.headMesh, b.bodyMesh); }
  return out;
}

// ---- Input. ----
const input = { forward: false, back: false, left: false, right: false, crouch: false, lookX: 0, lookY: 0, firing: false };
let locked = false;
let kick = 0, swingT = 0, plantHeld = 0;
const _origin = new THREE.Vector3(), _dir = new THREE.Vector3(), _tmp = new THREE.Vector3();

function onLockChange() {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && !shot && S.phase === 'live') setOverlay(hud, true, 'VEILPOINT', 'Paused — click to play. Wardens plant the bomb; Jackals hold the sites.');
}
document.addEventListener('pointerlockchange', onLockChange);
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  input.lookX += e.movementX * 0.0022;
  input.lookY += e.movementY * 0.0022;
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) input.firing = true;
  if (e.button === 2) tryScope(true);
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.firing = false;
  if (e.button === 2) tryScope(false);
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') input.forward = true;
  if (k === 's' || k === 'arrowdown') input.back = true;
  if (k === 'a' || k === 'arrowleft') input.left = true;
  if (k === 'd' || k === 'arrowright') input.right = true;
  if (k === 'control' || k === 'c') input.crouch = true;
  if (k === 'r') startReload();
  if (k === 'b') toggleBuy();
  if (k === 'q') cycleWeapon(ctx);
  if (k === 'g') throwCurrentGrenade();
  if (k === 'e') plantHeld = 0.0001; // held-state tracked below via keys set
  if (SLOT_KEYS[k]) tryBuy(ctx, SLOT_KEYS[k]);
  if (k === '8') equip(ctx, 'excalibur');
  if (k === ' ') e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') input.forward = false;
  if (k === 's' || k === 'arrowdown') input.back = false;
  if (k === 'a' || k === 'arrowleft') input.left = false;
  if (k === 'd' || k === 'arrowright') input.right = false;
  if (k === 'control' || k === 'c') input.crouch = false;
});
const keysHeld = new Set();
document.addEventListener('keydown', (e) => keysHeld.add(e.key.toLowerCase()));
document.addEventListener('keyup', (e) => keysHeld.delete(e.key.toLowerCase()));
hud.playBtn.addEventListener('click', () => {
  audio.unlock();
  setOverlay(hud, false);
  renderer.domElement.requestPointerLock();
  if (S.phase === 'menu') { S.phase = 'buy'; startRound(ctx); }
});

// Pointer lock can be refused headless (no user gesture) — never let it throw.
const _requestLock = renderer.domElement.requestPointerLock.bind(renderer.domElement);
renderer.domElement.requestPointerLock = (...args) => {
  try {
    const r = _requestLock(...args);
    if (r && typeof r.catch === 'function') r.catch(() => {});
    return r;
  } catch { return undefined; }
};

// ---- Context object handed to rounds/bots/buy. ----
const ctx = {
  player, bots, map, hud, audio, fx, weapons: WEAPONS, loadout,
  raycaster, walls: map.wallMeshes,
  resetBots: () => resetBots(bots, map, S.round),
  renderBuy: () => renderBuy(hud, loadout),
  setViewmodel: (id) => setViewmodel(vm, id),
  bombPos: () => _tmp.set(S.bomb.x, 0.5, S.bomb.z),
  onDamage: (agent, dmg, head, attacker) => damageAgent(ctx, agent, dmg, head, attacker),
  onKill: () => {},
  onPlant: (bot, site) => plantBomb(bot, site),
  onDefuse: (bot) => defuseBomb(bot),
};

function toggleBuy() {
  if (S.phase !== 'buy') return;
  const open = hud.buy.hidden;
  setBuyOpen(hud, open);
  if (open) renderBuy(hud, loadout);
}

function tryScope(on) {
  if (loadout.current !== 'nightpiercer') { S.scoped = false; return; }
  S.scoped = on && player.alive && S.phase === 'live';
  camera.fov = S.scoped ? 30 : 74;
  camera.updateProjectionMatrix();
  renderer.toneMappingExposure = S.scoped ? 1.7 : 1.0;
}

function startReload() {
  const def = WEAPONS[loadout.current];
  if (!def || def.kind === 'melee' || def.kind === 'grenade') return;
  if (loadout.reloading || loadout.mag >= def.mag || loadout.reserve <= 0) return;
  loadout.reloading = true;
  loadout.reloadT = def.reload;
  audio.reload();
}

function throwCurrentGrenade() {
  const def = WEAPONS[loadout.current];
  if (!def || def.kind !== 'grenade') return;
  if ((loadout.grenades[loadout.current] || 0) <= 0) { audio.denied(); return; }
  loadout.grenades[loadout.current]--;
  eyePos(player, _origin);
  aimDir(player, _dir);
  throwGrenade(grenades, scene, loadout.current, _origin, _dir, fx);
  if (loadout.grenades[loadout.current] <= 0) equip(ctx, 'vesper');
}

function plantBomb(agent, site) {
  S.bomb.state = 'planted';
  S.bomb.site = site;
  S.bomb.x = SITES[site].cx + 3.5;
  S.bomb.z = SITES[site].cz + 2;
  S.bomb.timer = 35;
  S.bomb.plantT = 0;
  if (agent === player) S.plantedByPlayer = true;
  audio.plantBeep();
  showBanner(hud, `BOMB PLANTED — SITE ${site}`, 'Wardens: defend it. Jackals: defuse it.', 3000);
}

function defuseBomb(agent) {
  S.bomb.state = 'defused';
  endRound(ctx, TEAM.JACKAL, `The bomb was defused by ${agent.name || 'a Jackal'}`);
}

function playerShoot() {
  const def = WEAPONS[loadout.current];
  if (!def) return;
  if (loadout.cooldown > 0 || loadout.reloading) return;
  if (def.kind === 'melee' || def.kind === 'hybrid' && false) return;
  if (def.kind === 'grenade') { throwCurrentGrenade(); return; }
  if (def.mag <= 0) { audio.dryFire(); startReload(); return; }
  loadout.mag--;
  loadout.cooldown = def.rof;
  // Spread: base + movement penalty; scoped sniper is laser-steady.
  const movingPenalty = player.groundSpeed > 0.6 ? def.moveSpread : 0;
  const spread = def.kind === 'sniper' && S.scoped ? def.scopedSpread : def.spread + movingPenalty;
  eyePos(player, _origin);
  aimDir(player, _dir);
  shootHitscan({
    origin: _origin, dir: _dir, def, spread,
    raycaster, walls: map.wallMeshes, targetMeshes: targetMeshes(),
    fx, audio, attacker: player,
    onHit: (agent, dmg, head) => damageAgent(ctx, agent, dmg, head, player),
  });
  audio.shot(player.pos, def, true, player.pos);
  fx.muzzleFlash();
  addNoise(player.pos.x, player.pos.z, 26);
  // Recoil: pitch kick + viewmodel kick.
  player.pitch += def.kick * 0.011;
  kick = Math.min(1, kick + def.kick * 0.35);
  if (loadout.mag === 0) startReload();
}

function playerMelee() {
  const def = WEAPONS[loadout.current];
  if (loadout.meleeCooldown > 0) return;
  loadout.meleeCooldown = def.rof;
  swingT = 0.45;
  eyePos(player, _origin);
  aimDir(player, _dir);
  meleeSwing({
    origin: _origin, dir: _dir, def, attacker: player,
    targets: bots.filter((b) => b.alive).map((b) => ({ agent: b })),
    fx, onHit: (agent, dmg, head) => damageAgent(ctx, agent, dmg, head, player),
  });
  audio.shot(player.pos, { kind: 'melee' }, true, player.pos);
}

// ---- Plant / defuse / pickup channel (hold E). ----
function updateInteract(dt) {
  if (S.phase !== 'live' || !player.alive) { hideProgress(hud); plantHeld = 0; return; }
  const eHeld = keysHeld.has('e');
  const site = inSite(player.pos.x, player.pos.z);
  // Pick up a dropped bomb by walking over it.
  if (S.bomb.state === 'dropped' && Math.hypot(S.bomb.x - player.pos.x, S.bomb.z - player.pos.z) < 1.6) {
    S.bomb.state = 'carried';
    hud.showBanner(hud, 'BOMB PICKED UP', 'Carry it to A or B and hold E to plant.', 2000);
  }
  if (eHeld && site && S.bomb.state === 'carried') {
    plantHeld += dt;
    showProgress(hud, `PLANTING — SITE ${site}`, plantHeld / 3);
    if (plantHeld >= 3) { plantBomb(player, site); plantHeld = 0; hideProgress(hud); }
  } else if (eHeld && site === S.bomb.site && S.bomb.state === 'planted') {
    // The player is a Warden; defuse is a Jackal job — but a Warden holding E near a
    // planted bomb does nothing. (Kept explicit so the code reads honestly.)
    hideProgress(hud);
  } else {
    plantHeld = 0;
    hideProgress(hud);
  }
}

function inSite(x, z) {
  for (const [key, s] of Object.entries(SITES)) {
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return key;
  }
  return null;
}

// ---- Fixed-step simulation. ----
function step(dt) {
  S.time += dt;
  if (S.phase === 'menu') {
    // Slow orbit over the yard behind the menu overlay.
    camera.position.set(Math.sin(S.time * 0.08) * 26, 17, 24);
    camera.lookAt(0, 0, -6);
    return;
  }
  updateRound(ctx, dt);
  if (S.phase === 'buy' || S.phase === 'live') {
    // Player.
    player.scoped = S.scoped;
    updatePlayer(player, dt, input, map.colliders);
    // Night pocket: site B is dim — the scope's night-vision matters there.
    S.nightArea = inSite(player.pos.x, player.pos.z) === 'B';
    // Cooldowns.
    if (loadout.cooldown > 0) loadout.cooldown -= dt;
    if (loadout.meleeCooldown > 0) loadout.meleeCooldown -= dt;
    if (swingT > 0) swingT -= dt;
    if (loadout.reloading) {
      loadout.reloadT -= dt;
      if (loadout.reloadT <= 0) {
        const def = WEAPONS[loadout.current];
        const need = def.mag - loadout.mag;
        const take = Math.min(need, loadout.reserve);
        loadout.mag += take; loadout.reserve -= take;
        loadout.reloading = false;
      }
    }
    // Firing (hold for autos, click for semis — headless shot mode fires once).
    if (input.firing && S.phase === 'live' && player.alive) {
      const def = WEAPONS[loadout.current];
      if (def.kind === 'melee') playerMelee();
      else playerShoot();
    }
    if (keysHeld.has('v')) {
      const def = WEAPONS[loadout.current];
      if ((def.kind === 'melee' || def.kind === 'hybrid') && loadout.meleeCooldown <= 0) playerMelee();
    }
    updateInteract(dt);
    // Bots.
    updateBots(bots, dt, {
      map, player, raycaster, walls: map.wallMeshes, targetMeshes: targetMeshes(),
      fx, audio,
      onDamage: (agent, dmg, head, attacker) => damageAgent(ctx, agent, dmg, head, attacker),
      onKill: () => {},
      onPlant: (bot, site) => plantBomb(bot, site),
      onDefuse: (bot) => defuseBomb(bot),
    });
    // Grenades.
    updateGrenades(grenades, dt, {
      colliders: map.colliders, agents: [player, ...bots].filter((a) => a.alive),
      fx, audio, scene, smokes: S.smokes, attacker: player,
      onDamage: (agent, dmg, attacker) => damageAgent(ctx, agent, dmg, false, attacker),
    });
    // Bomb prop position.
    if (S.bomb.state === 'planted' || S.bomb.state === 'dropped') {
      bombMesh.visible = true;
      bombMesh.position.set(S.bomb.x, 0.35, S.bomb.z);
      bombLight.material.color.setHex(Math.sin(S.time * 8) > 0 ? 0xff3b2e : 0x550000);
    } else bombMesh.visible = false;
  }
  // Camera follows the player head every step.
  eyePos(player, _tmp);
  camera.position.copy(_tmp);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  // Recoil decay + viewmodel.
  kick = Math.max(0, kick - dt * 5);
  updateViewmodel(vm, S.time, player.moving, kick, Math.max(0, swingT));
}

// ---- Render loop. ----
let lastTime = performance.now();
let accumulator = 0;
let frozen = false;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (frozen) return;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += dt;
  let n = 0;
  while (accumulator >= FIXED_STEP && n < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    n++;
  }
  updateFx(fxObj, dt);
  updateHud(hud, loadout);
  renderer.render(scene, camera);
  frames++;
  if (frames % 60 === 0) {
    debug({ phase: S.phase, round: S.round, score: [S.scoreW, S.scoreJ], alive: [S.aliveW, S.aliveJ], hp: Math.ceil(S.health), money: S.money, time: Math.ceil(S.roundTime), frames });
  }
}

// ---- Shot staging: deterministic frames for screenshots. ----
function runShot(kind) {
  setOverlay(hud, false);
  S.phase = 'buy';
  startRound(ctx);
  if (kind === 'buy') {
    // Freeze frame: buy menu open at spawn, looking up mid.
    player.pos.x = 0; player.pos.z = 21; player.yaw = 0; player.pitch = 0.02;
    setBuyOpen(hud, true);
    renderBuy(hud, loadout);
    S.freezeTime = 5;
  } else if (kind === 'duel') {
    S.phase = 'live';
    S.freezeTime = 0;
    setBuyOpen(hud, false);
    loadout.owned.longshadow = true;
    equip(ctx, 'longshadow');
    player.pos.x = 0; player.pos.z = 6; player.yaw = 0; player.pitch = 0;
    const enemy = bots.find((b) => b.team === TEAM.JACKAL);
    // Stage the enemy off the centre pillar's line so it is visible in mid.
    enemy.pos.x = 2.5; enemy.pos.z = -7;
    enemy.mesh.position.set(2.5, 0, -7);
    enemy.yaw = Math.PI;
    enemy.mesh.rotation.y = Math.PI;
    // A few live steps so the world settles, then re-stage and fire one fresh shot
    // so the tracer + muzzle flash are in the frozen frame.
    input.firing = true;
    for (let i = 0; i < 30; i++) step(FIXED_STEP);
    input.firing = false;
    enemy.pos.x = 2.5; enemy.pos.z = -7;
    enemy.mesh.position.set(2.5, 0, -7);
    enemy.mesh.rotation.y = Math.PI;
    // Re-aim flat at the bot (recoil pitch from the staged shots would loft it over).
    player.yaw = Math.atan2(-(2.5 - player.pos.x), -(-7 - player.pos.z));
    player.pitch = 0;
    loadout.cooldown = 0;
    playerShoot();
    step(FIXED_STEP); // sync camera to the new aim before the frozen render
  } else if (kind === 'plant') {
    S.phase = 'live';
    S.freezeTime = 0;
    setBuyOpen(hud, false);
    loadout.owned.longshadow = true;
    equip(ctx, 'longshadow');
    // Stand south of the plant crate, looking north at it, the site ring and the site.
    player.pos.x = -16.5; player.pos.z = -10.5; player.yaw = 0.05; player.pitch = -0.08;
    S.bomb.state = 'carried';
    // Ally visible on site left, enemy visible at the A doorway right.
    const ally = bots.find((b) => b.team === TEAM.WARDEN);
    ally.pos.x = -22; ally.pos.z = -15; ally.mesh.position.set(-22, 0, -15); ally.yaw = 2.6; ally.mesh.rotation.y = 2.6;
    const enemy = bots.find((b) => b.team === TEAM.JACKAL);
    enemy.pos.x = -12.5; enemy.pos.z = -13; enemy.mesh.position.set(-12.5, 0, -13); enemy.yaw = -2.4; enemy.mesh.rotation.y = -2.4;
    plantHeld = 2.1; // mid-plant progress bar in frame
    keysHeld.add('e');
    for (let i = 0; i < 20; i++) step(FIXED_STEP);
    keysHeld.delete('e');
  }
  // Render twice, freeze, signal readiness.
  renderer.render(scene, camera);
  updateHud(hud, loadout);
  renderer.render(scene, camera);
  frozen = true;
  debug({ phase: S.phase, round: S.round, shot: kind, alive: [S.aliveW, S.aliveJ], hp: Math.ceil(S.health), money: S.money, frames });
  window.__shotReady = true;
}

if (shot) runShot(shot);
else requestAnimationFrame(frame);

// Debug/test handle (read-only state + input for headless play tests).
window.__veil = { S, player, bots, loadout, input, grenades };
