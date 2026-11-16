// VEILPOINT — fx.js: tracers, impacts, explosions, smoke and the muzzle flash.
// All effects are pooled/reused: no per-frame allocation in the render loop.
import * as THREE from 'three';
import { S } from './state.js';

const MAX_TRACERS = 24;

export function createFx(scene) {
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  // Impact sparks: one Points cloud, slots recycled.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(240 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.95 }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  // Smoke puffs: shared sprite material, one mesh per cloud slot.
  const smokeMat = new THREE.SpriteMaterial({ color: 0xb8c4c4, transparent: true, opacity: 0.55, depthWrite: false });
  const smokeSprites = [];
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(smokeMat.clone());
    sp.visible = false;
    scene.add(sp);
    smokeSprites.push(sp);
  }
  // Muzzle flash: a small additive plane at the camera, flashed by main.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0.34, -0.26, -0.85);
  flash.visible = false;
  return {
    scene, tracers, tracerPos, tracerLife: new Float32Array(MAX_TRACERS), tracerNext: 0,
    sparks, sparkPos, sparkLife: new Float32Array(240), sparkVel: new Float32Array(240 * 3), sparkNext: 0,
    smokeSprites, smokeNext: 0, flash, flashMat,
  };
}

export function tracer(fx, from, to, color) {
  const i = fx.tracerNext;
  fx.tracerNext = (fx.tracerNext + 1) % MAX_TRACERS;
  fx.tracerPos[i * 6] = from.x; fx.tracerPos[i * 6 + 1] = from.y; fx.tracerPos[i * 6 + 2] = from.z;
  fx.tracerPos[i * 6 + 3] = to.x; fx.tracerPos[i * 6 + 4] = to.y; fx.tracerPos[i * 6 + 5] = to.z;
  fx.tracerLife[i] = 0.09;
  fx.tracers.geometry.attributes.position.needsUpdate = true;
  fx.tracers.material.color.setHex(color || 0xffe9a8);
}

export function impact(fx, point, head) {
  for (let n = 0; n < 6; n++) {
    const i = fx.sparkNext;
    fx.sparkNext = (fx.sparkNext + 1) % 240;
    fx.sparkPos[i * 3] = point.x; fx.sparkPos[i * 3 + 1] = point.y; fx.sparkPos[i * 3 + 2] = point.z;
    fx.sparkVel[i * 3] = (Math.random() - 0.5) * 3;
    fx.sparkVel[i * 3 + 1] = Math.random() * 2.5;
    fx.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 3;
    fx.sparkLife[i] = 0.35;
  }
  fx.sparks.geometry.attributes.position.needsUpdate = true;
  if (head) fx.flashMat.color.setHex(0xff5a4d);
}

export function slash(fx, origin, dir) {
  const p = origin.clone().addScaledVector(dir, 1.4);
  impact(fx, p, false);
}

export function explosion(fx, pos) {
  impact(fx, pos, false);
  impact(fx, pos, false);
  const sp = fx.smokeSprites[fx.smokeNext];
  fx.smokeNext = (fx.smokeNext + 1) % fx.smokeSprites.length;
  sp.position.copy(pos);
  sp.scale.set(6, 6, 1);
  sp.material.color.setHex(0x3a3230);
  sp.material.opacity = 0.7;
  sp.visible = true;
  sp.userData.until = S.time + 1.6;
}

export function smokeCloud(fx, pos, smokes) {
  // One cloud = 3 overlapping sprites + a state entry that blocks bot sight.
  for (let n = 0; n < 3; n++) {
    const sp = fx.smokeSprites[fx.smokeNext];
    fx.smokeNext = (fx.smokeNext + 1) % fx.smokeSprites.length;
    sp.position.set(pos.x + (Math.random() - 0.5) * 3, 1.1 + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 3);
    sp.scale.set(4.5, 4.5, 1);
    sp.material.color.setHex(0xb8c4c4);
    sp.material.opacity = 0.6;
    sp.visible = true;
    sp.userData.until = S.time + 12;
  }
  smokes.push({ x: pos.x, y: 1.2, z: pos.z, r: 3.2, until: S.time + 12 });
}

export function muzzleFlash(fx) {
  fx.flash.visible = true;
  fx.flashMat.opacity = 0.85;
}

// Adapter with the method shape weapons.js / main.js call: fx.tracer(a, b, color) etc.
export function fxApi(fxObj, audio) {
  return {
    tracer: (a, b, c) => tracer(fxObj, a, b, c),
    impact: (p, h) => impact(fxObj, p, h),
    slash: (o, d) => slash(fxObj, o, d),
    explosion: (p) => explosion(fxObj, p),
    smokeCloud: (p, s) => smokeCloud(fxObj, p, s),
    muzzleFlash: () => muzzleFlash(fxObj),
    throwSound: () => audio.throwSound(),
  };
}

export function updateFx(fx, dt) {
  for (let i = 0; i < MAX_TRACERS; i++) {
    if (fx.tracerLife[i] > 0) {
      fx.tracerLife[i] -= dt;
      if (fx.tracerLife[i] <= 0) {
        fx.tracerPos[i * 6 + 3] = fx.tracerPos[i * 6];
        fx.tracerPos[i * 6 + 4] = fx.tracerPos[i * 6 + 1];
        fx.tracerPos[i * 6 + 5] = fx.tracerPos[i * 6 + 2];
        fx.tracers.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
  for (let i = 0; i < 240; i++) {
    if (fx.sparkLife[i] > 0) {
      fx.sparkLife[i] -= dt;
      fx.sparkPos[i * 3] += fx.sparkVel[i * 3] * dt;
      fx.sparkPos[i * 3 + 1] += fx.sparkVel[i * 3 + 1] * dt;
      fx.sparkPos[i * 3 + 2] += fx.sparkVel[i * 3 + 2] * dt;
      fx.sparkVel[i * 3 + 1] -= 6 * dt;
      if (fx.sparkLife[i] <= 0) fx.sparkPos[i * 3 + 1] = -100;
    }
  }
  fx.sparks.geometry.attributes.position.needsUpdate = true;
  for (const sp of fx.smokeSprites) {
    if (sp.visible && S.time > (sp.userData.until || 0)) sp.visible = false;
  }
  if (fx.flash.visible) {
    fx.flashMat.opacity -= dt * 9;
    if (fx.flashMat.opacity <= 0) fx.flash.visible = false;
  }
}
