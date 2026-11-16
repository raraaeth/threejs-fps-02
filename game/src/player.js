// VEILPOINT — player.js: first-person movement. Acceleration-based, so stopping to aim
// pays: speed bleeds off over ~0.25 s, and spread is read from ground speed.
import * as THREE from 'three';
import { moveCircle } from './map.js';

const WALK = 5.4;      // m/s standing
const CROUCH = 2.6;    // m/s crouched
const SCOPE = 2.2;     // m/s scoped
const ACCEL = 42;      // m/s^2
const FRICTION = 11;   // 1/s exponential damp when no input
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.38;

export function createPlayer(spawn) {
  return {
    pos: { x: spawn[0], z: spawn[1] },
    vel: { x: 0, z: 0 },
    yaw: 0, pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    scoped: false,
    moving: false,
    groundSpeed: 0,
    hp: 100, alive: true,
    _eyeV: new THREE.Vector3(),
    _dirV: new THREE.Vector3(),
  };
}

export function updatePlayer(p, dt, input, colliders) {
  if (!p.alive) return;
  // Look.
  p.yaw -= input.lookX;
  p.pitch -= input.lookY;
  const lim = 1.55;
  if (p.pitch > lim) p.pitch = lim;
  if (p.pitch < -lim) p.pitch = -lim;
  input.lookX = 0; input.lookY = 0;
  // Crouch.
  p.crouched = !!input.crouch;
  const targetEye = p.crouched ? EYE_CROUCH : EYE_STAND;
  p.eye += (targetEye - p.eye) * Math.min(1, dt * 12);
  // Wish direction from keys, rotated by yaw.
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let wx = -sin * f + cos * r;
  let wz = -cos * f - sin * r;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const maxSpeed = p.scoped ? SCOPE : p.crouched ? CROUCH : WALK;
  p.vel.x += wx * ACCEL * dt;
  p.vel.z += wz * ACCEL * dt;
  // Friction when no input; clamp to max speed.
  if (wl === 0) {
    const damp = Math.max(0, 1 - FRICTION * dt);
    p.vel.x *= damp; p.vel.z *= damp;
  }
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (sp > maxSpeed) { p.vel.x *= maxSpeed / sp; p.vel.z *= maxSpeed / sp; }
  moveCircle(p.pos, p.vel.x * dt, p.vel.z * dt, RADIUS, colliders);
  p.groundSpeed = Math.hypot(p.vel.x, p.vel.z);
  p.moving = p.groundSpeed > 0.6;
}

export function eyePos(p, out) {
  out.set(p.pos.x, p.eye, p.pos.z);
  return out;
}

export function aimDir(p, out) {
  const cp = Math.cos(p.pitch);
  out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  return out;
}
