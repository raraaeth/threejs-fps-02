// VEILPOINT — buy.js: the buy menu economy. Buys only happen during the buy phase;
// anything unaffordable or already owned is refused with a sound, never silently.
import { S } from './state.js';
import { WEAPONS } from './weapons.js';

export function tryBuy(ctx, id) {
  const w = WEAPONS[id];
  const l = ctx.loadout;
  if (!w || S.phase !== 'buy') return false;
  if (w.kind === 'grenade') {
    if (S.money < w.price || (l.grenades[id] || 0) >= 2) { ctx.audio.denied(); return false; }
    S.money -= w.price;
    l.grenades[id] = (l.grenades[id] || 0) + 1;
    ctx.audio.buy();
    ctx.renderBuy();
    return true;
  }
  if (l.owned[id]) {
    // Already owned: just equip it.
    equip(ctx, id);
    return true;
  }
  if (S.money < w.price) { ctx.audio.denied(); return false; }
  S.money -= w.price;
  l.owned[id] = true;
  equip(ctx, id);
  ctx.audio.buy();
  ctx.renderBuy();
  return true;
}

export function equip(ctx, id) {
  const l = ctx.loadout;
  const w = WEAPONS[id];
  if (!w) return;
  if (w.kind === 'grenade') {
    if ((l.grenades[id] || 0) <= 0) return;
    l.current = id;
  } else {
    if (!l.owned[id] && id !== 'excalibur') return;
    l.current = id;
    if (w.kind !== 'melee') {
      l.mag = w.mag;
      l.reserve = w.reserve;
    }
  }
  l.cooldown = 0; l.reloading = false; l.reloadT = 0;
  ctx.setViewmodel(id);
  S.scoped = false;
}

export function cycleWeapon(ctx) {
  const l = ctx.loadout;
  const order = ['vesper', 'gunblade', 'duskfang', 'longshadow', 'nightpiercer', 'excalibur'];
  const owned = order.filter((id) => l.owned[id] || id === 'excalibur');
  const grenades = ['ember', 'veil'].filter((id) => (l.grenades[id] || 0) > 0);
  const all = owned.concat(grenades);
  if (!all.length) return;
  const i = all.indexOf(l.current);
  equip(ctx, all[(i + 1) % all.length]);
}

export function refillForRound(ctx) {
  // Buy phase refill: owned guns get fresh mags, grenades persist.
  const l = ctx.loadout;
  const w = WEAPONS[l.current];
  if (w && w.kind !== 'melee' && w.kind !== 'grenade') {
    l.mag = w.mag; l.reserve = w.reserve;
  }
}
