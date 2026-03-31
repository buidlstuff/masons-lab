# Mason's Lab — Current State
*Last updated: March 30, 2026. This file is the handoff doc for future Codex sessions.*

---

## What The Product Is Right Now

Mason's Lab (`masons-lab`) is a local-first React + Matter.js physics sandbox for kids.

The product is no longer just "3 starter projects." The current surface is:

1. **3 guided starter projects** that still anchor onboarding and progression
2. **Free-build sandbox** with a much larger part set
3. **22 public sandbox challenges** (3 active at a time, with 3 train medals still left in code but hidden from the UI)
4. **18 public silly scenes** that load as fresh drafts (20 scenes still exist in code, with 2 train scenes hidden from the UI)
5. **Blueprint save/mount flow** for sub-machines

Core rule remains unchanged:

**Every visible, editable part should have a real interaction vector in the live machine.**

No fake preview parts. No purely decorative machine widgets.

Repo: `buidlstuff/masons-lab`
Default branch: `main`
Previous pushed checkpoint before this handoff: `55e081a`

---

## Reliability / UI Guardrails

These are now important product rules, not optional polish ideas:

- **The canvas should stay visually stable while editing.** Rebuilding physics is allowed; blinking the stage, clearing the snapshot between edits, or visibly "reloading" the canvas is not.
- **Do not solve layout jitter by clipping the stage.** The canvas should stay full-size and visible. Reclaim space from headers, chrome, and helper copy before shrinking or cutting off the stage.
- **Transient status signals should reuse existing chrome.** A short info/success/warning notice should appear as a small chip in an existing row or as an overlay. Do not insert a brand-new full-width layout row above the canvas for something like `Motor power ON.`.
- **Overlays must float.** Inspector, controls, connect chooser, quick controls, and medal notices should not resize the workbench or parts rail.
- **`Clear Build` means restore the starter baseline, not wipe everything.** The authoritative source is `START_CHECKPOINT_ID` in play state.
- **Rail/train systems are still in the repo, but they are intentionally hidden from the public UI for now.** Keep the code, tests, and data, but do not surface train parts, train puzzle launchers, or train silly scenes until they are reliable enough to show again.
- **AI help entry points are intentionally hidden.** Do not re-expose `Help` / `Ask` UI affordances until the assistant path is actually ready for users.

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
- connector creation
- silly scenes
- challenge evaluation

Rail/train parts still exist in code, but the public-facing parts shelf currently hides them.

### Challenges

- `src/lib/challenges.ts` currently defines **25** challenge medals
- **22** are currently public in the UI
- **3** train-themed medals are intentionally hidden from the public UI for now (`delivery-boy`, `express-train`, `full-monty`)
- only **3** public medals are active in the UI at once (`ACTIVE_CHALLENGE_LIMIT = 3`)
- challenge progress is persisted in Dexie via `challengeProgress`

### Silly scenes

- `src/lib/silly-scenes.ts` currently defines **20** scenes
- **18** are currently visible in the launcher
- `station-shuttle` and `wagon-wash` are intentionally hidden from the public launcher for now
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
- `bolt-link`
- `hinge-link`
- `powered-hinge-link`

Important design detail:

- these are **not** placed like normal canvas parts
- the builder exposes a public `Connect Parts` action
- that flow creates a connector from existing compatible parts already on the canvas

Current UX behavior:

- `Connect Parts` stays in the main build HUD, not inside the parts shelf
- clicking it opens a chooser for `Bolt`, `Hinge`, `Powered Hinge`, `Rope`, `Belt`, `Chain`, and `Beam`
- after picking a connector, the user clicks the first part and then the second part on the canvas
- on creation, the new connector is auto-selected
- selected connectors render with stronger strokes, endpoint markers, and text labels

Connector rules today:

- `rope` is primarily winch/hook lifting control
- `belt-link` is for wheel/pulley/flywheel transmission
- `chain-link` is for sprocket transmission
- `bolt-link` is for rigid assemblies that should translate and rotate together
- `hinge-link` is for free pivots between mechanical parts
- `powered-hinge-link` is for motor-driven swinging joints with live controls
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
- `HudOverlay`
- `ChallengeToast`
- `HomePage`
- `WinkyDog`

Important current UX facts:

- the home page is now a focused 5-mode launcher:
  - Guided Build
  - Engineering Workbook
  - Challenges
  - Silly Scenes
  - Free Build
- the launcher now has a playful workshop-sign / blueprint aesthetic and a visible Winky mascot
- the build screen now reads as one attached workbench shell:
  - top HUD with icon-based toolbar buttons (Connect, Book, Inspect, Controls, Clear, Undo, Save)
  - large central canvas (with drive HUD overlay when driving a vehicle)
  - persistent right-side parts shelf (with inline part controls on desktop)
- the parts shelf is always expanded and meant to be the main browsing surface
- `Inspector` and `Machine Controls` are now optional dropdown utilities, not permanent rail cards
- guided build still constrains useful parts by step, but the full shelf remains visible
- silly scenes and challenge browsing live on the launcher/home surface, not in the builder rail
- clicking a vehicle enters gamepad drive mode with a bottom HUD strip (arrow buttons + speed + exit)
- part controls are adaptive: sidebar on desktop (≥901px), canvas overlay on mobile/iPad
- drive mode suppresses part controls — only the drive HUD shows

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

8. **Crane-arm body position must match the hinge pivot.**
   `crane-arm` body creation uses `cfg.x + length/2` as the center. The hinge `toLocalX = -length/2` is the arm's left end. If a powered-hinge-link connects to the arm, `cfg.x` must be set so `cfg.x + length/2 - length/2 = pivot world X`. Wrong cfg.x causes a violent initial snap and instability.

9. **Do not create duplicate constraints on crane-arms.**
   If a hinge-link or powered-hinge-link already connects to a crane-arm (as `toId`), the arm-pivot world-point constraint must be skipped. Having both pins the assembly to world space, making vehicles float.

---

## Known Simplifications / Accepted Limits

These are real and currently acceptable:

- train motion is progress-based, not rigid-body-on-track physics
- connectors are explicit but the routing UX is still fairly lightweight
- the public connector flow is still two-click explicit linking, not a full CAD-style connector editor
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
- 10 puzzle challenges in `puzzle-challenges.ts` with `createParts()`, `successCheck()`, and `createSolvedCase()`
- design principle: simple chain-reaction physics (ball → ramp → hopper), immediately understandable like Cut the Rope / Flappy Bird

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

## March 30 Session — Physics Fixes, UX Overhaul, Content Polish

### Physics part fixes (physics-engine.ts)

**Rack** — was drifting sideways and rotating. Fixed in `tickRacks()` by adding angle locking (zero angular velocity, clamp to nearest 0/90/180/270), and cross-axis position correction that prevents lateral slide.

**Axle** — was inert (didn't connect to nearby rotating parts). Fixed by creating revolute joint constraints to nearby rotating parts (gears, pulleys, flywheels, wheels) within `rotatingRadius + 20` distance.

**Spring-linear** — was too weak to bounce anything. Default stiffness bumped from 0.05 → 0.15, damping from 0.2 → 0.12.

**Skid steer crane-arm floating** — the crane-arm code unconditionally pinned the arm to a fixed world point, even when a powered-hinge-link already provided the pivot. Added `hasHinge` check: if a hinge-link or powered-hinge-link targets the arm, skip the world-point constraint.

**Skid steer arm position** — the arm `cfg.x` was 285 but body creation adds `length/2`, placing the body center at 335. The hinge pivot expected the arm left-end at 235, causing a 50px violent snap on spawn. Fixed `cfg.x` to 235 (body center 285, left end 235 = pivot). Also added `attachOffsetX: 50` to bucket so it attaches at the arm tip, not the arm center.

### Puzzle challenge overhaul (puzzle-challenges.ts, puzzle-challenge-launcher.ts)

Three broken puzzles replaced with simple chain-reaction designs:
- **powered-sweep** → **Bowling Score** 🎳 — roll a ball down a ramp into a cargo pyramid
- **flywheel-nudge** → **Ramp Relay** 🛝 — position ramps for a marble run into a bucket
- **counterweight-rescue** → **Chute Drop** 📦 — chain chutes from a shelf over a wall into a hopper

**spring-mail** stiffness fixed: 0.08 → 0.22 (spring was too weak to launch the ball).

### Silly scene fixes (silly-scenes.ts)

- **spring-circus** — all three springs stiffness bumped 0.08 → 0.22
- **ice-rink** — added second ramp, boundary walls, more objects for better pinball action

### Chassis in parts palette (PartPalette.tsx)

Added `'chassis'` to the QUICK_PARTS array so users can drop a car chassis directly.

### Drive mode — gamepad HUD (BuildPage.tsx, MachineCanvas.tsx)

Clicking a complete vehicle (chassis + wheels + motor) now enters a non-blocking drive mode:
- **Gamepad HUD**: centered-bottom translucent strip with ◀/▶ steering arrows (52px touch targets), live speed readout, Exit Drive button
- **Pointer events**: `onPointerDown`/`onPointerUp`/`onPointerLeave` for touch+mouse support
- **Keyboard**: Left/Right arrows steer, Escape exits drive mode
- **`driveableVehicle` useMemo**: detects if selected part belongs to a complete vehicle, returns `{ chassisId, motorId, motor }` or null
- **Auto-enter/exit**: drive mode activates when driveableVehicle is non-null, exits when null
- **Suppresses popup**: the old blocking quick-controls card is hidden during drive mode

### Toolbar icon simplification (BuildPage.tsx, index.css)

All 8 toolbar buttons now use inline SVG icons + short labels (`Connect`, `Book`, `Inspect`, `Controls`, `Clear`, `Undo`, `Save`). Compact `.toolbar-btn` layout: flex column, 19px icon, 0.68rem label. On narrow screens labels can hide to icon-only with title tooltip.

### Adaptive part controls (BuildPage.tsx, PartPalette.tsx, index.css)

- **Desktop (≥901px)**: part controls render in the PartPalette sidebar instead of a canvas overlay
- **Mobile/iPad (<901px)**: part controls render as the existing canvas overlay popup
- **Drive mode**: both suppressed (HUD handles it)
- Uses `window.matchMedia('(min-width: 901px)')` with change listener for responsive switching.

### Known remaining issue: skid steer boom controls in drive mode

When in drive mode, the quick controls are suppressed by the drive HUD. This means the boom hinge controls (Boom Run toggle, Boom Angle slider) are inaccessible during driving. A future improvement should surface boom controls alongside the drive HUD for vehicles that have additional articulated parts.

---

## Short Summary Of Where We Are

Mason's Lab is now a fairly broad sandbox with:

- stable starter projects
- public connectors
- rigid and joint connectors
- drivetrain parts
- lifting/linear parts
- trains that actually tie into the machine graph
- scenes
- challenges
- a game-style launcher that separates mode selection from the builder
- a builder UI centered on `connect + canvas + parts`
- **gamepad-style drive mode** for vehicles with touch/keyboard steering
- **icon-based toolbar** replacing text-heavy buttons
- **adaptive part controls** (sidebar on desktop, popup on mobile)

The next work should be **tightening clarity, polish, and reliability**, not exploding the part count much further.

If something new is added, it should deepen interactions more than widen the catalog.
