// VEILPOINT — rounds.js: round flow and combat resolution. One place decides who
// dies, who gets paid and when a round ends, so the HUD, the sim and the bots agree.
import { S, TEAM, resetRound, payRound, addKill } from './state.js';
import { setBuyOpen, hideProgress, showBanner, showHitmarker } from './hud.js';

export function startRound(ctx) {
  resetRound();
  const { player, bots, map } = ctx;
  player.hp = 100; player.alive = true; S.health = 100;
  player.pos.x = map.spawnsW[0][0]; player.pos.z = map.spawnsW[0][1];
  player.vel.x = 0; player.vel.z = 0;
  player.yaw = 0; player.pitch = 0;
  // Reset bots (positions, hp, routes, carrier) — see bots.js.
  ctx.resetBots();
  // Player loadout: keep owned guns, refill mags, keep grenades bought this round.
  const l = ctx.loadout;
  const def = ctx.weapons[l.current];
  if (def.kind !== 'melee' && def.kind !== 'grenade') {
    l.mag = def.mag; l.reserve = def.reserve;
  }
  l.cooldown = 0; l.reloading = false;
  S.aliveW = 1 + bots.filter((b) => b.team === TEAM.WARDEN && b.alive).length;
  S.aliveJ = bots.filter((b) => b.team === TEAM.JACKAL && b.alive).length;
  setBuyOpen(ctx.hud, true);
  ctx.renderBuy();
  ctx.audio.roundStart();
}

export function endRound(ctx, winner, reason) {
  if (S.phase === 'over') return;
  S.phase = 'over';
  S.winner = winner;
  S.winReason = reason;
  S.overT = 0;
  S.scoped = false;
  const playerWon = winner === TEAM.WARDEN;
  if (playerWon) { S.scoreW++; } else { S.scoreJ++; }
  payRound(playerWon);
  setBuyOpen(ctx.hud, false);
  hideProgress(ctx.hud);
  showBanner(ctx.hud,
    playerWon ? 'WARDENS WIN THE ROUND' : 'JACKALS WIN THE ROUND',
    `${reason} · +$${playerWon ? 3250 : Math.min(1900 + 500 * (S.lossStreak - 1), 3400)} · next round in 4s`,
    3800);
  if (playerWon) ctx.audio.roundWin(); else ctx.audio.roundLose();
}

export function damageAgent(ctx, agent, dmg, head, attacker) {
  if (!agent.alive || S.phase === 'over') return;
  agent.hp -= dmg;
  const isPlayer = agent === ctx.player;
  if (isPlayer) {
    S.health = Math.max(0, agent.hp);
    ctx.audio.hurt();
    showHitmarker(ctx.hud, false);
  } else if (attacker === ctx.player) {
    showHitmarker(ctx.hud, head);
    if (head) ctx.audio.headshot(); else ctx.audio.hit();
  }
  if (agent.hp <= 0) {
    agent.alive = false;
    agent.hp = 0;
    if (isPlayer) {
      S.health = 0;
      showBanner(ctx.hud, 'YOU ARE DOWN', 'Your team fights on — spectate the round.', 2600);
    } else {
      agent.mesh.visible = false;
      // Death: fall the mesh flat for a beat, then hide (handled by mesh.visible above).
      agent.mesh.rotation.x = -Math.PI / 2;
      agent.mesh.position.y = 0.2;
    }
    const aName = attacker === ctx.player ? 'You' : attacker.name || '???';
    const vName = isPlayer ? 'You' : agent.name;
    const vTeam = isPlayer ? 'W' : agent.team === TEAM.WARDEN ? 'W' : 'J';
    addKill(`${aName} ▸ ${vName}${head ? ' (headshot)' : ''}`);
    if (attacker === ctx.player) { S.money += 300; ctx.renderBuy(); }
    // Bomb drops if the carrier dies.
    if (agent.carrier) {
      agent.carrier = false;
      S.bomb.state = 'dropped';
      S.bomb.x = agent.pos.x; S.bomb.z = agent.pos.z;
    }
    recountAlive(ctx);
  }
}

function recountAlive(ctx) {
  S.aliveW = (ctx.player.alive ? 1 : 0) + ctx.bots.filter((b) => b.team === TEAM.WARDEN && b.alive).length;
  S.aliveJ = ctx.bots.filter((b) => b.team === TEAM.JACKAL && b.alive).length;
}

export function updateRound(ctx, dt) {
  if (S.phase === 'buy') {
    S.freezeTime -= dt;
    if (S.freezeTime <= 0) {
      S.phase = 'live';
      setBuyOpen(ctx.hud, false);
      showBanner(ctx.hud, `ROUND ${S.round} — GO`, 'Wardens: plant the bomb at A or B. Jackals: hold the sites.', 2200);
    }
    return;
  }
  if (S.phase === 'over') {
    S.overT += dt;
    if (S.overT > 4) {
      S.round++;
      startRound(ctx);
    }
    return;
  }
  if (S.phase !== 'live') return;
  S.roundTime -= dt;
  // Bomb ticking.
  if (S.bomb.state === 'planted') {
    S.bomb.timer -= dt;
    if (Math.ceil(S.bomb.timer) !== Math.ceil(S.bomb.timer + dt)) ctx.audio.plantBeep();
    if (S.bomb.timer <= 0) {
      ctx.fx.explosion(ctx.bombPos());
      ctx.audio.explosion(ctx.bombPos(), ctx.player.pos);
      S.bomb.state = 'detonated';
      endRound(ctx, TEAM.WARDEN, 'The bomb detonated at site ' + S.bomb.site);
      return;
    }
  }
  // Elimination wins.
  if (S.aliveJ === 0) { endRound(ctx, TEAM.WARDEN, 'Jackals eliminated'); return; }
  if (S.aliveW === 0) {
    if (S.bomb.state === 'planted') { /* round continues until the bomb resolves */ }
    else { endRound(ctx, TEAM.JACKAL, 'Wardens eliminated'); return; }
  }
  // Time expiry: defenders win unless the bomb is planted.
  if (S.roundTime <= 0 && S.bomb.state !== 'planted') {
    endRound(ctx, TEAM.JACKAL, 'Time expired — the sites held');
  }
}
