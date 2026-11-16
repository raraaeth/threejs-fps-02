// VEILPOINT — hud.js: every DOM readout. The sim writes numbers into S; this module
// is the only one that touches the HUD DOM, and it only writes when a value changed.
import { S } from './state.js';
import { WEAPONS, BUY_ORDER } from './weapons.js';

function el(id) { return document.getElementById(id); }

export function createHud() {
  const h = {
    health: el('health-num'), healthBar: el('health-bar'), ammoMag: el('ammo-mag'),
    ammoRes: el('ammo-reserve'), money: el('money'), timer: el('timer'),
    scoreW: el('score-w'), scoreJ: el('score-j'), round: el('round-num'),
    aliveW: el('alive-w'), aliveJ: el('alive-j'), feed: el('killfeed'),
    cross: el('crosshair'), hit: el('hitmarker'), banner: el('banner'),
    bannerTitle: el('banner-title'), bannerSub: el('banner-sub'),
    bomb: el('bomb-status'), progress: el('progress'), progressFill: el('progress-fill'),
    progressLabel: el('progress-label'), scope: el('scope'), night: el('night-tag'),
    buy: el('buy-menu'), buyList: el('buy-list'), buyMoney: el('buy-money'),
    overlay: el('overlay'), playBtn: el('play'),
    _cache: {},
  };
  return h;
}

function setText(h, key, node, value) {
  if (h._cache[key] !== value) { h._cache[key] = value; node.textContent = value; }
}

export function updateHud(h, loadout) {
  const def = WEAPONS[loadout.current];
  setText(h, 'hp', h.health, String(Math.max(0, Math.ceil(S.health))));
  h.healthBar.style.width = `${Math.max(0, S.health)}%`;
  h.healthBar.style.background = S.health > 50 ? '#39c2c9' : S.health > 25 ? '#e07b2e' : '#d23b2e';
  if (def.kind === 'melee') {
    setText(h, 'mag', h.ammoMag, '—');
    setText(h, 'res', h.ammoRes, 'Excalibur');
  } else if (def.kind === 'grenade') {
    setText(h, 'mag', h.ammoMag, String(loadout.grenades[loadout.current] || 0));
    setText(h, 'res', h.ammoRes, def.name);
  } else {
    setText(h, 'mag', h.ammoMag, String(loadout.mag));
    setText(h, 'res', h.ammoRes, `/ ${loadout.reserve} · ${def.name}`);
  }
  setText(h, 'money', h.money, `$${S.money}`);
  setText(h, 'timer', h.timer, fmtTime(S.phase === 'buy' ? S.freezeTime : S.roundTime));
  setText(h, 'sw', h.scoreW, String(S.scoreW));
  setText(h, 'sj', h.scoreJ, String(S.scoreJ));
  setText(h, 'round', h.round, `ROUND ${S.round}`);
  setText(h, 'aw', h.aliveW, `${S.aliveW} W`);
  setText(h, 'aj', h.aliveJ, `${S.aliveJ} J`);
  // Killfeed (last 5, newest at bottom).
  const feed = S.kills.slice(-5).map((k) => k.text).join('\n');
  setText(h, 'feed', h.feed, feed);
  // Bomb status line.
  const b = S.bomb;
  const bombText = b.state === 'planted' ? `BOMB PLANTED ${b.site} — ${Math.ceil(b.timer)}s`
    : b.state === 'carried' ? 'BOMB: carry to A or B, hold E to plant'
    : b.state === 'defused' ? 'BOMB DEFUSED' : 'BOMB DETONATED';
  setText(h, 'bomb', h.bomb, bombText);
  h.bomb.style.color = b.state === 'planted' ? '#ff5a4d' : '';
  // Scope overlay + night tag.
  h.scope.hidden = !S.scoped;
  h.night.hidden = !S.nightArea || S.scoped;
}

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function showHitmarker(h, head) {
  h.hit.classList.add('on');
  h.hit.style.setProperty('--hm', head ? '#ff5a4d' : '#f0a830');
  setTimeout(() => h.hit.classList.remove('on'), 110);
}

export function showBanner(h, title, sub, ms) {
  h.bannerTitle.textContent = title;
  h.bannerSub.textContent = sub || '';
  h.banner.hidden = false;
  setTimeout(() => { h.banner.hidden = true; }, ms || 3200);
}

export function showProgress(h, label, frac) {
  h.progress.hidden = false;
  h.progressLabel.textContent = label;
  h.progressFill.style.width = `${Math.round(frac * 100)}%`;
}
export function hideProgress(h) { h.progress.hidden = true; }

// Buy menu rows, rebuilt when money or ownership changes.
export function renderBuy(h, loadout) {
  const rows = BUY_ORDER.map((id, i) => {
    const w = WEAPONS[id];
    const owned = id === 'excalibur' || loadout.owned[id] || (w.kind === 'grenade' ? (loadout.grenades[id] || 0) > 0 : false);
    const count = w.kind === 'grenade' ? ` x${loadout.grenades[id] || 0}` : '';
    const price = owned && w.kind !== 'grenade' ? 'OWNED' : `$${w.price}`;
    const afford = S.money >= w.price;
    return `<div class="buy-row${owned && w.kind !== 'grenade' ? ' owned' : ''}${afford ? '' : ' poor'}"><span class="buy-key">${i + 1}</span><span class="buy-name">${w.name}${count}</span><span class="buy-kind">${w.kind}</span><span class="buy-price">${price}</span></div>`;
  }).join('');
  h.buyList.innerHTML = rows
    + `<div class="buy-row"><span class="buy-key">8</span><span class="buy-name">Excalibur</span><span class="buy-kind">melee</span><span class="buy-price">OWNED</span></div>`
    + `<div class="buy-hint">B / Esc close · 1–7 buy · Q next weapon · G throw grenade · E plant / defuse</div>`;
  h.buyMoney.textContent = `$${S.money}`;
}

export function setBuyOpen(h, open) { h.buy.hidden = !open; }
export function setOverlay(h, show, title, copy) {
  h.overlay.hidden = !show;
  if (title) document.getElementById('overlay-title').textContent = title;
  if (copy) document.getElementById('overlay-copy').textContent = copy;
}
