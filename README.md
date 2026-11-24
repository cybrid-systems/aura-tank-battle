# aura-tank-battle

Playable headless tank battle for the M4 green-field sample
([aura-agents#20](https://github.com/cybrid-systems/aura-agents/issues/20),
[#27](https://github.com/cybrid-systems/aura-agents/issues/27)).

The game is a deterministic integer-grid state machine. The same
`arena:step` runs in the live rehearsal fibers and in the headless entry;
there is no renderer and no target probe.

## Run

```bash
aura run game/main.aura
aura test
aura run bootstrap/run.aura
```

## Acceptance

`tests/game_test.aura` drives the real arena through the #23 frame
contract: movement, fire, brick vs steel, water, base loss, enemy destroy,
clear win, score/lives and the frame budget. `game/main.aura` is the
playable headless script.

The repository owns the bootstrap seed and the frozen sentinel plane.
See `docs/principles.md` and `docs/seed.md`.
