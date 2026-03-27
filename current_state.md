# Mason's Lab — Current State
*Last updated: March 2026. Pass this to future Claude sessions.*

---

## What This Is

Mason's Construction Sandbox (`masons-lab`) is a React physics sandbox designed for kids (specifically the owner's nephew). The core promise: **every visible, editable part must actually affect the machine**. No scripted previews. No faked outcomes.

**Live at**: deployed via Vercel (check Vercel dashboard for URL)
**Repo**: `buidlstuff/masons-lab` on GitHub
**Branch**: `main`

---

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19 + TypeScript |
| Rendering | p5.js 2.x (canvas, 60fps) |
| Physics | Matter.js 0.20 |
| Storage | Dexie 4 (IndexedDB, local-first) |
| Routing | React Router 7 |
| Validation | Zod 4 |
| Build | Vite 8 |
| Deploy | Vercel |

---

## 3 Starter Projects (the entire product for now)

All three run on the live physics engine — no scripted recipes.

### Project 1: Spin the Gears
- **Goal**: `spin-gear-train` — two gears visibly meshing
- **Steps**: place motor → first gear in motor ring (spins) → second gear touching first (meshes)
- **Win**: `countLiveGearLinks > 0` using `runtime.rotations` directly
- **Motor range**: 220px. Gear mesh range: `rA + rB + 16px`.

### Project 2: Feed the Hopper
- **Goal**: `feed-the-hopper` — hopper fill ≥ 1
- **Steps**: place conveyor → place cargo on belt → place hopper at belt end
- **Win**: `collectedCargoIds.size >= 1` (persistent — never drops)
- **Layout**: belt at y≈300, hopper placed BELOW and at belt end (output.x+20, output.y+90) so gravity carries cargo in

### Project 3: Build the Loader
- **Goal**: `build-the-loader` — powered fill ≥ 3 blocks
- **Steps**: conveyor → cargo × 3 → hopper at output → motor near conveyor
- **Win**: motor within 300px of conveyor AND `collectedCargoIds.size >= 3`

---

## Key Architecture Decisions

### Physics mode vs recipe mode
- Manifests **without** `metadata.recipeId` use real Matter.js physics (`buildMatterWorld`)
- Manifests **with** `recipeId` use scripted simulation in `simulation.ts` — these are legacy showcase machines, not part of the primary user path
- All 3 starter projects use physics mode

### Runtime snapshot
`RuntimeSnapshot` (from `simulation.ts`) is the bridge between physics and React:
```typescript
{
  rotations: Record<string, number>       // gear/wheel body angles (accumulated)
  bodyPositions: Record<string, {x,y,angle}>  // live body positions
  motorDrives: Record<string, string[]>   // motor → driven gear ids
  gearMeshes: Record<string, string[]>    // gear → meshed gear ids
  hopperFill: number                      // = collectedCargoIds.size
  telemetry: BuildTelemetry               // inputRpm, outputRpm, etc.
  ...
}
```

### Step evaluation
`evaluateProject(job, manifest, runtime)` in `jobs.ts` evaluates each step's `successCheck` against the runtime. Steps unlock sequentially. `playModeUnlockStep` releases all parts once reached.

### Guided placement
`deriveGuidedPlacement()` in `BuildPage.tsx` snaps parts to valid positions for the current step — so placement can never fail due to a tiny miss. Each step has a canvas guide overlay (circle, line, rect, marker).

---

## Database Schema (Dexie)

| Table | Key fields | Purpose |
|-------|-----------|---------|
| `machines` | recordId, featured | Saved machine records |
| `drafts` | draftId, sourceMachineId | In-progress builds |
| `jobs` | jobId, tier | Starter project definitions |
| `jobProgress` | id, jobId, completed | Completion tracking |
| `blueprints` | recordId | Saved sub-machine blueprints |
| `settings` | key | XP, content epoch, seed version |

**Content epoch**: `relaunch-3-projects-v2`
Bumping this in `seed.ts` triggers a full reseed on next app load, clearing old recipe machines/drafts and reseeding jobs.

---

## Physics Engine Details (`physics-engine.ts`)

### Motor → Gear
- Motors within **220px** of a gear drive it
- `motorGearMap` built at world construction from manifest config positions
- Motor `powerState: true` required (default is true for new placements)
- BFS propagates through `gearMeshMap` for chained gear trains
- Angular velocity: `rpm * π / 30` rad/s

### Gear meshing
- Two gears/wheels mesh when `dist(centers) <= rA + rB + 16`
- `teethToRadius(teeth) = max(24, teeth * 1.4)`
- Counter-rotate with ratio = driverRadius / meshRadius
- Gears are **pinned** via Matter.js constraint — they spin in place, don't translate

### Conveyor physics
- Belt is NOT a physical surface — it's a force field
- `tickConveyors`: applies horizontal velocity blend (15%/tick) + **upward anti-gravity force (0.85× gravity)** to cargo within 22px of belt path
- Motor within **300px** of belt boosts effective speed: `max(configSpeed, motorRpm * 0.45)`

### Hopper physics
- `tickHopper`: funnel force pulls cargo within 90px horizontally toward mouth
- Once cargo enters collection zone (`y > hopperY + 10, y < hopperY + 80, |x - hopperX| < 36`): marked in `collectedCargoIds`, frozen, teleported to stable slot
- `hopperFill = collectedCargoIds.size` — **monotonically increasing, never drops**

---

## UI Architecture

```
HomePage  →  direct to /build?job=... (no detail page friction)
BuildPage →  main builder
  ├── AssistantPanel (left)    — AI chat/compose
  ├── canvas-column (center)
  │     ├── HudOverlay         — live RPM, fill, throughput readouts
  │     ├── StarterOverlay     — empty canvas guide
  │     ├── step-complete-toast — spring-pop on step completion
  │     └── MachineCanvas      — p5.js, 960×560
  └── right-rail
        ├── PartPalette        — smart part picker (guided: shows only allowed parts)
        ├── ControlPanel       — sliders/toggles for manifest.controls[]
        └── InspectorPanel     — numeric fields + motor ON/OFF toggle + delete
```

### MachineCanvas interaction model
- **Placing mode**: click canvas → snap part to guided position → exit placing mode
- **Select mode**: click part → select + show in inspector
- **Drag**: `mouseDragged` buffers position locally (NO physics rebuild per frame) → `mouseReleased` fires `onMovePrimitive` once → one world rebuild per drag
- **Motor click** (< 5px movement): toggles `powerState` via `onTogglePower`
- **Escape**: cancel placing / deselect
- **Delete/Backspace**: remove selected part

---

## Recent Major Fixes (commit `5722df5`)

1. **Drag rebuild loop** — was rebuilding physics 60×/sec during drag. Fixed with `dragBufferRef` pattern.
2. **Conveyor/hopper layout** — hopper was 58px ABOVE belt end. Now below. Gravity works with layout.
3. **Conveyor surface force** — cargo was falling through belts. Anti-gravity force added.
4. **Hopper persistence** — fill was dropping as cargo bounced. Now uses `collectedCargoIds` set.
5. **Gear spin detection** — was using `telemetry.outputRpm` (timing-fragile). Now uses `runtime.rotations`.
6. **Delete key** — added Delete/Backspace handling (guards input fields).
7. **Step celebration** — CSS spring animation on step completion + floating toast.
8. **Home CTA** — now goes directly to `/build?job=...`, skipping JobPage detail screen.
9. **Motor toggle** — canvas click OR InspectorPanel button. Off motors show a hint.
10. **Belt animation** — animated chevrons showing belt direction and speed.

---

## Known Gaps / Next Candidates

- **Seed data positions** — featured machine primitives in `seed-data.ts` use hardcoded canvas positions that may not match the new belt-at-y=300 layout. Worth auditing if those demo machines look wrong.
- **Gear ratio feedback** — HUD shows inputRpm/outputRpm but kids don't know what ratio means yet. A simple "gear 2 spins X× faster than gear 1" label on the canvas would help.
- **Multiple motors** — motorGearMap is built per-motor but if two motors compete for the same gear, last-writer wins. Acceptable for now.
- **Cargo that misses the hopper** — if a cargo block falls past the hopper or off the canvas edge, it's lost. No respawn. Could add a gentle off-canvas recovery.
- **Project 3 step 3 clarity** — "Add a motor near the conveyor" step works but kids can't easily see WHY the motor helps (speed increase isn't dramatic). Consider adding a throughput counter to the HUD for Project 3.
- **No undo** — ctrl+Z does nothing. Medium-effort win.
- **Rail/crane projects deferred** — explicitly not part of relaunch. Don't start on these until the 3 existing projects are proven.

---

## XP System

```typescript
XP_PER_JOB_TIER = [0, 100, 200, 400, 800]
TIER_THRESHOLDS = { 1: 0, 2: 200, 3: 500, 4: 1000 }
TIER_NAMES = { 1: 'First Day', 2: 'Operator', 3: 'Engineer', 4: 'Site Boss' }
```

XP awarded on first completion of each project. Stored in `db.settings('xp')`.

---

## Principles (don't drift from these)

1. **If a part is visible and editable, it must truly affect the machine.**
2. **Celebrate only runtime-proven outcomes** — no step completes on placement alone.
3. **3 excellent projects, not 4 weaker ones.** Defer rail/crane until trust is proven.
4. **Reliability over features.** Make existing things work perfectly before adding new ones.
5. **Kids first.** Every friction point is a child giving up.
