# aura-tank-battle

A playable tank battle that runs in your terminal. The arena, enemy patrol,
bullets, scoring, levels and the ASCII board are one deterministic
[Aura](https://github.com/cybrid-systems/aura) state machine. The demo, the
golden tests and interactive play all call the same `arena:step`.

```
.E....E....E.
.............
.............
.............
.............
.............
..S..........
.............
........~....
.............
.....###.....
.....#.#.....
....P.B......
```

`P` is you. `B` is the base. Keep it alive.

## Quick start

Linux x86_64 or arm64, `bash`, `curl`, and Python 3 for the baseline check.
No C compiler, CMake or Docker.

```bash
git clone https://github.com/cybrid-systems/aura-tank-battle.git
cd aura-tank-battle
./play.sh
```

`./play.sh` downloads the [Aura nightly](https://github.com/cybrid-systems/aura/releases/tag/nightly)
(sha256-checked, cached in `~/.cache/aura-agents`) and starts the board.
Type one command per line:

| Command | Action |
| --- | --- |
| `w` or `up` | Move up |
| `a` or `left` | Move left |
| `s` or `down` | Move down |
| `d` or `right` | Move right |
| `f` or `fire` | Fire |
| `.` or `wait` | Spend a turn without moving |
| `q` or `quit` | Leave the board |

Already have Aura? `AURA_BIN=/path/to/aura ./play.sh`. Pin a release with
`AURA_VERSION=v0.3.4 ./play.sh`. On a Mac, run the same script in an
[OrbStack](https://orbstack.dev) or Docker Desktop Linux VM; the nightly is a
Linux binary.

Prefer no typing? `./demo.sh` runs a deterministic four-turn demo and prints
the board, score, lives and frame budget.

## How to play

You have three lives. A hit costs one life, respawns you at the start and
gives you a short shield; the next hit during the shield is absorbed. Enemy
rounds travel down, break bricks, stop on steel and pass through water.
Enemy tanks close on the base column, then descend one row per turn and fire
down that lane. Destroy all three with `f` to load the next level. A level
starts with a different brick, steel and water layout. Clear both levels to
win; lose the base or your last life and the run ends.

The score is 100 per enemy. `enemy-score`, `player-speed`,
`fire-cooldown` and `enemy-cooldown` are tuning keys (see
[Tuning](#tuning)). The HUD under the board shows tick, score, lives, level,
enemies left, shield turns and status.

## What the demo prints

`./demo.sh` drives the arena with a fixed input script. The important lines
are:

```
demo=ok
tick=4
player-x=4
bullets=1
bricks=4
enemies=3
score=0
lives=3
level=1
status=playing
frames=4
assertions-ok=#t
```

`assertions-ok=#t` means every frame passed the checks in
`game/assert.aura`: state advances, score/lives stay in range, the frame
budget stays under 50 ms and the visual keyframe flag is set. The board is
printed after the counters.

## How it works

`game/arena.aura` is the whole game. `arena:new` builds a 13×13 state with
the player, base, bricks, steel, water, enemies, score and lives.
`arena:step` takes that state and one input hash and returns the next state
plus an `events` list. The order is fixed:

1. tick and shield decay
2. player movement
3. player fire
4. bullet movement and hits
5. enemy patrol and fire
6. level clear / win

The other files are deliberately small:

| File | Role |
| --- | --- |
| `game/render.aura` | Pure state → ASCII board and HUD strings |
| `game/input.aura` | Pure command line → arena input hash |
| `game/play.aura` | Interactive stdin loop; no game rules |
| `game/main.aura` | Deterministic demo used by `./demo.sh` and CI |
| `game/assert.aura` | Per-frame acceptance checks and `game:run` |

Because `arena:step` is pure and deterministic, the tests replay exact
inputs and compare stdout with `tests/*.golden`.

## Tuning

```aura
(require "game/arena" all:)

(define st
  (arena:new (hash "seed" 42
                   "levels" 3
                   "tuning" (hash "player-speed" 2
                                  "fire-cooldown" 2
                                  "enemy-cooldown" 4
                                  "enemy-score" 200))))
(arena:step st (hash "move" "up"))
```

| Key | Default | Meaning |
| --- | --- | --- |
| `player-speed` | 1 | Grid steps per move input |
| `fire-cooldown` | 3 | Turns before the player can fire again |
| `enemy-cooldown` | 6 | Turns after an enemy shot before it can fire again |
| `enemy-score` | 100 | Points for destroying one enemy |

`seed` is stored in the state for reproducibility. The current patrol is
deterministic and does not use randomness, so the same inputs always produce
the same board.

## Checks

```bash
./check.sh
```

That runs the baseline pin check, the five golden test files, the demo and one
scripted play turn. To run Aura directly:

```bash
aura test
aura test --update   # rewrite tests/*.golden after an intentional change
```

| Test | Covers |
| --- | --- |
| `tests/game_test.aura` | Movement, fire, bricks/steel/water, base loss, enemy kill, level clear, score/lives, enemy patrol and fire, shield, last life |
| `tests/render_test.aura` | Board, HUD and legend |
| `tests/input_test.aura` | Command aliases, wait and quit |
| `tests/seed_test.aura` | Bootstrap seed round, sentinel refusals and guarded PR plan |
| `tests/smoke_test.aura` | One-line runtime smoke |

`./check.sh` runs the same commands locally; `aura test` also works on its
own.

## Layout

```
game/       arena, renderer, input parser, interactive loop, demo, assertions
tests/      Aura golden tests and `.golden` stdout files
bootstrap/  one seed round without the conductor
engine/     seed candidates, fiber rehearsal, guarded PR plan
sentinel/   frozen sentinel plane
scripts/    Aura installer and baseline drift checker
docs/       bootstrap principles and seed notes
aura.toml   entry, preset, pinned nightly and aura-ci digest
baseline/   the shared orchestra baseline
play.sh     install Aura and start the board
demo.sh     install Aura and run the demo
check.sh    local gate (baseline + tests + demo + play smoke)
```

## CI and the Aura pin

`.github/workflows/ci.yml` runs in the pinned
`ghcr.io/cybrid-systems/aura-ci` image, installs the nightly through
`scripts/install-aura.sh` (archive sha256 checked), then runs the same checks.
`python3 scripts/check-baseline.py --self` fails closed if `aura.toml`,
`baseline/aura-baseline.json` or the workflow image reference drift.

The nightly tag is rebuilt in place. Bump the pin by editing `aura.toml`,
`baseline/aura-baseline.json` and the workflow image digest together; do not
move tags or releases from this repo.

## Bootstrap seed

The repository also owns the green-field seed that generated it:
`aura run bootstrap/run.aura` runs one in-process round, forks candidates
from one state, rehearses them in fibers, picks a winner and emits a guarded
PR plan. The sentinel plane is frozen and cannot be named by the evolvable
genome. See [docs/principles.md](docs/principles.md) and
[docs/seed.md](docs/seed.md).

## Troubleshooting

- `aura: command not found` — run `./play.sh`, or set
  `AURA_BIN=/path/to/aura`.
- `unsupported architecture` — the nightly ships Linux x86_64 and arm64. Use
  a Linux VM or OrbStack on macOS.
- The board waits for input — it reads one line per turn; type `q` and Enter
  to leave.
- A test diff after changing the arena — run `aura test --update` and review
  the golden change.
