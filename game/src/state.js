// VEILPOINT — state.js: the one central store. Every module reads and writes game
// state through this object only; rendering never owns simulation data.
export const TEAM = { WARDEN: 0, JACKAL: 1 };

export const S = {
  // Flow: 'menu' (overlay) -> 'buy' (freeze, buy menu) -> 'live' -> 'over' (round banner)
  phase: 'menu',
  round: 1,
  scoreW: 0,
  scoreJ: 0,
  money: 800,
  lossStreak: 0,
  roundTime: 100,
  freezeTime: 6,
  bomb: { state: 'carried', site: null, x: 0, z: 0, timer: 0, plantT: 0, defuseT: 0 },
  // Sim clock (seconds, fixed-step) and frame clock for render-only effects.
  time: 0,
  seed: 1,
  // Player-facing readouts, kept here so HUD and sim never drift apart.
  health: 100,
  aliveW: 5,
  aliveJ: 5,
  kills: [], // killfeed: { text, t } newest last
  noise: [], // heard events: { x, z, r, t } — bots react to these
  smokes: [], // { x, y, z, r, until } — block sight and thermal
  winner: null, // 0 Wardens, 1 Jackals
  winReason: '',
  overT: 0, // seconds since round ended
  scoped: false,
  nightArea: false, // player currently inside the dim site B pocket
  plantedByPlayer: false,
  shot: null, // 'buy' | 'duel' | 'plant' when ?shot= is present
};

export function resetRound() {
  S.phase = 'buy';
  S.roundTime = 100;
  S.freezeTime = 6;
  S.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: 0, plantT: 0, defuseT: 0 };
  S.noise.length = 0;
  S.smokes.length = 0;
  S.winner = null;
  S.winReason = '';
  S.overT = 0;
  S.scoped = false;
  S.plantedByPlayer = false;
}

export function addKill(text) {
  S.kills.push({ text, t: S.time });
  if (S.kills.length > 5) S.kills.shift();
}

export function addNoise(x, z, r) {
  S.noise.push({ x, z, r, t: S.time });
  if (S.noise.length > 24) S.noise.shift();
}

// Round economy: win pays 3250, loss pays 1900 + 500 per consecutive loss (cap 3400).
export function payRound(won) {
  if (won) {
    S.money += 3250;
    S.lossStreak = 0;
  } else {
    S.money += Math.min(1900 + 500 * S.lossStreak, 3400);
    S.lossStreak += 1;
  }
}
