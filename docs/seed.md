# Bootstrap seed

Generated for aura-tank-battle by aura-agents #33.

Run one in-process round without the conductor:

```bash
aura run bootstrap/run.aura
```

The round forks candidates from one state, rehearses them in
fibers, selects one winner, and emits a guarded PR plan. The
sentinel plane stays outside the evolvable genome.
