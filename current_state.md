# Mason's Lab — Current State
*Last updated: March 28, 2026. This file is the handoff doc for future Codex sessions.*

---

## What The Product Is Right Now

Mason's Lab (`masons-lab`) is a local-first React + Matter.js physics sandbox for kids.

The product is no longer just "3 starter projects." The current surface is:

1. **3 guided starter projects** that still anchor onboarding and progression
2. **Free-build sandbox** with a much larger part set
3. **25 sandbox challenges** (3 active at a time)
4. **10 silly scenes** that load as fresh drafts
5. **Blueprint save/mount flow** for sub-machines

Core rule remains unchanged:

**Every visible, editable part should have a real interaction vector in the live machine.**

No fake preview parts. No purely decorative machine widgets.

Repo: `buidlstuff/masons-lab`
Default branch: `main`
Recent head when this was updated: `4069790`

---

## Stack

| Layer | Tech |
|---|---|
| UI | React 19 + TypeScript |
| Rendering | p5.js 2.x |
| Physics | Matter.js 0.20 |
| Local storage | Dexie 4 / IndexedDB |
| Routing | React Router 7 |
| Validation | Zod 4 |
| Build | Vite 8 |
| Deploy | Vercel |

---

## Current Product Surface

### Guided projects

The 3 guided starter jobs are still the main "learn the sandbox" path:

1. **Spin the Gears**
2. **Feed the Hopper**
3. **Build the Loader**

These still matter. They are not legacy content. Future work should not casually break them.

### Free build

Free build now supports:

- drivetrain parts
- flow/processing parts
- rail/train parts
- connector creation
- silly scenes
- challenge evaluation

### Challenges

- `src/lib/challenges.ts` currently defines **25** challenge medals
- only **3** are active in the UI at once (`ACTIVE_CHALLENGE_LIMIT = 3`)
- challenge progress is persisted in Dexie via `challengeProgress`

### Silly scenes

- `src/lib/silly-scenes.ts` currently defines **10** scenes
- scenes load as **fresh drafts**
- scene cargo is intentionally allowed to stay where physics leaves it
- the UI exposes **Reset Scene** instead of silently respawning loose cargo

### Blueprints

- users can save machines
- users can save blueprints
- blueprints can be mounted into a fresh or existing draft

---

## Simulation Architecture

### Two runtime modes still exist

1. **Physics mode**
   - manifests without `metadata.recipeId`
   - uses `buildMatterWorld()` in [src/lib/physics-engine.ts](/Users/kyledavis/Documents/Claude/Projects/Build%20with%20AI/masons-lab/src/lib/physics-engine.ts)

2. **Recipe/scripted mode**
   - manifests with `metadata.recipeId`
   - still handled in [src/lib/simulation.ts](/Users/kyledavis/Documents/Claude/Projects/Build%20with%20AI/masons-lab/src/lib/simulation.ts)
   - this is mostly legacy showcase support, not the main product path

Do not assume recipe mode is gone. It still exists.

### The main runtime bridge

`RuntimeSnapshot` in [src/lib/simulation.ts](/Users/kyledavis/Documents/Claude/Projects/Build%20with%20AI/masons-lab/src/lib/simulation.ts) is the bridge between physics and React.

Important runtime fields now include:

- `rotations`
- `bodyPositions`
- `motorDrives`
- `gearMeshes`
- `hopperFill`
- `throughput`
- `cargoStates`
- `beltPowered`
- `lostCargoCount`
- `wagonLoads`
- `wagonCargo`
- `pistonExtensions`
- `bucketContents`
- `bucketStates`
- `springCompressions`
- `sandParticlePositions`

If you add a new live runtime field, update all of these together:

1. `PhysicsFrame` in `physics-engine.ts`
2. the `tick()` return object in `physics-engine.ts`
3. `RuntimeSnapshot` in `simulation.ts`
4. the physics-to-react mapping in `simulation.ts`
5. `createInitialSnapshot()` in `simulation.ts`
6. `createInitialRuntimeSnapshot()` in `BuildPage.tsx`

Missing any one of those will cause drift or stale UI behavior.

### Frame timing

Physics timing still works like this:

1. `Matter.Engine.update(...)` happens in `simulation.ts`
2. then `pw.tick(...)` in `physics-engine.ts`
3. then React gets a mapped `RuntimeSnapshot`

Do not move engine stepping into `tick()`.

---

## Major Systems That Now Exist

### Connectors

Connectors are now explicit part kinds:

- `rope`
- `belt-link`
- `chain-link`

Important design detail:

- these are **not** placed like normal canvas parts
- the drawer exposes public connector actions
- those actions create a connector from existing compatible parts already on the canvas

Current UX behavior:

- connector buttons are disabled until the needed compatible parts exist
- on creation, the new connector is auto-selected
- selected connectors render with stronger strokes, endpoint markers, and text labels

Connector rules today:

- `rope` is primarily winch/hook lifting control
- `belt-link` is for wheel/pulley/flywheel transmission
- `chain-link` is for sprocket transmission
- routed connectors use `viaIds`
- ropes can be routed through pulleys

This is **not** a full generic port graph. It is still an explicit, rule-based interaction system.

### Rotary drivetrain

There is now a usable rotary family:

- motor
- gear
- wheel
- pulley
- chain-sprocket
- flywheel
- gearbox

Important behavior:

- drive propagation is still proximity/mesh-based, not a rigid CAD-style assembly model
- flywheels preserve inertia and can continue driving after motors stop
- belts/chains are visible and explicit

### Linear / lifting parts

These are now live:

- piston
- rack
- spring-linear
- winch
- crane-arm
- bucket
- counterweight

Important note:

- these are simplified gameplay versions, not high-precision mechanical simulation

### Processing / materials

These are now live:

- conveyor
- hopper
- cargo-block
- ball
- rock
- material-pile / sand particles
- water
- silo-bin
- ramp / platform / wall / chute / tunnel / trampoline

Important recent fix:

- trampolines now bounce using a contact-band + cooldown approach
- they no longer rely only on a brittle post-collision velocity test

### Rail / train system

Train-related parts now exist and interact with the wider machine:

- rail-segment
- rail-switch
- locomotive
- wagon
- station-zone

Current train behavior:

- locomotives move along track progress, not rigid-body rail physics
- locomotives can be driven by nearby motors and by linked rotating parts
- wagons can load and unload cargo
- station zones give explicit load/unload areas
- wagons can unload into downstream systems like hoppers

This is no longer an isolated toy subsystem, but it is still a simplified rail model.

---

## Current UI Structure

Main builder page: [src/pages/BuildPage.tsx](/Users/kyledavis/Documents/Claude/Projects/Build%20with%20AI/masons-lab/src/pages/BuildPage.tsx)

Key pieces:

- `MachineCanvas`
- `PartPalette`
- `InspectorPanel`
- `ControlPanel`
- `StarterOverlay`
- `HudOverlay`
- `ChallengePanel`
- `SillySceneSelector`

Important current UX facts:

- the starter overlay was recently lightened and clarified
- the connector card is public and visible in the drawer
- silly scenes expose `Reset Scene`
- connector creation is now less "silent"

---

## Reliability Rules To Preserve

These are still important and should be treated as hard guardrails:

1. **Do not break `dragBufferRef` behavior in `MachineCanvas.tsx`.**
   Dragging should not rebuild physics every frame.

2. **Do not delete from `collectedCargoIds`.**
   Hopper fill is intentionally monotonic once collected.

3. **Do not change job success logic to depend on telemetry when it should use runtime state.**
   `runtime.rotations` is still the important truth source for live gear motion checks.

4. **Do not casually edit conveyor support generation.**
   Conveyor support bodies are why materials actually ride on belts.

5. **Do not make pinned rotating parts static by mistake.**
   Gears/pulleys/flywheels are generally dynamic bodies constrained in place, not `isStatic: true`.

6. **Do not break the p5-lite registration fix.**
   The builder previously fully blanked because `p5/core` addons were loaded incorrectly.
   If you touch lazy p5 boot code, preserve explicit addon registration.

7. **Keep connector semantics explicit.**
   Do not collapse `rope`, `belt-link`, and `chain-link` back into one overloaded primitive.

---

## Known Simplifications / Accepted Limits

These are real and currently acceptable:

- train motion is progress-based, not rigid-body-on-track physics
- connectors are explicit but the routing UX is still fairly lightweight
- the public connector drawer creates the first connector from compatible nearby parts; it is not a full manual connector authoring tool
- multiple motors competing for one driven system are still simplified
- hopper slot staging is still not a polished multi-hopper system
- recipe mode still exists but is not the main focus

Do not "fix" these casually unless there is a concrete product reason.

---

## What To Remember When Adding Or Changing Parts

When a new part is added, the work is usually spread across:

- `src/lib/types.ts`
- `src/lib/schema.ts`
- `src/lib/validation.ts`
- `src/lib/editor.ts`
- `src/components/PartPalette.tsx`
- `src/components/InspectorPanel.tsx`
- `src/components/MachineCanvas.tsx`
- `src/lib/physics-engine.ts`
- `src/lib/simulation.ts`
- scene/challenge/seed files if the new part is used there

If the part has live simulation state, also update the runtime snapshot chain described above.

If the part is public, it should have:

1. a reason to exist
2. at least one real interaction vector
3. an obvious visible outcome
4. at least one way for a kid to discover what it connects to

Do not add orphan parts.

---

## Current Challenge / Scene Layer

This is no longer speculative. It is live product surface.

Challenge layer:

- persistent medals
- throttled evaluation
- multiple categories
- saved progress in Dexie

Scene layer:

- fresh-draft scene loading
- world-level physics overrides
- scene-specific cargo behavior
- reset button instead of silent scene respawn

This means future Codex should not treat scenes/challenges as side experiments. They are now part of the product.

---

## Local Workflow Notes For Future Codex

### Read this too

For deferred-work status from the old expansion/fun plan docs, also read [tasks.md](/Users/kyledavis/Documents/Claude/Projects/Build%20with%20AI/masons-lab/tasks.md).

### Scratch files that should not be shipped

These are intentionally local-only in this workspace:

- `parts-expansion-plan.md`
- `codex-challenges-and-fun.md`
- `.playwright-cli/`

Local Git has already been configured to hide them from normal `git status`.
Do not undo that unless the human explicitly asks.

### PATH note in this Codex environment

In this desktop environment, `node` / `npm` / `npx` may not be on PATH by default.
If commands fail with "command not found," use:

```bash
PATH="/usr/local/bin:$PATH" npm ...
PATH="/usr/local/bin:$PATH" npx ...
```

That was needed during recent verification runs.

---

## Short Summary Of Where We Are

Mason's Lab is now a fairly broad sandbox with:

- stable starter projects
- public connectors
- drivetrain parts
- lifting/linear parts
- trains that actually tie into the machine graph
- scenes
- challenges

The next work should be **tightening clarity, polish, and reliability**, not exploding the part count much further.

If something new is added, it should deepen interactions more than widen the catalog.
