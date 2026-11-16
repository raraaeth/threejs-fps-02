# VEILPOINT

[![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/raraaeth/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/raraaeth/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A tactical three.js FPS in the Counter-Strike style — fully original map, art, sound
and names. Two teams fight short rounds in the **Duskworks Yard**, a dusk-industrial
yard with two bomb sites (A and B), a mid lane and three lanes worth playing.

**Wardens** attack: plant the bomb at site A or B, or eliminate the Jackals.
**Jackals** defend: hold the sites, defuse the bomb, or run the clock out.
Win rounds to earn money, then spend it in the buy menu on better steel.

## The arsenal

| Weapon | Price | Role |
| --- | --- | --- |
| Vesper (pistol) | $300 | Sidearm, accurate |
| Gunblade | $800 | Pistol + blade — shoot, or slash up close (V) |
| Duskfang (SMG) | $1,500 | Fast, close quarters |
| Longshadow (rifle) | $2,700 | The accurate workhorse |
| Nightpiercer (sniper) | $4,750 | Wallbangs one thin wall; scope has night-vision + thermal through smoke |
| Excalibur (sword) | free | Silent melee, big damage up close |
| Ember (HE grenade) | $300 | Blast damage |
| Veil (smoke grenade) | $300 | Blocks sight — and bot vision |

Economy: start at $800, +$3,250 for a round win, +$1,900 (rising with loss streak)
for a loss, +$300 per kill.

## The map

Duskworks Yard — 64 × 48 m, two sites, three lanes, a dim "night pocket" around
site B where the Nightpiercer's scope earns its keep. Dusk sun, teal shade, orange
trim. Bots patrol routes, hold positions, and react to what they see and hear.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and click to play. No network requests, no build step.

- **W A S D** move · **Mouse** look · **Click** fire
- **R** reload · **Ctrl** crouch · **B** buy menu (round start) · **Q** switch weapon
- **G** throw grenade · **E** plant the bomb (hold, on site) · **V** melee slash
- **Right-click** scope (Nightpiercer only)

Gunplay rewards stopping to aim: spread grows while moving, recoil kicks the aim
up, headshots deal extra damage, and crouching steadies the shot.

## Tech

- three.js 0.187.0, vendored under `game/vendor/three/`
- ES modules, no build step, no network requests
- Fixed-step (60 Hz) simulation kept apart from rendering; one central state store
- All sound synthesised with WebAudio — no external assets

## License

MIT — see [LICENSE](LICENSE).
