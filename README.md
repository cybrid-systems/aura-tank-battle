# Aura Tank Battle

A browser tank battle for kids and their grown-ups: the arena is not a fixed
level. Each layout is an [Aura](https://github.com/cybrid-systems/aura) EDSL
form, and an `evo:trial` gate decides whether a wish becomes a new world
before it reaches the board. The child sees stickers, stars and 小光; the
grown-up can open the EDSL corner.

```
(level
  (name courtyard)
  (bricks (5 10) (6 10) (7 10) (5 11) (7 11))
  (steel (2 6))
  (water (8 8))
  (tuning (player-speed 1) (fire-cooldown 3)
          (enemy-cooldown 6) (enemy-score 100)))
```

Aura owns the arena and the evolution gate. The browser only draws the state
and sends one input per tick through a tiny Node bridge.

## Quick start

Linux x86_64 or arm64, `bash`, `curl`, Node.js 20+, and Python 3 for the
baseline check.

```bash
git clone https://github.com/cybrid-systems/aura-tank-battle.git
cd aura-tank-battle
./play.sh
```

`./play.sh` downloads the [Aura nightly](https://github.com/cybrid-systems/aura/releases/tag/nightly)
(sha256-checked, cached in `~/.cache/aura-agents`), starts the local bridge
and prints the page URL, normally <http://127.0.0.1:8090>. Open it.

Already have Aura? `AURA_BIN=/path/to/aura ./play.sh`. Pin a release with
`AURA_VERSION=v0.3.4 ./play.sh`. If the port is taken, the bridge prints the
next free one.

Hold the microphone button (or the `V` key) and speak; release to send.
Voice wishes use the browser's speech recognition (Chrome/Edge; Safari uses
its own). The bridge reads a DeepSeek key from `LLM_API_KEY` or
`DEEPSEEK_KEY_FILE` (default `~/code/keys/deepseek`), starts the arena with
`--grant network`, and prints `LLM wish: deepseek-flash`. No key, or no
network, keeps the sticker and typed wishes working through the local keyword
map. Only the recognized text is sent to Aura; the key never enters the repo
or the page. On a Mac, run the same script in an [OrbStack](https://orbstack.dev)
or Docker Desktop Linux VM; the nightly is a Linux binary.

No browser? `./term.sh` plays the same arena in the terminal, and
`./demo.sh` runs the deterministic headless demo.

## Play

| Key | Action |
| --- | --- |
| `W` / `A` / `S` / `D` or arrows | Move and face |
| `Space` | Fire in the facing direction |
| `E` | Wish for a new world |
| `V` (hold) | Talk a wish; release to send |
| `R` | Restart |

You have three lives. A hit costs one life, respawns you at the start and
gives you a 30-turn shield. Enemy rounds break bricks, stop on steel and pass
over water. Enemy tanks close on the base column, descend and fire down the
lane; a player round can clear a wall directly in front, but it cannot destroy
your own base.

A round is won when every enemy tank is gone. There is no final level: the
run is endless. Each clear advances the level, raises the difficulty and adds
tanks. Losing the base or your last life retries the same level with a lower
difficulty and a fresh set of three balloons; your stars stay.

## 无尽关卡 (endless)

- **过关定义**: the last enemy tank is destroyed. The HUD shows 第 N 关; there
  is no fixed final level.
- **升级**: the bridge calls `tank-evo:evolve` on the current level. A KEEP
  form becomes the next round; the difficulty rises by 0.35, enemy cooldown
  drops, and tank count grows with difficulty (2–8 on the top row).
- **输了**: difficulty drops by 0.5 (never below 1), the same level is retried
  with fewer tanks, lives reset to three, and the score is kept.
- **下一次许愿**: a kept wish starts a fresh endless run at level 1 with that
  theme; the old run's stars are reset.

The live progression is held in the state, so a browser refresh asks the
bridge for a new run; the EDSL/evolution side stays deterministic per seed.

## 许个愿 (the kid loop)

Press **许个愿** (or `E`), then hold the microphone (or hold `V`) and say
something like 「我想要会下雨的太空世界」; release to send. You can also type
a wish or pick a sticker: 🍭 糖果世界,
🦕 恐龙乐园, 🚀 太空基地, 🐠 海底泡泡, or 🌈 彩虹云朵. With a key, the LLM
turns the sentence into a theme plus a few water/brick cells; without one,
the local keyword map picks the closest theme. Aura then proposes three small
worlds, plays each one itself, and shows the ones that passed as mini boards.
The child taps a board and the new world starts. 小光, the companion orb,
levels up with every kept wish.

A world that fails the trial gets a "💨 再试试" card and is not offered. The
child never sees a form, a fitness number, or a scary Game Over; the grown-up
can open **家长** and turn on the developer panel to see the same
`(level ...)` forms and KEEP/ROLLBACK records.

## Under the hood: EDSL evolution

The developer panel and the wish cards use the same gate. The bridge asks
Aura for a round:

1. `tank-evo:mutate` proposes three EDSL variants of the current level: move
   a brick, add water or steel, or change a tuning key. The mutation uses
   `evo:rng`, so the same seed proposes the same three forms.
2. Each form is replayed by a deterministic autopilot for 80 ticks.
3. The replay runs inside `evo:trial`, so the live arena workspace is not
   touched. A form is `KEEP` only when the trial is feasible: the layout is
   inside budget, the base survives, and the frame budget holds. It must also
   match or beat the baseline fitness.
4. A `KEEP` form becomes the next arena and the panel shows its EDSL. A
   `ROLLBACK` keeps the current board.

The same round is available headless:

```bash
aura run game/evolve-demo.aura
```

It prints the baseline fitness, one line per candidate with `KEEP` or
`ROLLBACK`, and the winning `(level ...)` form.

## Architecture

| Path | Role |
| --- | --- |
| `game/arena.aura` | Pure 13×13 state machine: move, fire, patrol, bullets, levels |
| `game/level.aura` | Level EDSL compiler, validator and canonical printer |
| `game/evolve.aura` | Mutation, autopilot, fitness and the `evo:trial` gate |
| `game/progress.aura` | Endless next-round evolution and adaptive retry |
| `game/wish.aura` | Kid themes, voice/text wishes, and the three-world round |
| `game/server.aura` | Newline-JSON arena process used by the bridge |
| `game/render.aura` | Terminal board and HUD strings |
| `game/input.aura` | Terminal command parser |
| `game/play.aura` | Terminal loop |
| `bridge/server.mjs` | Static files plus `/api/new`, `/api/tick`, `/api/next`, `/api/retry`, `/api/wish`, `/api/wish-text`, `/api/keep`, `/api/evolve` |
| `web/` | Canvas renderer, HUD, overlay and evolution panel |
| `tests/` | Aura golden tests |
| `bootstrap/`, `engine/`, `sentinel/` | The original green-field seed round |
| `play.sh` | Install Aura and start the HTML bridge |
| `term.sh` | Install Aura and play the terminal board |
| `demo.sh`, `check.sh` | Headless demo and local gate |

The browser sends one action per 150 ms tick. `game/server.aura` applies the
same `arena:step` the tests use, so a replay is deterministic. The web preset
uses `enemy-pace 4`; the headless tests and autopilot use the default pace 1.

## Tuning

```aura
(require "game/arena" all:)

(define st
  (arena:new (hash "seed" 42
                   "levels" 3
                   "tuning" (hash "player-speed" 2
                                  "fire-cooldown" 2
                                  "enemy-cooldown" 4
                                  "enemy-score" 200
                                  "enemy-pace" 1))))
(arena:step st (hash "face" "up" "fire" #t))
```

| Key | Default | Meaning |
| --- | --- | --- |
| `player-speed` | 1 | Grid steps per move input |
| `fire-cooldown` | 3 | Ticks before the player can fire again |
| `enemy-cooldown` | 6 | Enemy ticks after a shot before it can fire again |
| `enemy-score` | 100 | Points for destroying one enemy |
| `enemy-pace` | 1 | Ticks between enemy actions (web uses 4) |

## Checks

```bash
./check.sh
```

That runs the baseline pin, the golden tests, the demo and one scripted play
turn. To run Aura directly:

```bash
aura test
aura test --update   # rewrite tests/*.golden after an intentional change
aura run game/evolve-demo.aura
```

| Test | Covers |
| --- | --- |
| `tests/game_test.aura` | Movement, fire, bricks/steel/water, base loss, enemy kill, level clear, score/lives, patrol, shield, last life |
| `tests/endless_test.aura` | Difficulty-scaled tank count and the endless `cleared` handoff |
| `tests/progress_test.aura` | Next-round evolution, carried score, adaptive retry |
| `tests/render_test.aura` | Board, HUD and legend |
| `tests/input_test.aura` | Command aliases, wait and quit |
| `tests/edsl_test.aura` | EDSL compile, round-trip and refusal cases |
| `tests/evolve_test.aura` | Autopilot win, trial verdict, deterministic evolve round |
| `tests/wish_test.aura` | Theme wish round, three KEEP candidates, autopilot win |
| `tests/seed_test.aura` | Bootstrap seed round and sentinel refusals |
| `tests/smoke_test.aura` | One-line runtime smoke |

## CI and the Aura pin

`.github/workflows/ci.yml` runs in the pinned
`ghcr.io/cybrid-systems/aura-ci` image, installs the nightly through
`scripts/install-aura.sh` (archive sha256 checked), then runs the tests,
demo, interactive smoke and the evolution demo.
`python3 scripts/check-baseline.py --self` fails closed if `aura.toml`,
`baseline/aura-baseline.json` or the workflow image reference drift.

The nightly tag is rebuilt in place. Bump the pin by editing `aura.toml`,
`baseline/aura-baseline.json` and the workflow image digest together; do not
move tags or releases from this repo.

## Bootstrap seed

The repository still owns the green-field seed that generated it:
`aura run bootstrap/run.aura` runs one in-process round, forks candidates
from one state, rehearses them in fibers, picks a winner and emits a guarded
PR plan. The sentinel plane is frozen and cannot be named by the evolvable
genome. See [docs/principles.md](docs/principles.md) and
[docs/seed.md](docs/seed.md).

## Troubleshooting

- `aura: command not found` — run `./play.sh`, or set
  `AURA_BIN=/path/to/aura`.
- The page says the bridge is offline — start `./play.sh` again and watch its
  printout; a port conflict moves the URL to the next free port.
- `unsupported architecture` — the nightly ships Linux x86_64 and arm64. Use
  a Linux VM or OrbStack on macOS.
- A test diff after changing the arena — run `aura test --update` and review
  the golden change.
