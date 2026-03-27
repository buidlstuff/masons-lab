# Mason's Lab — Parts Expansion Plan (v2)
*Reviewed against actual source code March 2026. Pass this to Claude when ready to implement.*
*Do NOT start implementing until 3 starter projects are validated through multiple real play sessions.*

---

## Pre-Flight: Read These Files First

Before touching a single line, implementing Claude must read:
1. `src/lib/physics-engine.ts` — full file
2. `src/lib/types.ts` — full file
3. `src/lib/simulation.ts` — full file
4. `current_state.md` — project state doc
5. `reliability_fixes.md` (in memory/) — the 10 fixes that must not be undone

---

## The 10 Fixes That Must Never Break

These were hard-won. Every phase of implementation must verify all 10 still work.

| # | Fix | Where | What to protect |
|---|-----|--------|-----------------|
| 1 | Drag = one world rebuild | `MachineCanvas.tsx` | `dragBufferRef` pattern — `mouseDragged` never calls `onMovePrimitive`, only `mouseReleased` does |
| 2 | Belt at y=300, hopper below belt end | `BuildPage.tsx` | `placeStarterConveyor` y=300, `placeHopperAtConveyorOutput` at output.y+90 |
| 3 | Conveyor support body | `physics-engine.ts` | `conveyorSupports` array — physical static bodies created per belt segment that cargo rides on |
| 4 | Hopper fill never drops | `physics-engine.ts` | `collectedCargoIds: Set<string>` closure — once in, never removed |
| 5 | Gear spin via rotations | `jobs.ts` | `runtime.rotations[gear.id] > 0.01` check, NOT `telemetry.outputRpm` |
| 6 | Delete key | `BuildPage.tsx` | Delete/Backspace handler with input field guard |
| 7 | Step celebration | `BuildPage.tsx` + CSS | `stepCelebrating` state + `step-complete-toast` animation |
| 8 | Home → build direct | `HomePage.tsx`, `JobCard.tsx` | Links go to `/build?job=...` not `/jobs/...` |
| 9 | Motor toggle | `MachineCanvas.tsx` + `InspectorPanel.tsx` | Click < 5px = toggle, not drag |
| 10 | Belt animation | `MachineCanvas.tsx` | Animated chevrons using `Date.now()` offset |

---

## Bugs Found in the v1 Plan (Corrected Here)

### Bug A: Conveyor is NOT purely force-based (plan was wrong)
The v1 plan said "Belt is NOT a physical surface — it's a force field." That was true before Fix #3. After Fix #3, the conveyor DOES have physical static support bodies:
```typescript
// physics-engine.ts lines ~146-174
const support = Matter.Bodies.rectangle(centerX, centerY, segLen + 8, 14, {
  isStatic: true, friction: 0.9, restitution: 0.02, ...
});
conveyorSupports.push({ ... });
Matter.World.add(engine.world, support);
```
**Impact on new parts:** Balls and rocks placed on the conveyor will automatically sit on the support surface. They WON'T automatically get belt drive force though — that requires updating the filter in `tickConveyors`.

### Bug B: `tickConveyors`, `tickHopper`, `recoverLostCargo` all filter by `cargo-block` only
```typescript
// Current code — these lines will need updating when new materials are added:
const cargoBlocks = manifest.primitives.filter((p) => p.kind === 'cargo-block');  // line ~492
for (const prim of manifest.primitives) {  // tickHopper only processes cargo-block inside
for (const cargo of manifest.primitives.filter((p) => p.kind === 'cargo-block'))  // recoverLostCargo
```
**Impact:** Adding `ball`, `rock`, `sand` without updating these filters = those parts are invisible to the belt, hopper, and recovery system. They'd fall and never respawn. **Fix:** Create a type alias `MATERIAL_KINDS = ['cargo-block', 'ball', 'rock']` and use it in all three filters.

### Bug C: Piston constraint stiffness should NOT be 1.0
The v1 plan said `stiffness: 1.0` for the piston rod constraint. This is wrong. In Matter.js:
- `stiffness: 1.0` on a body-to-body constraint with external loads → oscillation and instability
- The gear pin uses `stiffness: 1.0` only because it's a world-anchor (static point → dynamic body), which is stable
- For body-to-body constraints: use `stiffness: 0.9`, `damping: 0.1`
**Fix:** All body-to-body constraints in new parts use `stiffness: 0.9, damping: 0.1`.

### Bug D: Rope constraint stiffness in the plan was wrong
The v1 plan said ropes use `stiffness: 0.8`. The actual code uses `stiffness: 0.05, damping: 0.2`:
```typescript
// physics-engine.ts ~line 237
const constraint = Matter.Constraint.create({
  stiffness: 0.05, damping: 0.2, ...
});
```
Low stiffness (0.05) is correct — it gives the rope a spring-like feel. High stiffness would make it rigid and bouncy. Do not change this.

### Bug E: BFS circular reference guard works via `driven.has()` + hop cap
The v1 plan said "use a `visited: Set<string>`." The actual implementation is:
```typescript
if (!driven.has(meshId)) {  // this IS the visited-set check
  driven.set(meshId, meshVel);
  queue.push([meshId, meshVel]);
}
hop += 1;  // AND a hop cap of 12
```
When extending the BFS to include pulleys and flywheels, use the same pattern — the `driven` map already serves as visited set.

### Bug F: Multiple motors use last-writer-wins for gears
The v1 plan proposed distance-weighted RPM summing. In practice, the current code does:
```typescript
for (const gearId of motorGearMap.get(motor.id) ?? []) {
  driven.set(gearId, angVel);  // overwrites any previous motor's value
}
```
This is last-writer-wins. For new parts, preserve this behavior — don't introduce complexity. If two motors drive the same gear, the second motor wins. Document this in UX as "motors don't stack."

### Bug G: Sand particles must be a NEW kind, not `cargo-block`
Sand particles added as `cargo-block` would be treated by the hopper, respawn system, etc. as regular cargo. They'd be collected one-by-one and counted toward hopper fill. Sand should flow and fill as a group. **Fix:** Use a new kind `sand-particle` for physics bodies, OR use `material-pile` (already in types.ts) as the placement primitive and spawn particle bodies as anonymous unnamed bodies not tracked in `bodyMap` by ID. See T4-2 spec below.

### Bug H: `applyControls` only handles `winch.ropeLength`
```typescript
// physics-engine.ts lines ~376-396
function applyControls(controlValues) {
  for (const prim of manifest.primitives) {
    if (prim.kind !== 'winch') continue;  // ONLY winch handled
    ...
  }
}
```
New parts with runtime controls (piston direction, silo gate) need cases added here. Implementing Claude must add a case per new controllable part.

---

## Architecture: How New Parts Plug In

### DO NOT build a generic port routing system yet
The v1 plan described a `part-registry.ts` with automatic port connection resolution. This is architecturally correct for long-term, but it's a large refactor of a working system. **Risk is too high.**

Instead, use **Option A: Specific maps per interaction type.** This exactly mirrors what already exists:

```typescript
// Existing maps (DO NOT MODIFY):
motorGearMap    // motor → gear ids in range
motorWheelMap   // motor → wheel ids in range
gearMeshMap     // gear/wheel → meshed neighbors
conveyorMotorMap // conveyor → nearby motors

// NEW maps to add (same pattern):
motorPistonMap   // motor → piston ids in range (pistons driven by motors)
motorWinchMap    // motor → winch ids in range (winches driven by motors)
rackGearMap      // rack id → driving gear id (rack converted from rotating gear)
```

Each new map is built in the same loop at world construction time. Each has a corresponding tick function. Zero changes to existing maps.

### The material kind list (critical pattern)
Create this constant at the top of `physics-engine.ts`:
```typescript
const MATERIAL_KINDS: PrimitiveKind[] = ['cargo-block', 'ball', 'rock'];
// sand uses anonymous particle bodies, not named primitives
```
Replace all three `filter((p) => p.kind === 'cargo-block')` calls with `filter((p) => MATERIAL_KINDS.includes(p.kind))`. This is the single most important change for making new materials work with existing systems.

---

## Interaction Simulation (Dry Run)

Before any code is written, walk through these 10 scenarios mentally. Each one describes what SHOULD happen in the physics engine and where it could go wrong.

---

### Scenario 1: Ball on a Ramp → rolls into Hopper
**Setup:** Ramp at 30° angle, ball placed at top, hopper at bottom.

**What should happen:**
1. Ball spawns → gravity pulls it down → contacts ramp surface
2. Ball rolls down ramp (rotates + translates along incline)
3. Ball exits ramp bottom → airborne briefly → enters hopper funnel
4. Hopper guide force pulls ball toward mouth
5. Ball enters collection zone → `collectedCargoIds.add(ball.id)` → frozen in slot

**Where it can go wrong:**
- Ball may not be included in `tickHopper` (only `cargo-block` filter). **Fix:** use `MATERIAL_KINDS`.
- Ball at high speed may tunnel through ramp (thin static body). **Fix:** velocity cap 15px/tick.
- Hopper slot calculation uses `hopperStructures[0].x/y` — fine for single hopper scenarios.
- Ball `restitution: 0.6` may make it bounce OUT of the collection zone before being caught. **Fix:** in the hopper collection zone, immediately call `Matter.Body.setStatic(body, true)` and use lower restitution for ball: 0.3.

**Risk level:** Medium. Hopper filter fix is required. Velocity cap is a safety net.

---

### Scenario 2: Motor → Wheel → Vehicle moves across canvas
**Setup:** Motor, two wheels, axle connecting them, chassis resting on wheels.

**What should happen:**
1. Motor within 220px of left wheel → `motorWheelMap` includes left wheel
2. Motor drives left wheel → `Matter.Body.setAngularVelocity(leftWheel, angVel)`
3. Left wheel rolls → friction with ground → chassis translates right
4. Axle constraint keeps right wheel at fixed distance from left wheel
5. Right wheel rotates in same direction (being dragged by chassis)

**Where it can go wrong:**
- Current `motorWheelMap` builds at world-construction time. After chassis is placed, wheel positions don't change (wheels are pinned to chassis via axle constraints). So proximity check at world build time is correct.
- Axle constraint: `Matter.Constraint` between two wheel bodies with `length = dist(w1, w2)`, `stiffness: 0.9`. If chassis isn't connected, wheels will drift apart. Chassis must be connected via separate constraints to both wheel bodies.
- The chassis must have `isStatic: false`. If it's accidentally set static, wheels spin but chassis doesn't move.
- Angular velocity is set directly, overriding physics-derived rotation. This means the wheel can spin even when in the air (no contact). That's fine — expected behavior.
- **Critical:** if the motor is ON and the vehicle reaches the canvas wall, the wheel continues to spin against the wall. Energy builds up → jitter. **Fix:** in `recoverLostCargo` equivalent for vehicles, check if chassis is stuck against boundary and reduce motor torque.

**Risk level:** High. Vehicle physics is the most complex new system. Recommend implementing in isolation on a test branch first.

---

### Scenario 3: Motor → Gear → Gear → Rack → Arm moves
**Setup:** Motor drives gear A, gear A meshes with gear B, gear B drives rack, rack moves arm.

**What should happen:**
1. Motor within 220px of gear A → `motorGearMap` includes gear A
2. BFS: gear A meshes with gear B → gear B gets opposite angular velocity / ratio
3. Gear B within 30px of rack end → `rackGearMap.set(rack.id, gearB.id)`
4. Each tick: `tickRacks()` reads gear B's angular velocity → `v = angVel * radius` → sets rack velocity
5. Rack translates → arm attached to rack via constraint → arm translates too

**Where it can go wrong:**
- Rack position must be initialized at `gear.x + gear.radius` distance from gear center. If not, the rack-gear proximity check fails at world build time and they're never connected.
- Rack body needs to be constrained to move only along one axis. Use two static guide bodies (rails) that the rack slides between, not a Matter.js constraint axis (which doesn't exist).
- Angular velocity is set by `driveMotors()` every tick. But after `driveMotors()`, Matter.js physics runs, which may change the body's velocity slightly. Then `tickRacks()` reads `body.angularVelocity` (the post-physics value, not the set value). These should be close enough. If drift occurs, read from `driven` map instead of body velocity.

**Risk level:** Medium. Guide rails for rack are the tricky part.

---

### Scenario 4: Motor → Winch → Rope → Hook → Cargo lifted
**Setup:** Motor drives winch, winch has rope, rope attaches to hook, hook grabs cargo.

**What should happen:**
1. Motor within 220px of winch → `motorWinchMap.set(winch.id, [motor.id])`
2. Each tick: if motor is powered, `constraint.length -= reelSpeed` (up to minimum length)
3. Rope constraint shortens → hook rises → cargo attached to hook rises
4. When cargo reaches height target → step complete

**Where it can go wrong:**
- Current code handles rope via `applyControls` (slider changes rope length). Motor-driven winch needs a NEW tick function. `applyControls` path is for UI slider control.
- `constraint.length` changes → Matter.js solver applies impulse proportional to `(currentLength - targetLength) * stiffness`. At `stiffness: 0.05`, impulse is gentle. **Good.**
- If motor RPM is very high → `reelSpeed` is high → length changes by many px per tick → rope becomes "teleporting" rather than smooth. **Fix:** cap delta per tick at 2px regardless of motor RPM.
- Hook grab: currently `cargo-block` with `attachedToId` gets a constraint at world-build time. For dynamic in-game hook grabbing (hook moves down, touches cargo, then grabs), we'd need runtime constraint creation. This is complex. **Recommendation:** For v1, keep the static attachment approach (cargo pre-attached in manifest). Dynamic grab is a Phase 4 feature.

**Risk level:** Low for static attachment. High for dynamic grab. Do static first.

---

### Scenario 5: Conveyor → Ball (not cargo-block)
**Setup:** Ball placed on belt, belt running.

**What should happen:**
1. Ball sits on conveyor support body (the physical surface).
2. `tickConveyors` should apply drive force to the ball.
3. Ball moves along belt, falls off end, into hopper.

**Where it WILL go wrong without the fix:**
- `tickConveyors` filters: `manifest.primitives.filter((p) => p.kind === 'cargo-block')` — ball is NOT included.
- Ball sits on belt surface but receives NO drive force. It just sits there.
- `tickHopper` also filters `cargo-block` — ball never gets collected even if it falls in.

**Fix (exact code):**
```typescript
// In tickConveyors, change:
const cargoBlocks = manifest.primitives.filter((p) => p.kind === 'cargo-block');
// To:
const cargoBlocks = manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind));

// Same change in tickHopper:
for (const prim of manifest.primitives) {
  if (!MATERIAL_KINDS.includes(prim.kind)) continue;  // was: prim.kind !== 'cargo-block'

// Same in recoverLostCargo:
for (const cargo of manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind)))
```
**Risk level:** Low. This is a one-line change in three places. MUST be done before any new material is added.

---

### Scenario 6: Sand particles flowing through Funnel into Bin
**Setup:** Sand pile placed above funnel, funnel above silo-bin.

**What should happen:**
1. Sand pile spawns N anonymous particle bodies at the pile position
2. Particles fall due to gravity → hit funnel walls → redirect downward → enter bin
3. Bin body count increases as particles land inside

**Where it can go wrong:**
- Anonymous particle bodies are NOT in `bodyMap` by primitive ID. They CAN'T be in bodyMap — they'd flood it. This means `bodyPositions` won't contain them. The renderer must use a SEPARATE particles array returned in PhysicsFrame.
- `recoverLostCargo` won't know about these particles. Out-of-bounds particles are lost forever. **Fix:** Track particles in a `particleBodyMap: Map<'sand', Matter.Body[]>` and recover them in a separate `recoverParticles()` function.
- 30 particles × 30 particles = 900 collision pairs just between sand particles. Add sand-to-sand collision group: `collisionFilter: { category: 0x0004, mask: 0x0001 }` (only collide with statics, not with each other). This reduces collision pairs to 30 × (static body count). Much cheaper.
- Funnel walls must be angled static bodies. Same as hopper walls. Verify the angle creates a true chute shape (test with a wider angle than the hopper's 0.28 radians — 0.45 radians works better for funnel).

**Risk level:** High. Sand is the most complex material. Implement last.

---

### Scenario 7: Piston extends → pushes arm → arm scoops material
**Setup:** Motor drives piston, piston rod pushes arm, arm has bucket, bucket scoops cargo.

**What should happen:**
1. Motor powered → `motorPistonMap` includes piston → `tickPistons()` runs
2. Each tick: piston extends by `speed * dt` (capped at stroke)
3. Arm pivot constraint stays fixed → arm tip moves as rod pushes it
4. Arm angle changes → bucket at arm tip rotates into material
5. Material inside bucket collection zone gets added to `bucketContents[bucket.id]`
6. Arm retracts → bucket tilts past 100° → material released → falls into hopper

**Where it can go wrong:**
- Arm is connected to piston rod via constraint. As rod extends, it pushes arm. But if the arm has too much inertia, the constraint solver can't push it fast enough → rod extends through arm → instability. **Fix:** Make arm lightweight (`density: 0.001`) and use `stiffness: 0.7` on the rod-arm constraint (softer = more forgiving).
- Bucket dump trigger: the arm's angle in `bodyPositions` must be checked each tick. BUT `bodyPositions` angle is the raw Matter.js body angle, which accumulates. Need to normalize: `angle % (2 * Math.PI)`. At 100° = 1.745 radians.
- Bucket collecting material while swinging: collection zone check runs every tick. During fast swing, a cargo block may only be in the zone for 1-2 ticks. Add a brief "gathering" state: if cargo was in zone last tick AND this tick, add to contents.

**Risk level:** High. Multi-body assembly with timing-sensitive interactions. Implement in Phase 3, not 2.

---

### Scenario 8: Flywheel smooths motor-off transition
**Setup:** Motor drives gear → gear drives flywheel. Motor is toggled off.

**What should happen:**
1. Motor drives gear at 120 RPM → gear meshes flywheel → flywheel spins at 120 RPM
2. Motor is toggled off → `driveMotors()` no longer sets gear angular velocity
3. Matter.js friction slows gear to 0 quickly (high `frictionAir: 0.05` on gears)
4. Flywheel has `frictionAir: 0.001` → continues spinning for ~2-3 seconds

**Where it can go wrong:**
- `driveMotors()` calls `Matter.Body.setAngularVelocity(body, angVel)` every tick for driven bodies. When motor is off, this is not called. Matter.js then applies `frictionAir` naturally. The flywheel will slow down based on `frictionAir`. This should work with no special code.
- The flywheel should also drive meshed gears while it's spinning. This currently works: the BFS in `driveMotors()` would need to include flywheel as a "source" when it's spinning but motor is off. **Problem:** `driveMotors()` only starts BFS from motors. A spinning flywheel with no connected motor won't propagate to downstream gears after motor off.
- **Fix:** After `driveMotors()`, add a secondary BFS pass that starts from any body with `angularVelocity > 0.1` that wasn't driven this tick. This is the "inertia propagation" pass. Cap it at 3 hops to prevent runaway.

**Risk level:** Medium. The inertia propagation pass is new logic but follows the same BFS pattern.

---

### Scenario 9: Water zone + conveyor belt
**Setup:** Conveyor belt partially submerged in a water zone.

**What should happen:**
- Cargo on the belt section above water: driven by belt normally
- Cargo on the belt section IN water: belt drive force + water drag (drag reduces effective speed)
- Cargo that falls off belt into water: buoyancy force + drag (floats or sinks depending on density)

**Where it can go wrong:**
- Water drag (`velocity * 0.95` per tick) and belt drive force can conflict. Each tick, belt sets velocity to a target, then water reduces it. Net effect: cargo moves slower on underwater belt. **This is correct behavior.** No special handling needed.
- Buoyancy applied to cargo-block: `mass: 0.002 * 20 * 20` ≈ 0.8 kg-equivalent. Water buoyancy = `0.8 * 9.8 ≈ 7.8N` upward. Gravity on cargo = `0.8 * 1.2 * 9.8 ≈ 9.4N` downward. Net: cargo sinks slowly. Correct for a metal block.
- Ball `restitution: 0.3`, lighter density → buoyancy exceeds gravity → ball floats. Correct.
- **Risk:** If the buoyancy force is applied AND the conveyor support body prevents downward movement, the upward force builds up and "launches" the cargo off the belt. **Fix:** In water zone tick, skip buoyancy for bodies that are on a conveyor support (i.e., in `supportedCargoIds`).

**Risk level:** Medium. The suppression logic for supported cargo is required.

---

### Scenario 10: Gear → Pulley → Rope → changes direction
**Setup:** Motor drives gear, gear meshes pulley, rope runs over pulley to redirect lift force.

**What should happen:**
- Pulley receives rotary input same as gear
- Rope endpoint on one side of pulley moves up as pulley turns one direction
- Load on other rope end rises

**Where it can go wrong:**
- Pulley is treated the same as a gear in `gearMeshMap` (both are `rotating prims`). This is correct.
- The "rope over pulley" direction change: in 2D, a pulley redirecting a rope requires two separate rope segments (before and after the pulley). The current rope system is a single constraint between two bodies. **For simplicity:** Don't try to model rope direction change physically. Instead, pulley + rope = winch-like behavior. Pulley turning CW raises the rope end on the right side. This is a visual simplification that's correct enough for kids.
- The motor → gear → pulley BFS works automatically because `gearMeshMap` includes any two `rotating prims` within `rA + rB + 16px`.

**Risk level:** Low if simplified as described. High if attempting real rope-over-pulley physics.

---

## Complete Parts List (45 parts, corrected)

### Tier 1 — Implement First

#### T1-1: `ramp`
**Config:** `{ x, y, width: number, angle: number }` (angle 0-60°)
**Physics:** Static rectangle rotated to angle. `friction: 0.6, restitution: 0.1`
**Body creation:**
```typescript
case 'ramp': {
  const cfg = prim.config as { x: number; y: number; width: number; angle: number };
  return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.width, 12, {
    isStatic: true, label: prim.id,
    angle: cfg.angle * Math.PI / 180,
    friction: 0.6, restitution: 0.1,
  });
}
```
**Tick:** None. Pure collision surface.
**Visual:** Filled angled rectangle with chevron hatch marks indicating slope direction.
**Guided placement:** Snap angle to 15° increments. Show ghost preview at cursor.

---

#### T1-2: `platform`
**Config:** `{ x, y, width: number }`
**Physics:** Same as ramp at angle=0. Height is always 12px.
**Note:** Can share the same `case 'ramp':` code path if `angle` defaults to 0 for platforms. Keep as separate kind for UX clarity only.

---

#### T1-3: `wall`
**Config:** `{ x, y, height: number }`
**Physics:** Static rectangle, width=12, height=config.height. `friction: 0.8`
**Note:** Same as ramp but rotated 90°, or just a tall rectangle.

---

#### T1-4: `ball`
**Config:** `{ x, y, radius: 12 }`
**Physics:**
```typescript
case 'ball': {
  const cfg = prim.config as { x: number; y: number; radius: number };
  return Matter.Bodies.circle(cfg.x, cfg.y, cfg.radius ?? 12, {
    label: prim.id,
    restitution: 0.3,   // NOT 0.6 — lower to prevent bouncing out of hopper
    friction: 0.3,
    frictionAir: 0.005,
    density: 0.002,
  });
}
```
**Critical:** Add `'ball'` to `MATERIAL_KINDS` constant so it's picked up by `tickConveyors`, `tickHopper`, and `recoverLostCargo`.

---

#### T1-5: `rock`
**Config:** `{ x, y }`
**Physics:** Irregular polygon (5 vertices approximating a boulder shape), `isStatic: false`
```typescript
case 'rock': {
  const cfg = prim.config as { x: number; y: number };
  // Slightly irregular circle — use fromVertices for rough shape
  const r = 16;
  const verts = [
    { x: r * 1.1, y: 0 }, { x: r * 0.5, y: -r * 0.9 },
    { x: -r * 0.8, y: -r * 0.7 }, { x: -r, y: r * 0.3 },
    { x: -r * 0.3, y: r * 0.9 },
  ].map(v => ({ x: v.x + cfg.x, y: v.y + cfg.y }));
  return Matter.Bodies.fromVertices(cfg.x, cfg.y, verts, {
    label: prim.id, isStatic: false,
    mass: 3, restitution: 0.05, friction: 0.9, frictionAir: 0.008,
  });
}
```
**Critical:** Add `'rock'` to `MATERIAL_KINDS`.
**Note:** `Matter.Bodies.fromVertices` requires the `poly-decomp` library. Verify it's in package.json. If not, use `Matter.Bodies.circle` with higher mass as fallback.

---

#### T1-6: `spring-linear`
**Config:** `{ x, y, orientation: 'horizontal' | 'vertical', restLength: number, stiffness: number }`
**Physics:** Static anchor point + small dynamic "plate" body + `Matter.Constraint` between them.
```typescript
case 'spring-linear': {
  // The plate body — this is what gets returned as the main body
  // The constraint is added in the constraints section below (not createBodyForPrimitive)
  const cfg = prim.config as { x: number; y: number; orientation: string; restLength: number };
  const offsetX = cfg.orientation === 'horizontal' ? cfg.restLength : 0;
  const offsetY = cfg.orientation === 'vertical' ? cfg.restLength : 0;
  return Matter.Bodies.rectangle(cfg.x + offsetX, cfg.y + offsetY, 24, 8, {
    label: prim.id, density: 0.002, frictionAir: 0.2,
  });
}
```
Then in the constraints section:
```typescript
if (prim.kind === 'spring-linear') {
  const cfg = prim.config as { x: number; y: number; orientation: string; restLength: number; stiffness: number };
  const plateBody = bodyMap.get(prim.id);
  if (plateBody) {
    Matter.World.add(engine.world, Matter.Constraint.create({
      pointA: { x: cfg.x, y: cfg.y },  // static anchor
      bodyB: plateBody,
      pointB: { x: 0, y: 0 },
      length: cfg.restLength,
      stiffness: cfg.stiffness ?? 0.05,
      damping: 0.2,
      label: `spring-${prim.id}`,
    }));
  }
}
```
**PhysicsFrame:** Add `springCompressions: Record<string, number>` — update each tick:
```typescript
const restLen = cfg.restLength;
const currentLen = Math.hypot(plateBody.position.x - cfg.x, plateBody.position.y - cfg.y);
springCompressions[prim.id] = Math.max(0, 1 - currentLen / restLen);
```

---

### Tier 2 — Machine Parts

#### T2-1: `pulley`
**Config:** `{ x, y, radius: number }`
**Physics:** Same as gear — dynamic circle, pinned in place via world-anchor constraint.
```typescript
case 'pulley': {
  const cfg = prim.config as { x: number; y: number; radius: number };
  return Matter.Bodies.circle(cfg.x, cfg.y, cfg.radius ?? 28, {
    label: prim.id, frictionAir: 0.02, density: 0.002,
  });
}
```
**Mesh map:** In `gearMeshMap` construction, include `'pulley'` in the `rotatingPrims` filter:
```typescript
// Change from:
const rotatingPrims = manifest.primitives.filter((p) => p.kind === 'gear' || p.kind === 'wheel');
// To:
const rotatingPrims = manifest.primitives.filter((p) => ['gear', 'wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(p.kind));
```
**Pin:** Add pulley to the gear-pinning loop (the one that creates world-anchor constraints). Pulleys spin in place like gears.
**Rope attachment:** When a `rope` primitive's `fromId` or `toId` is a pulley, the existing rope constraint code handles it automatically (it just looks up `bodyMap.get(cfg.fromId)`).

---

#### T2-2: `chain-sprocket`
**Config:** `{ x, y, radius: number, teeth: number }`
**Physics:** Identical to pulley.
**Difference from pulley:** Visual only (teeth drawn around rim). Functionally identical in 2D.

---

#### T2-3: `flywheel`
**Config:** `{ x, y, radius: number, mass: number }`
**Physics:** High-inertia dynamic circle, NOT pinned (can rotate freely).
```typescript
case 'flywheel': {
  const cfg = prim.config as { x: number; y: number; radius: number; mass: number };
  return Matter.Bodies.circle(cfg.x, cfg.y, cfg.radius ?? 36, {
    label: prim.id,
    frictionAir: 0.001,   // almost no air drag — keeps spinning
    density: (cfg.mass ?? 5) / (Math.PI * Math.pow(cfg.radius ?? 36, 2)),
    restitution: 0.0,
  });
}
```
**Pin it:** Flywheel spins in place — add to gear-pinning loop.
**Inertia propagation:** After `driveMotors()`, add secondary pass:
```typescript
// Flywheel inertia propagation (in tick(), after driveMotors())
for (const prim of manifest.primitives.filter(p => p.kind === 'flywheel')) {
  const body = bodyMap.get(prim.id);
  if (!body) continue;
  if (Math.abs(body.angularVelocity) < 0.05) continue; // not spinning
  if (drivenVels.has(prim.id)) continue; // already driven this tick
  // Propagate flywheel velocity to meshed parts (max 3 hops)
  const queue: Array<[string, number]> = [[prim.id, body.angularVelocity]];
  const visited = new Set([prim.id]);
  let hops = 0;
  while (queue.length && hops < 3) {
    const [driverId, vel] = queue.shift()!;
    for (const { id: meshId, ratio } of gearMeshMap.get(driverId) ?? []) {
      if (visited.has(meshId) || drivenVels.has(meshId)) continue;
      const meshVel = -vel / ratio;
      const meshBody = bodyMap.get(meshId);
      if (meshBody) Matter.Body.setAngularVelocity(meshBody, meshVel);
      visited.add(meshId);
      queue.push([meshId, meshVel]);
    }
    hops++;
  }
}
```

---

#### T2-4: `gearbox`
**Config:** `{ x, y, inputTeeth: number, outputTeeth: number }`
**Physics:** Static rectangle body (no movement). Two virtual connection points (left=input, right=output).
**Behavior:** In `gearMeshMap` construction, add a special case: if any rotating prim is within 220px of the left side of gearbox, AND any rotating prim is within 220px of the right side, connect them as if they mesh with ratio = `outputTeeth / inputTeeth`.
**Visual:** Rectangle labeled "1:N" where N = ratio. Input/output arrows on sides.

---

#### T2-5: `winch` (complete existing stub)
**Config:** `{ x, y, speed: number, ropeLength: number }`
**Physics:** Static rectangle body (the drum).
```typescript
case 'winch': {
  const cfg = prim.config as { x: number; y: number };
  return Matter.Bodies.rectangle(cfg.x, cfg.y, 40, 28, {
    label: prim.id, isStatic: true,
  });
}
```
**Motor connection:** Build `motorWinchMap` same pattern as `motorGearMap`. Motor within 220px → drives winch.
**Tick function (new):**
```typescript
function tickWinches() {
  for (const prim of manifest.primitives.filter(p => p.kind === 'winch')) {
    const motors = motorWinchMap.get(prim.id) ?? [];
    const powered = motors.some(mId => activeMotorIds.has(mId));
    if (!powered) continue;
    const cfg = prim.config as { speed: number; ropeLength: number };
    // Find any rope constraint whose bodyA is this winch
    for (const c of ropeConstraints) {
      const winchBody = bodyMap.get(prim.id);
      if (c.bodyA !== winchBody) continue;
      const delta = Math.min(cfg.speed * 0.016, 2); // cap 2px/tick
      c.length = Math.max(50, c.length - delta);
    }
  }
}
```
**applyControls:** Keep existing slider-based rope length control. Motor-driven winch is additive (motor shortens rope; slider sets max length).

---

#### T2-6: `piston`
**Config:** `{ x, y, orientation: 'horizontal' | 'vertical', stroke: number, speed: number }`
**Physics:**
- Cylinder body: static rectangle at `(x, y)`, size = `(20, stroke + 20)` or `(stroke + 20, 20)`
- Rod body: dynamic thin rectangle starting at extended end

```typescript
case 'piston': {
  const cfg = prim.config as { x: number; y: number; orientation: string; stroke: number };
  // Return the rod body; cylinder will be added as a separate static body in post-body-creation loop
  const isVert = cfg.orientation === 'vertical';
  const rodX = cfg.x + (isVert ? 0 : cfg.stroke / 2);
  const rodY = cfg.y + (isVert ? cfg.stroke / 2 : 0);
  return Matter.Bodies.rectangle(rodX, rodY, isVert ? 10 : cfg.stroke, isVert ? cfg.stroke : 10, {
    label: prim.id, density: 0.001, frictionAir: 0.3,
  });
}
```
Add cylinder body in a separate pass (similar to how conveyorSupports works). Add constraint from rod to cylinder:
```typescript
// After body creation, for pistons:
if (prim.kind === 'piston') {
  const cfg = prim.config as { x: number; y: number; orientation: string; stroke: number };
  const rodBody = bodyMap.get(prim.id)!;
  // Cylinder body (static guide)
  const isVert = cfg.orientation === 'vertical';
  const cylinder = Matter.Bodies.rectangle(cfg.x, cfg.y, isVert ? 20 : cfg.stroke + 20, isVert ? cfg.stroke + 20 : 20, {
    isStatic: true, label: `cyl-${prim.id}`,
    collisionFilter: { mask: 0 }, // no collisions — it's just a guide
  });
  Matter.World.add(engine.world, cylinder);
  // Constrain rod to slide along one axis only (two guide constraints)
  // Use a constraint that keeps rod at distance from a fixed point along the axis
  // This is approximated by constraining to the cylinder body's top/bottom points
  // stiffness: 0.9 NOT 1.0 (see Bug C fix)
  Matter.World.add(engine.world, Matter.Constraint.create({
    bodyA: cylinder,
    pointA: { x: 0, y: isVert ? -(cfg.stroke + 20) / 2 : 0 },
    bodyB: rodBody,
    pointB: { x: 0, y: isVert ? -cfg.stroke / 2 : 0 },
    length: 0,
    stiffness: 0.9,
    damping: 0.1,
    label: `guide-${prim.id}`,
  }));
}
```
**motorPistonMap:** Build same pattern as `motorGearMap`. Motor within 220px drives piston.
**Tick function:**
```typescript
function tickPistons(pistonExtensions: Record<string, number>) {
  for (const prim of manifest.primitives.filter(p => p.kind === 'piston')) {
    const motors = motorPistonMap.get(prim.id) ?? [];
    const powered = motors.some(mId => activeMotorIds.has(mId));
    const cfg = prim.config as { stroke: number; speed: number; orientation: string };
    const rodBody = bodyMap.get(prim.id);
    if (!rodBody) continue;
    const ext = pistonExtensions[prim.id] ?? 0;
    const newExt = powered
      ? Math.min(1, ext + cfg.speed * 0.016 / cfg.stroke)
      : Math.max(0, ext - cfg.speed * 0.016 / cfg.stroke);
    pistonExtensions[prim.id] = newExt;
    // Set rod position directly (override physics position)
    const isVert = cfg.orientation === 'vertical';
    const cfg2 = prim.config as { x: number; y: number };
    const newX = cfg2.x + (isVert ? 0 : newExt * cfg.stroke);
    const newY = cfg2.y + (isVert ? newExt * cfg.stroke : 0);
    Matter.Body.setPosition(rodBody, { x: newX, y: newY });
    Matter.Body.setVelocity(rodBody, { x: 0, y: 0 });
  }
}
```

---

#### T2-7: `crane-arm`
**Config:** `{ x, y, length: number }` (horizontal boom, pivots at x/y)
**Physics:** Dynamic rectangle, pivoted at left end via world-anchor constraint.
```typescript
case 'crane-arm': {
  const cfg = prim.config as { x: number; y: number; length: number };
  return Matter.Bodies.rectangle(cfg.x + cfg.length / 2, cfg.y, cfg.length, 10, {
    label: prim.id, density: 0.001,
  });
}
```
Pin at left end: `Matter.Constraint.create({ pointA: { x: cfg.x, y: cfg.y }, bodyB: body, pointB: { x: -cfg.length/2, y: 0 }, length: 0, stiffness: 0.9, damping: 0.5 })`
**Counterweight attachment:** Counterweight body attached at left end via `Matter.Constraint`.
**Winch attachment:** Winch/rope attaches at right end tip.

---

#### T2-8: `counterweight`
**Config:** `{ x, y, mass: number }`
**Physics:** Heavy static-feeling but dynamic rectangle.
```typescript
case 'counterweight': {
  const cfg = prim.config as { x: number; y: number; mass: number };
  return Matter.Bodies.rectangle(cfg.x, cfg.y, 24, 32, {
    label: prim.id, mass: cfg.mass ?? 5, frictionAir: 0.05,
  });
}
```
**Connection:** Use existing `beam` constraint system — counterweight is attached to crane-arm via a `beam` primitive.

---

#### T2-9: `bucket`
**Config:** `{ x, y, width: 40, depth: 30, attachedToArmId?: string }`
**Physics:** Composite U-shape (3 rectangles: left wall, right wall, base).
Only the base needs to be the main returned body (the "bucket body"). The walls are added in the post-body loop.
**Collection zone tick:**
```typescript
function tickBuckets(bucketContents: Record<string, number>, bucketStates: Record<string, 'collecting' | 'dumping'>) {
  for (const prim of manifest.primitives.filter(p => p.kind === 'bucket')) {
    const bucketBody = bodyMap.get(prim.id);
    if (!bucketBody) continue;
    const angle = ((bucketBody.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const isDumping = bucketStates[prim.id] === 'dumping';

    // State transitions with hysteresis
    if (!isDumping && angle > 1.745) bucketStates[prim.id] = 'dumping'; // > 100°
    if (isDumping && angle < 1.047) bucketStates[prim.id] = 'collecting'; // < 60°

    if (isDumping) {
      // Release all collected materials
      bucketContents[prim.id] = 0;
      // (dynamic materials near bucket are released by removing any constraints)
      continue;
    }

    // Collection: count materials inside bucket zone
    let count = 0;
    const bx = bucketBody.position.x, by = bucketBody.position.y;
    for (const matPrim of manifest.primitives.filter(p => MATERIAL_KINDS.includes(p.kind))) {
      const matBody = bodyMap.get(matPrim.id);
      if (!matBody || collectedCargoIds.has(matPrim.id)) continue;
      if (Math.hypot(matBody.position.x - bx, matBody.position.y - by) < 30) count++;
    }
    bucketContents[prim.id] = count;
  }
}
```

---

### Tier 3 — Additional Machine Parts

#### T3-1: `rack`
**Config:** `{ x, y, width: number, orientation: 'horizontal' | 'vertical' }`
**Physics:** Dynamic rectangle. Two invisible static "rail" bodies constrain it to one axis.
**motorRackMap:** Actually a `gearRackMap: Map<string, string>` — rack → driving gear id.
Built at construction: find gear within 30px of rack end. If found, `gearRackMap.set(rack.id, gear.id)`.
**Tick:**
```typescript
function tickRacks() {
  for (const prim of manifest.primitives.filter(p => p.kind === 'rack')) {
    const rackBody = bodyMap.get(prim.id);
    const gearId = gearRackMap.get(prim.id);
    if (!rackBody || !gearId) continue;
    const gearBody = bodyMap.get(gearId);
    if (!gearBody) continue;
    const gearPrim = manifest.primitives.find(p => p.id === gearId)!;
    const radius = rotatingRadius(gearPrim);
    const linearVel = gearBody.angularVelocity * radius;
    const cfg = prim.config as { orientation: string };
    Matter.Body.setVelocity(rackBody, {
      x: cfg.orientation === 'horizontal' ? linearVel : 0,
      y: cfg.orientation === 'vertical' ? linearVel : 0,
    });
  }
}
```

---

#### T3-2: `cam` and `cam-follower`
Implement together. Cam is a gear with an asymmetric lobe (visual). Cam-follower is a small dynamic body constrained to one axis.
**Tick:**
```typescript
// After driveMotors, for each cam:
for (const cam of manifest.primitives.filter(p => p.kind === 'cam')) {
  const camBody = bodyMap.get(cam.id);
  if (!camBody) continue;
  const lobeAngle = camBody.angle + (cam.config as { lobeOffset: number }).lobeOffset;
  const lobeTipX = camBody.position.x + Math.cos(lobeAngle) * (rotatingRadius(cam) * 1.3);
  const lobeTipY = camBody.position.y + Math.sin(lobeAngle) * (rotatingRadius(cam) * 1.3);
  // Find nearby follower
  for (const follower of manifest.primitives.filter(p => p.kind === 'cam-follower')) {
    const fBody = bodyMap.get(follower.id);
    if (!fBody) continue;
    if (Math.hypot(lobeTipX - fBody.position.x, lobeTipY - fBody.position.y) < 15) {
      // Lobe touching follower — apply impulse in lobe direction
      Matter.Body.applyForce(fBody, fBody.position, {
        x: Math.cos(lobeAngle) * 0.05,
        y: Math.sin(lobeAngle) * 0.05,
      });
    }
  }
}
```

---

### Tier 4 — Materials

#### T4-1: `sand` (`material-pile` primitive)
**Placement primitive kind:** `material-pile` (already in types.ts)
**Physics:** Anonymous particle bodies — NOT added to `bodyMap` by primitive ID.

**New data structures in closure:**
```typescript
const sandParticleBodies: Matter.Body[] = [];  // all sand particles
let totalParticleCount = 0;
const MAX_PARTICLES = 30;  // hard cap
```

**In body creation loop:**
```typescript
case 'material-pile': {
  const cfg = prim.config as { x: number; y: number; quantity: number };
  const qty = Math.min(cfg.quantity ?? 10, MAX_PARTICLES - totalParticleCount);
  totalParticleCount += qty;
  for (let i = 0; i < qty; i++) {
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 10;
    const particle = Matter.Bodies.circle(cfg.x + offsetX, cfg.y + offsetY, 4, {
      label: `sand-particle-${prim.id}-${i}`,
      mass: 0.1, restitution: 0.0, friction: 0.5,
      collisionFilter: { category: 0x0004, mask: 0x0001 }, // only vs static bodies
    });
    sandParticleBodies.push(particle);
    Matter.World.add(engine.world, particle);
  }
  return null; // no bodyMap entry for the pile primitive itself
}
```

**In PhysicsFrame:** Add `sandParticlePositions: Array<{ x: number; y: number }>` — populate from `sandParticleBodies.map(b => b.position)`. Renderer uses this array to draw particles.

**Recovery:** In tick, check each particle: if `position.y > CANVAS_H + 50`, reset to a random position above the pile.

---

#### T4-2: `water`
**Config:** `{ x, y, width: number, height: number, density: number }`
**Physics:** No physics body. Force zone only.
**Tick:**
```typescript
function tickWaterZones(supportedCargoIds: Set<string>) {
  const waterZones = manifest.primitives.filter(p => p.kind === 'water');
  if (waterZones.length === 0) return;

  for (const body of Matter.Composite.allBodies(engine.world)) {
    if (body.isStatic) continue;
    for (const zone of waterZones) {
      const cfg = zone.config as { x: number; y: number; width: number; height: number; density: number };
      if (body.position.x < cfg.x || body.position.x > cfg.x + cfg.width) continue;
      if (body.position.y < cfg.y || body.position.y > cfg.y + cfg.height) continue;

      // Skip bodies on conveyor belt (Bug I fix — prevents conveyor/water conflict)
      const primId = manifest.primitives.find(p => bodyMap.get(p.id) === body)?.id;
      if (primId && supportedCargoIds.has(primId)) continue;

      // Drag
      Matter.Body.setVelocity(body, { x: body.velocity.x * 0.94, y: body.velocity.y * 0.94 });

      // Buoyancy
      const buoyancy = body.mass * engine.gravity.y * (cfg.density ?? 0.8);
      Matter.Body.applyForce(body, body.position, { x: 0, y: -buoyancy });
    }
  }
}
```
Call `tickWaterZones(conveyorFrame.supportedCargoIds)` AFTER `tickConveyors()`.

---

### Tier 5 — Structural

#### T5-1: `hinge`
**Config:** `{ x, y }` (the pivot point position)
**Physics:** Not a body — just a position that two beams connect to via constraints.
**Implementation:** In the constraint creation loop, when a `beam` has `fromNodeId` pointing to a `hinge` primitive, create the constraint to `pointA: { x: hinge.x, y: hinge.y }` rather than to a body. This allows rotation around a fixed world point.

---

#### T5-2: `chute`
**Config:** `{ x, y, length: number, angle: number, wallHeight: 20 }`
**Physics:** Two parallel static rectangles (bottom surface + optional top wall).
Same body creation pattern as ramp, with an additional wall body.

---

#### T5-3: `silo-bin`
**Config:** `{ x, y, width: number, height: number }`
**Physics:** Three static bodies: left wall, right wall, floor.
**Gate control:** Add to `applyControls`:
```typescript
if (prim.kind === 'silo-bin') {
  const gateControl = manifest.controls.find(c => c.bind?.targetId === prim.id && c.bind?.path === 'gateOpen');
  if (gateControl && controlValues[gateControl.id]) {
    // Remove floor body from world
    const floorBody = siloFloorMap.get(prim.id);
    if (floorBody) {
      Matter.World.remove(engine.world, floorBody);
      siloFloorMap.delete(prim.id);
    }
  }
}
```
**Fill count:** Same as hopper — count material bodies inside boundaries each tick.

---

#### T5-4: `tunnel`
**Config:** `{ x, y, width: number, angle: number }`
**Physics:** Two parallel static rectangles (top and bottom of tunnel). Identical to two ramps facing each other with a gap. Material passes through the gap.

---

## File-by-File Change Plan (Corrected)

### 1. `src/lib/types.ts`
Add to `PrimitiveKind` union:
```typescript
| 'ramp' | 'platform' | 'wall' | 'ball' | 'rock' | 'spring-linear'
| 'pulley' | 'chain-sprocket' | 'rack' | 'piston' | 'crane-arm'
| 'bucket' | 'counterweight' | 'cam' | 'cam-follower'
| 'bevel-gear' | 'flywheel' | 'gearbox' | 'chassis'
| 'chute' | 'silo-bin' | 'water' | 'hinge' | 'tunnel'
```
Note: `sand` uses the existing `material-pile` kind.
Note: `drive-wheel` is just `wheel` with a higher traction config value — no new kind needed.

Add config interfaces for each new kind.

Extend `PhysicsFrame` in `physics-engine.ts`:
```typescript
pistonExtensions: Record<string, number>;     // 0..1 ratio
bucketContents: Record<string, number>;       // count of items
bucketStates: Record<string, 'collecting' | 'dumping'>;
springCompressions: Record<string, number>;   // 0..1 ratio
sandParticlePositions: Array<{ x: number; y: number }>;
```

Extend `RuntimeSnapshot` in `simulation.ts` with same fields (empty defaults).

---

### 2. `src/lib/physics-engine.ts`
**At top of `buildMatterWorld()`:**
```typescript
const MATERIAL_KINDS: PrimitiveKind[] = ['cargo-block', 'ball', 'rock'];
```

**In `tickConveyors()`:**
```typescript
// Change line ~492:
const cargoBlocks = manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind));
```

**In `tickHopper()`:**
```typescript
// Change the filter inside:
for (const prim of manifest.primitives) {
  if (!MATERIAL_KINDS.includes(prim.kind)) continue;  // was: prim.kind !== 'cargo-block'
```

**In `recoverLostCargo()`:**
```typescript
// Change the outer filter:
for (const cargo of manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind)))
```

**In `rotatingPrims` filter (gearMeshMap construction):**
```typescript
const rotatingPrims = manifest.primitives.filter((p) =>
  ['gear', 'wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(p.kind)
);
```

**In gear-pinning loop:**
```typescript
// Change:
if (prim.kind !== 'gear') continue;
// To:
if (!['gear', 'pulley', 'chain-sprocket'].includes(prim.kind)) continue;
// Flywheel is NOT pinned — it can translate if mounted on a moving vehicle
```

**In `tick()` return:**
Add new fields with defaults:
```typescript
return {
  ...existingFields,
  pistonExtensions: pistonExtensionsRef,
  bucketContents: bucketContentsRef,
  bucketStates: bucketStatesRef,
  springCompressions: springCompressionsRef,
  sandParticlePositions: sandParticleBodies.map(b => ({ x: b.position.x, y: b.position.y })),
};
```

**In `createBodyForPrimitive()`:**
Add cases for all new parts. Return `null` for any part that doesn't need a physics body at the primitive level (like `water`, `hinge`, `material-pile`).

Add explicit `default` case to catch unknown kinds:
```typescript
default: {
  console.warn(`createBodyForPrimitive: unknown kind "${prim.kind}", skipping body creation`);
  return null;
}
```

**New tick functions** (called from `tick()` after existing tick calls):
- `tickPistons()`
- `tickWinches()`
- `tickRacks()`
- `tickBuckets()`
- `tickWaterZones(supportedCargoIds)`
- Flywheel inertia propagation (inline in `tick()`)

**`applyControls()`:**
Add cases for piston direction toggle, silo-bin gate.

---

### 3. `src/components/MachineCanvas.tsx`
Add draw functions at the bottom of the draw loop for each new part. Use the `bodyPositions[prim.id]` from snapshot for dynamic parts, and `prim.config.x/y` for static parts.

**Critical:** Rope/spring drawing must use `bodyPositions`, not config positions:
```typescript
// For rope: draw line between actual body positions
const fromPos = snapshot.bodyPositions[rope.config.fromId];
const toPos = snapshot.bodyPositions[rope.config.toId];
if (fromPos && toPos) instance.line(fromPos.x, fromPos.y, toPos.x, toPos.y);
```

**Sand particles:** Draw from `snapshot.sandParticlePositions`:
```typescript
for (const pos of snapshot.sandParticlePositions) {
  instance.fill(194, 178, 128);
  instance.circle(pos.x, pos.y, 8);
}
```

---

### 4. `src/components/InspectorPanel.tsx`
Add motor ON/OFF-style toggle for:
- Piston: direction toggle (extend/retract)
- Silo-bin: gate toggle (open/close)

For all other new parts: derive editable fields from the config object (existing pattern for sliders/number fields).

---

### 5. `src/components/PartPalette.tsx`
Group new parts by category. In guided project mode, show only parts relevant to current step (existing `allowedPartKinds` already handles this). In free-build mode, add category tabs or disclosure sections. Do NOT show all 45 parts flat — this is a UX failure.

---

### 6. `src/lib/jobs.ts`
New `ProjectSuccessCheck` values:
```typescript
| 'vehicle-moving'    // chassis body has speed > 1
| 'load-lifted'       // hookY < some threshold
| 'bucket-filled'     // bucketContents[id] >= N
| 'bucket-dumped'     // bucket was in dumping state
| 'silo-full'         // silo-bin fill >= N
```

---

## The "Works First Time" Requirements

These are non-negotiable for a child user. Each new part must satisfy all of them.

1. **Immediate feedback.** Within 1 second of placement, the part should do something visible — spin, move, glow, fall, whatever. A part that sits there doing nothing looks broken.

2. **Generous snap zones.** For motor→gear connection: 220px range. For gear→gear mesh: `rA + rB + 16px`. Never require pixel-perfect placement. New parts follow the same generous tolerance.

3. **No silent failures.** If a motor is placed 300px from a gear and therefore doesn't drive it, there must be a visual indicator. The existing "range ring" pattern on the motor should extend to all new power connections.

4. **One-click undo-equivalent.** If a kid places a part that breaks something, they can delete it. Delete key must work for every new part.

5. **Parts can't collide with gears in weird ways.** New static parts (ramps, walls) must have `collisionFilter` set to prevent them from interacting with gears/motors. Gears are pinned in place but can still receive collision forces that fight the pin constraint. Use:
   ```typescript
   // In ramp/wall/platform creation:
   collisionFilter: { category: 0x0001, mask: 0x0001 }
   // In gear creation (add this):
   collisionFilter: { category: 0x0002, mask: 0x0003 }
   // Gears collide with static world + dynamic material, not with each other's physical bodies
   ```

6. **Parts that fall off screen respawn.** Every new dynamic part must be handled in a recovery function. At minimum: if `y > CANVAS_H + 90`, reset to spawn position.

7. **Throughput metric.** The `throughput` counter displayed in HUD currently only counts cargo-block entering hoppers. When new materials enter hoppers/bins, `throughput` should increment. This is a one-line change in `tickHopper`.

---

## Refined Bug Catalog

### Bug 1: Constraint Instability
Use `stiffness: 0.9, damping: 0.1` for all body-to-body constraints. Never use `stiffness: 1.0` for body-to-body. (World-anchor constraints are fine at 1.0.)

### Bug 2: Tunneling
Velocity cap in `tick()` after Matter.Engine.update:
```typescript
Matter.Engine.update(engine, dt * 1000);
// Velocity cap to prevent tunneling
for (const body of Matter.Composite.allBodies(engine.world)) {
  if (body.isStatic) continue;
  const MAX_V = 18;
  if (Math.abs(body.velocity.x) > MAX_V || Math.abs(body.velocity.y) > MAX_V) {
    Matter.Body.setVelocity(body, {
      x: Math.sign(body.velocity.x) * Math.min(Math.abs(body.velocity.x), MAX_V),
      y: Math.sign(body.velocity.y) * Math.min(Math.abs(body.velocity.y), MAX_V),
    });
  }
}
```

### Bug 3: Sand Performance
30-particle hard cap. Collision category mask filters sand-to-sand collisions. FPS monitor: if fps drops below 30 for 3 consecutive seconds, begin removing particles (oldest first).

### Bug 4: World Rebuild on Drag (ALREADY FIXED — preserve it)
The `dragBufferRef` fix must not be accidentally broken when adding new part types to MachineCanvas. Any new drag handling for new parts must follow the same pattern: buffer position in `mouseDragged`, commit in `mouseReleased`.

### Bug 5: Circular Gear BFS (ALREADY HANDLED — preserve it)
`driven.has(meshId)` in `driveMotors()` prevents re-visiting. Preserve this when extending the BFS to include pulleys and flywheels.

### Bug 6: Multiple Hoppers
Current `tickHopper` uses `hopperStructures[0]` for slot calculation — only works with one hopper. For now: limit designs to one hopper per canvas (enforce in PartPalette: if `hopperCount >= 1`, grey out hopper in palette). Multi-hopper support is a future feature.

### Bug 7: Deletion of Parts with Constraints
When a part that has constraints (rope endpoints, beam endpoints) is deleted, the constraint references a dead body ID. Current behavior: `buildMatterWorld()` is called on every manifest change — the world is rebuilt from scratch, so deleted parts just don't appear. This is safe. DO NOT change to an incremental update approach (it would break this guarantee).

### Bug 8: Piston Position Override vs Physics
`tickPistons` calls `Matter.Body.setPosition` every tick (overrides physics). This means no external force can push the piston back. This is correct for a motor-driven piston. But if the piston drives something, that something also can't push back. This is an acceptable simplification.

### Bug 9: Rope Visual Uses Stale Config Position (not yet fixed)
Currently the rope is drawn at `config.fromId`/`toId` positions (where the bodies started), not where they are now. This is a pre-existing visual bug. Fix in MachineCanvas: use `bodyPositions` for any constraint visualization.

### Bug 10: Content Epoch / Old Drafts
When new parts are added, old saved drafts won't contain them — that's fine. Old drafts with `kind: 'gear'` etc. continue to work. Never rename or remove a PrimitiveKind. Only add.

### Bug 11: Hopper Only Collects `cargo-block` (MUST FIX BEFORE NEW MATERIALS)
As documented above. Use `MATERIAL_KINDS.includes(p.kind)` in all three filter sites.

### Bug 12: `recoverLostCargo` Spawn Map Not Updated for Non-Belt Materials
For materials not on a conveyor, `cargoSpawnMap` is never updated — they always respawn at original placement. This is correct behavior (no special fix needed).

### Bug 13: `Matter.Bodies.fromVertices` requires `poly-decomp`
Used for rock irregular shape. Verify `poly-decomp` is in `node_modules`. If not: `npm install poly-decomp` and `import 'poly-decomp'` at top of `physics-engine.ts`.

### Bug 14: Flywheel Inertia Propagation Creates Secondary Drive
After motor off, flywheel continues spinning and drives meshed gears. This secondary drive is not in `drivenVels` map → gear rotations not accumulated in `rotations` dict → job step checks that read `rotations` see zero. Fix: add flywheel-driven gears to `rotations` accumulation loop.

### Bug 15: Water Zone + Conveyor Conflict (see Scenario 9)
`tickWaterZones` must receive `supportedCargoIds` from `tickConveyors` and skip any body in that set.

---

## Implementation Phases (Revised)

### Phase 0 — Mandatory Prep (no new features, just enabling infrastructure)
1. Add `MATERIAL_KINDS` constant at top of `buildMatterWorld()`
2. Update the three filter sites to use `MATERIAL_KINDS.includes()`
3. Add `default: return null` to `createBodyForPrimitive` switch
4. Add new `PrimitiveKind` values to `types.ts` (TypeScript-only, no physics)
5. Add new empty fields to `RuntimeSnapshot` with defaults
6. Verify all 3 starter projects still work
7. **`npx tsc --noEmit` must be zero errors before proceeding**

### Phase 1 — Static surfaces (ramp, wall, platform)
These are literally just static rectangle bodies. Zero risk.
8. Add body creation cases for `ramp`, `wall`, `platform`
9. Add draw functions in MachineCanvas
10. Verify ball/cargo rolls on ramp naturally (no tick code needed)

### Phase 2 — New materials (ball, rock)
11. Add body creation cases for `ball`, `rock`
12. Verify MATERIAL_KINDS filter means they work on conveyor + into hopper
13. Verify they respawn when lost

### Phase 3 — Power transmission (pulley, flywheel, gearbox)
14. Extend `rotatingPrims` filter and gear-pinning loop
15. Add flywheel inertia propagation
16. Add gearbox special-case to gearMeshMap construction

### Phase 4 — Linear motion (piston, rack, spring)
17. Add piston body creation, motorPistonMap, tickPistons
18. Add rack body creation, gearRackMap, tickRacks
19. Add spring body creation + constraint

### Phase 5 — Lifting and transport (winch, crane-arm, bucket)
20. Complete winch tick (motor-driven)
21. Add crane-arm body + constraint
22. Add bucket body + tickBuckets

### Phase 6 — Materials (sand, water)
23. Sand particles (anonymous bodies, sandParticlePositions in frame)
24. Water zones (force-only, use tickWaterZones)

### Phase 7 — Structural (hinge, chute, silo-bin, tunnel)
25. Each is a static body variant — straightforward

### Phase 8 — New Projects
26. Only after phases 0-7 are stable through real play testing
27. Design new `SiteJobDefinition` entries
28. Bump content epoch to `relaunch-3-projects-v3`

---

## "Do Not Break" Checklist (Run After Every Phase)

- [ ] Motor → Gear proximity drive works (BFS, counter-rotate)
- [ ] Gear → Gear meshing works (ratio propagation)
- [ ] Conveyor support bodies keep cargo on belt
- [ ] `collectedCargoIds` is monotonically increasing
- [ ] `dragBufferRef` pattern prevents per-frame world rebuilds
- [ ] All 3 starter projects complete normally with step celebration
- [ ] Delete/Backspace removes selected part
- [ ] Motor toggle works (click on canvas + InspectorPanel button)
- [ ] Belt animation draws chevrons
- [ ] `npx tsc --noEmit` produces zero errors
- [ ] `npm run build` produces no errors (chunk size warning OK)

---

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/types.ts` | ~450 | All TypeScript types — PrimitiveKind, configs, RuntimeSnapshot |
| `src/lib/physics-engine.ts` | ~861 | Matter.js engine — ALL new physics goes here |
| `src/lib/simulation.ts` | ~600 | RuntimeSnapshot bridge, scripted legacy path |
| `src/lib/jobs.ts` | ~374 | Step evaluation — success checks read runtime |
| `src/lib/seed-data.ts` | ~400 | DB seed + starter jobs |
| `src/pages/BuildPage.tsx` | ~1584 | Main builder UI, guided placement |
| `src/components/MachineCanvas.tsx` | ~1316 | p5.js rendering + all interaction |
| `src/components/InspectorPanel.tsx` | ~200 | Part property editor |
| `src/components/PartPalette.tsx` | ~150 | Part picker |

---

*Plan v2 — reviewed against actual source code. Key corrections from v1: conveyor support body is physical (not force-only); MATERIAL_KINDS filter fix is mandatory; piston stiffness is 0.9 not 1.0; rope stiffness is 0.05 not 0.8; sand uses anonymous bodies not named primitives; port system deferred in favor of specific maps.*
