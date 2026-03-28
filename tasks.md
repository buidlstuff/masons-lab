# Mason's Lab — Backlog / Plan Status
*Last updated: March 28, 2026.*

This file exists so future Codex sessions can see where the large plan docs were left off without having to infer it from commit history.

Important summary:

- There are **no dangerous half-finished jobs** from the big expansion passes.
- The repo is at a **clean checkpoint**.
- The remaining items below are mostly **intentional deferrals**, not broken in-between states.

---

## Status Of `parts-expansion-plan.md`

### Completed

Phases 0 through 6 are done in the live codebase:

1. **Phase 0** — infrastructure and runtime snapshot expansion
2. **Phase 1** — ramp, wall, platform, ball, rock
3. **Phase 2** — pulley, chain-sprocket, flywheel, gearbox
4. **Phase 3** — piston, rack, spring-linear
5. **Phase 4** — winch motor drive, crane-arm, counterweight, bucket
6. **Phase 5** — sand/material-pile and water
7. **Phase 6** — hinge, chute, silo-bin, tunnel

### Also completed beyond the original plan

After the formal phase plan, the codebase moved further into:

- explicit `rope` / `belt-link` / `chain-link` connector kinds
- routed pulley ropes via `viaIds`
- visible belt/chain links
- chassis-mounted drivetrains
- locomotive drive linkage from rotating parts
- wagon cargo flow
- wagon unloading into downstream systems
- public connector drawer actions

So the parts plan is no longer the full story. The repo has progressed beyond it.

### Intentionally not done

`parts-expansion-plan.md` Phase 7 was:

- **new projects/content rollout**
- **content epoch bump**

That was intentionally deferred.

Do **not** casually bump the content epoch or add a wave of new starter jobs unless the human explicitly wants a content rollout.

### Current recommendation

Treat `parts-expansion-plan.md` as:

- mostly **completed**
- still useful for guardrails/trap warnings
- **not** the main source of truth for what remains

---

## Status Of `codex-challenges-and-fun.md`

### Completed

The following parts of that plan are now materially in the repo:

#### Challenge system

- persistent challenge definitions in `src/lib/challenges.ts`
- challenge progress persistence in Dexie
- challenge toast/UI
- throttled challenge evaluation
- active-challenge limiting

#### Scene system

- silly scene definitions in `src/lib/silly-scenes.ts`
- scene selector UI
- fresh-draft scene loading
- world-level physics overrides
- reset-scene UX instead of silent loose-cargo respawn

#### Train/fun additions already shipped

- `station-zone`
- `trampoline`
- motor-assisted locomotives
- wagon loading and unloading
- train interaction with hopper/material flow

#### Follow-up polish already shipped after that plan

- public connector drawer actions
- clearer starter overlay
- scene reset button
- connector readiness / disabled states
- connector auto-selection and stronger rendering
- trampoline bounce fix

### Intentionally deferred

The main unfinished section from `codex-challenges-and-fun.md` is the later **Sprint 3** style work:

- medium-risk / high-risk silly scenes
- more temporal or event-heavy challenges
- anything requiring deeper collision-event infrastructure
- anything requiring true physical train bodies instead of progress-based train motion
- heavier environmental effects like earthquake/vortex style systems

These are not blocked partially-done jobs. They were simply left for later on purpose.

### Current recommendation

If future Codex returns to this plan, treat the next work as **optional polish/extension**, not required cleanup.

The most sensible next steps, if the human wants more here, are:

1. **Challenge polish**
   - clarify challenge progress UI
   - add or refine only a few high-signal medals
   - avoid event-heavy challenges unless the human explicitly wants that system

2. **Train polish**
   - improve rail-switch clarity and routing feedback
   - improve station visuals / teachability
   - keep train motion scripted unless there is a strong reason to migrate to real physics bodies

3. **Scene polish**
   - refine a few existing scenes
   - add at most a couple medium-risk scenes if they clearly improve delight
   - avoid huge scene-count growth

---

## Important "Do Not Accidentally Resume" Items

These are things a future Codex might wrongly assume should continue immediately.

### Do not resume a mass new-part expansion

The sandbox is already broad. The next work should usually be:

- clarity
- interaction quality
- polish
- challenge/content tuning

Not another large primitive explosion.

### Do not assume new projects need to be added now

The formal "new projects" phase from the parts plan was intentionally deferred.

### Do not assume trains need a full physics rewrite

Trains are currently progress-based and integrated enough for gameplay.
That is an acceptable simplification right now.

### Do not assume the old plan docs are exact source of truth

They are helpful, but the repo has moved past them.

Use:

- `current_state.md` for product/system truth
- this file for backlog / deferred-work truth

---

## Practical Next-Step Guidance

If the human says "continue the old plans," the best interpretation is:

- read `current_state.md`
- read this file
- only then decide whether to do:
  - polish
  - a focused challenge/content pass
  - a specific requested mechanic

The likely best next product work is **not** another giant engineering pass.
It is more likely:

- challenge tuning
- better onboarding clarity
- better scene quality
- quality-of-life UI improvements
- a small number of more intentional machine goals
