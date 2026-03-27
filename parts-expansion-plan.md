# Mason's Lab — Parts Expansion Plan
*Pass this to Claude when ready to implement. Do NOT start implementing until all 3 starter projects are reliably working.*

---

## Ground Rules for Implementation

1. **Never break existing parts.** Motor, gear, conveyor, hopper, cargo-block must continue to work exactly as they do. New code is additive.
2. **Strangler fig pattern.** New parts plug into the existing engine via new code paths. Existing code paths are not refactored until new parts are proven.
3. **Physics mode only.** All new parts live in `physics-engine.ts` (the real Matter.js path). Nothing goes in `simulation.ts` (that's the legacy scripted path).
4. **Port system is additive.** The port routing lives alongside existing `motorGearMap`, `gearMeshMap`, etc. — it doesn't replace them.
5. **Run `npx tsc --noEmit` after every file change.** Zero tolerance for TypeScript errors.

---

## Current Architecture (what you are building on)

### Two simulation paths
- **Scripted** (`simulation.ts`): manifests with `recipeId` — legacy showcase machines only
- **Physics** (`physics-engine.ts`): manifests without `recipeId` — all 3 starter projects, all new parts

### Existing primitive kinds (types.ts)
```
'node' | 'beam' | 'wheel' | 'axle' | 'motor' | 'gear' | 'winch' | 'rope' | 'hook' |
'rail-segment' | 'rail-switch' | 'locomotive' | 'wagon' |
'conveyor' | 'hopper' | 'cargo-block' | 'material-pile'
```

Several of these (`beam`, `axle`, `winch`, `rope`, `hook`) are typed but NOT fully implemented in physics-engine.ts. The plan below completes them properly.

### Key internal maps in `buildMatterWorld()`
```typescript
const bodyMap = new Map<string, Matter.Body>();          // primitive id → body
const motorGearMap = new Map<string, string[]>();        // motor → gear ids in range
const motorWheelMap = new Map<string, string[]>();       // motor → wheel ids in range
const gearMeshMap = new Map<string, Array<{id, ratio}>>(); // gear/wheel → meshed neighbors
const conveyorMotorMap = new Map<string, string[]>();    // conveyor → nearby motors
```

New maps follow the same pattern. All proximity checks happen at world construction time (not every tick) — this is critical for performance.

### RuntimeSnapshot (simulation.ts) — fields that need adding
```typescript
interface RuntimeSnapshot {
  // EXISTING (do not change)
  time: number;
  rotations: Record<string, number>;
  cargoProgress: Record<string, number>;
  hookY: number;
  trainProgress: number;
  trainDelivered: boolean;
  hopperFill: number;
  throughput: number;
  telemetry: BuildTelemetry;
  bodyPositions?: Record<string, { x: number; y: number; angle: number }>;
  motorDrives?: Record<string, string[]>;
  gearMeshes?: Record<string, string[]>;
  cargoStates: Record<string, CargoLifecycleState>;
  beltPowered: boolean;
  lostCargoCount: number;
  stableCargoSpawns: Record<string, { x: number; y: number }>;
  // NEW (add these)
  pistonExtensions: Record<string, number>;          // 0..1 extension ratio
  winchRopeLengths: Record<string, number>;          // current rope length in px
  bucketContents: Record<string, number>;            // bucket id → count of material inside
  vehiclePositions: Record<string, { x: number; y: number; angle: number }>;
  springCompressions: Record<string, number>;        // 0..1 compression ratio
}
```

---

## The Port System

### Core concept
Every part declares typed ports. The engine resolves connections at world-build time by proximity. No hard-coded per-pair logic.

### Port types
```typescript
type PortKind = 'rotary' | 'linear' | 'material' | 'structural';
type PortRole = 'input' | 'output' | 'bidirectional';

interface Port {
  kind: PortKind;
  role: PortRole;
  localOffset: { x: number; y: number };  // relative to part origin
  range: number;                           // connection radius in px
  id: string;                             // e.g. 'drive-out', 'load-in'
}
```

### Where the port registry lives
**New file: `src/lib/part-registry.ts`**

```typescript
// Maps every PrimitiveKind to its port declarations
// Used by physics-engine.ts to route connections at world-build time
// Used by MachineCanvas.tsx to draw port indicators during placement
export const PART_PORTS: Record<PrimitiveKind, Port[]> = { ... };
```

### How the engine uses it
In `buildMatterWorld()`, after creating all bodies:
```typescript
// For each pair of primitives, check if any ports connect
for (const a of manifest.primitives) {
  for (const b of manifest.primitives) {
    if (a.id === b.id) continue;
    const connections = resolvePortConnections(a, b);
    for (const conn of connections) {
      applyConnection(conn, a, b, bodyMap, engine);
    }
  }
}
```

This is O(n²) in part count — acceptable for 50-100 parts. For > 100 parts, add spatial bucketing.

---

## Complete Parts List (45 parts)

### Tier 1 — Implement First (unblock the most)

---

#### T1-1: `wheel` (complete the existing stub)
**Config:** `{ x, y, radius: number, traction: number }`
**Physics:** Dynamic circular body, `frictionAir: 0.01`, `restitution: 0.1`
**Ports:**
- `rotary-in`: accepts RPM from motor/gear within 220px
**Behavior:**
- When connected to motor: `Matter.Body.setAngularVelocity(body, rpm * Math.PI / 30)`
- Rolls on static surfaces via normal Matter.js contact
- Connected to same axle as another wheel: both wheels share RPM (vehicle moves)
**Tick logic:** Apply angular velocity every tick if powered. If on ground, friction drives the body forward (vehicle locomotion).
**Known bug risk:** Without axle connecting two wheels, each wheel is independent and the "vehicle" won't translate. Axle is required for vehicle motion. Validate in guided placement.

---

#### T1-2: `axle` (complete the existing stub)
**Config:** `{ x, y, length: number }`
**Physics:** NOT a dynamic body. It's a **constraint pair** connecting two wheels.
- Create a `Matter.Constraint` (distance=0, stiffness=1.0) from wheel A center to wheel B center through axle body
- Axle body itself: thin rectangle, `isStatic: false`, `collisionFilter: { mask: 0 }` (no collisions)
**Ports:**
- `structural-in` (both ends): connects to wheel
**Behavior:**
- Constrains wheel separation to axle length
- Transmits rotary input from one wheel to the other (if motor drives left wheel, right wheel gets same RPM)
**Known bug risk:** If `length` in config doesn't match the actual distance between the two wheels at placement, the constraint solver will yank them together or apart violently. Guided placement must snap second wheel to exactly `axle.length` from first wheel.

---

#### T1-3: `ramp`
**Config:** `{ x, y, width: number, angle: number }` (angle in degrees, 0 = flat, 45 = diagonal)
**Physics:** Static rectangle body, rotated to `angle * Math.PI / 180`
**Ports:** None (passive)
**Behavior:** Pure collision surface. No tick logic needed.
**Visual:** Filled rectangle with hatch marks indicating the surface.
**Known bug risk:** Small cargo blocks can "clip through" ramp if they hit at high velocity (Matter.js tunneling). Mitigate: set `slop: 0` on ramp body, cap cargo velocity at 15px/frame.

---

#### T1-4: `ball`
**Config:** `{ x, y, radius: 12 }` (fixed radius, user picks position)
**Physics:** Dynamic circle, `restitution: 0.6`, `friction: 0.3`, `frictionAir: 0.005`
**Ports:**
- `material-out`: counts as 1 unit of material entering hopper
**Behavior:** Pure physics — falls, rolls, bounces. No tick logic beyond what Matter.js provides.
**Visual:** Circle with highlight spot to indicate it's round/shiny.
**Known bug risk:** Balls rolling off screen edge are lost. Same recovery needed as cargo-block. Track in `lostCargoCount`, optionally respawn at spawn point.

---

#### T1-5: `spring-linear`
**Config:** `{ x, y, orientation: 'horizontal' | 'vertical', restLength: number, stiffness: number }`
**Physics:** Two static anchor points + `Matter.Constraint` with `stiffness: 0.05`, `damping: 0.1`
- One end is anchored static point
- Other end has a small dynamic plate body (the "piston face")
**Ports:**
- `material-in` at plate: material landing on plate compresses spring
- `linear-out` at plate: plate position drives connected rack/arm
**Behavior tick:**
- Compression ratio = `(restLength - currentLength) / restLength`, clamped 0..1
- Store in `springCompressions[id]`
**Visual:** Zigzag spring drawing between anchor and plate. Compress visually with real position.

---

#### T1-6: `platform`
**Config:** `{ x, y, width: number, height: 10 }`
**Physics:** Static rectangle. Identical to ramp at angle=0.
**Ports:** None (structural surface)
**Note:** This is literally just a horizontal ramp. Could be the same code path. Keep as separate kind for UX clarity.

---

#### T1-7: `wall`
**Config:** `{ x, y, width: 20, height: number, angle: 0 }`
**Physics:** Static rectangle, vertical.
**Ports:** None
**Note:** Same as platform but vertical. Again — same code, different kind for UX.

---

### Tier 2 — Machine Parts

---

#### T2-1: `pulley`
**Config:** `{ x, y, radius: number }`
**Physics:** Same as gear (pinned circle), but connects to rope/belt rather than meshing with adjacent gears
**Ports:**
- `rotary-in`: motor within 220px drives it
- `rotary-out`: transmits to rope endpoint (changes linear direction of rope)
- `structural-in`: can be anchored to beam/platform
**Behavior:** Identical to gear rotation. A rope running over pulley changes direction — model this as two separate rope segments with shared angular velocity at pulley body.
**Visual:** Circle with a groove/channel drawn around circumference.
**Known bug risk:** Two pulleys + rope = a loop constraint. Matter.js doesn't model rope loops natively. Simplify: one pulley redirects a "virtual" rope — track rope endpoint positions manually, not as Matter.js constraints.

---

#### T2-2: `chain-sprocket`
**Config:** `{ x, y, radius: number, teeth: 8 }`
**Physics:** Identical to pulley, but:
- Non-slip (chain can't slip off — pulley can)
- Higher load capacity (no slip under heavy loads)
- Visual: gear-style teeth around rim
**Behavior tick:** Same BFS as gears for RPM propagation. Chain maintains 1:1 speed ratio (no slip), gear maintains ratio by tooth count.

---

#### T2-3: `rack` (half of rack & pinion)
**Config:** `{ x, y, width: number, angle: 0 }` (horizontal or vertical)
**Physics:**
- Dynamic rectangle body (can move linearly)
- Constrained to move only along one axis via two `Matter.Constraint` guides (prevent lateral movement)
**Ports:**
- `rotary-in` at one end: a gear within 30px of rack end drives it
**Behavior tick:**
- Find connected gear's angular velocity → convert to linear velocity: `v = gear.angularVelocity * gear.radius`
- `Matter.Body.setVelocity(rackBody, { x: v, y: 0 })`
- Track position in `bodyPositions`
**Known bug risk:** Rack must be guided to exactly touch gear's perimeter. Guided placement must snap rack to `gear.x + gear.radius` distance.

---

#### T2-4: `piston`
**Config:** `{ x, y, orientation: 'horizontal' | 'vertical', stroke: number, speed: number }`
**Physics:**
- Two bodies: cylinder (static) + piston rod (dynamic)
- Rod constrained to slide in cylinder axis only
- Motor within 220px drives extend/retract cycle
**Behavior tick:**
- If powered: `extension += speed * dt`, reverse at ends (0..stroke)
- Set rod position = cylinder.end + extension * axis
- Store `pistonExtensions[id]` = extension / stroke (0..1)
**Ports:**
- `rotary-in`: motor drives it
- `linear-out` at rod tip: pushes connected arm/bucket
**Known bug risk:** Piston rod can escape its cylinder if physics solver applies external force. Fix: use `Matter.Constraint` with `stiffness: 1.0` (rigid) on rod body, not just position setting.

---

#### T2-5: `hydraulic-arm`
**Config:** `{ x, y, length: number, angle: number }` — the whole arm
**Physics:** Dynamic rectangle body, pinned at base via `Matter.Constraint` to static anchor
**Ports:**
- `linear-in` at tip: piston drives it
- `material-in` at tip: (if bucket attached, see T2-6)
**Behavior:** Piston linear output → arm rotates around pivot. Map linear extension to angle change: `angle = baseAngle + (extension / pistonStroke) * maxRotation`
**Known bug risk:** Arm physics can oscillate if constraint damping is too low. Use `damping: 0.8` on the pivot constraint. Also: arm-bucket attachment needs a second constraint, creating a compound body — test for constraint solver instability.

---

#### T2-6: `bucket`
**Config:** `{ attachedToId: string }` — must be attached to arm tip or crane hook
**Physics:** U-shaped composite body (3 rectangles forming a scoop)
**Ports:**
- `material-in` at open top: collects cargo/ball/rock within collection zone
- `material-out` when tilted > 90°: dumps material
**Behavior tick:**
- When angle > 90°: release all collected material (set them dynamic, remove from `bucketContents`)
- Collection zone: material within 30px of bucket centroid and inside the U shape
- Track fill in `bucketContents[id]`
**Known bug risk:** The "tilt to dump" trigger is fragile if the arm oscillates. Add hysteresis: must be > 100° to dump, won't re-collect until back to < 60°.

---

#### T2-7: `crane-arm`
**Config:** `{ x, y, length: number }` — the horizontal boom
**Physics:**
- Static horizontal beam (the arm doesn't move, only the rope/hook moves)
- OR: Dynamic arm pinned at base (rotating crane) — implement static first
**Ports:**
- `structural-out` at tip: rope/winch attaches here
**Behavior:** The winch (T2-8) handles the lift — crane-arm just provides the attachment point.

---

#### T2-8: `winch` (complete the existing stub)
**Config:** `{ x, y, speed: number, ropeLength: number }`
**Physics:**
- Winch drum: static body (it doesn't move)
- Rope: `Matter.Constraint` from drum to hook, `stiffness: 0.9`, `damping: 0.1`
- Hook: small dynamic body at rope end
**Ports:**
- `rotary-in`: motor within 220px drives reel speed
**Behavior tick:**
- If motor is powering + reel up: `constraint.length -= speed * dt`, min = 50px
- If reel down: `constraint.length += speed * dt`, max = config.ropeLength
- Store `winchRopeLengths[id]` = current length
- `hookY` in snapshot = hook body y position
**Known bug risk (critical):** Matter.js constraints get unstable when length changes too fast. Cap delta per tick: `Math.min(speedPerTick, 2)` px/tick. Also: if hook swings and rope goes slack (body moves faster than constraint shortens), the constraint snaps taut violently. Fix: add damping `0.15` and cap angular velocity of hook body.

---

#### T2-9: `rope` (complete the existing stub)
**Config:** `{ fromId: string, toId: string, length: number }`
**Physics:** `Matter.Constraint` between two bodies, `stiffness: 0.8`, `damping: 0.05`
**Ports:** None (it's a connection, not a part per se)
**Behavior:** Length is fixed. If `fromId` or `toId` is deleted, rope must be deleted too.
**Deletion handling:** In `buildMatterWorld`, after adding all bodies, validate that both `fromId` and `toId` exist in `bodyMap`. If either is missing, skip this rope (log warning). This prevents crashes when one end is deleted.
**Visual:** Draw a line between the two constraint body positions (NOT between config positions, which are outdated after physics runs).
**Known bug risk:** If rope length < actual distance between bodies, it snaps taut with large impulse → instability. Validate at world-build: if `length < dist(a, b) * 0.9`, auto-extend length to `dist(a, b) * 1.1` and log a warning.

---

#### T2-10: `hook` (complete the existing stub)
**Config:** `{ x, y }`
**Physics:** Small dynamic capsule body. Attaches to rope's lower end via constraint.
**Ports:**
- `material-in`: cargo within 20px snaps on (becomes `hookAttached`)
**Behavior tick:**
- When cargo is within 20px of hook and user has not released: create a rigid `Matter.Constraint` (stiffness: 1, length: 5) between hook and cargo body
- When user triggers release (separate control): remove that constraint
**Known bug risk:** Auto-grab can grab cargo the player wasn't intending to grab. Add: only grab if cargo is stationary (speed < 1px/frame) AND hook is moving downward.

---

#### T2-11: `counterweight`
**Config:** `{ x, y, mass: number }`
**Physics:** Heavy static-until-connected rectangle. Once connected to a beam via constraint, it becomes dynamic.
**Ports:**
- `structural-in` at top: connects to beam/arm
**Behavior:** Pure physics mass. No tick logic. Weight is `mass * 10` (kg-equivalent).
**Visual:** Dark heavy-looking block with hatching.

---

### Tier 3 — Additional Machine Parts

---

#### T3-1: `cam`
**Config:** `{ x, y, teeth: 0, lobeOffset: number }` (uses gear config)
**Physics:** Same as gear (pinned dynamic circle) but with an asymmetric collision shape (lobe)
**Ports:**
- `rotary-in`: motor/gear drives it
- `linear-out` at lobe tip: pushes follower during lobe pass
**Behavior tick:**
- At every tick, check if lobe tip is within 20px of any `cam-follower` part
- If yes: apply linear impulse in lobe direction
- This creates intermittent push (not continuous)
**Known bug risk:** Lobe detection is position-dependent. Cam must be adjacent to its follower. Guided placement must enforce proximity.

---

#### T3-2: `cam-follower`
**Config:** `{ x, y, orientation: 'vertical' | 'horizontal' }`
**Physics:** Small dynamic rectangle constrained to one axis (like a rack)
**Ports:**
- `linear-in` from cam lobe
- `linear-out` at opposite end (pushes next part)

---

#### T3-3: `bevel-gear`
**Config:** `{ x, y, teeth: 20, axis: 'horizontal' | 'vertical' }`
**Physics:** Visual-only rotation change. Two bevel gears on perpendicular axes.
**Behavior:** When horizontal bevel gear meshes with vertical bevel gear: transmit RPM across the axis change. In 2D this is a visual abstraction — one gear drives the other's angular velocity regardless of orientation, but the "axis change" is communicated visually.
**Note:** This is mostly cosmetic in 2D physics. The value is teaching kids what a bevel gear does. Implementation is: treat like a normal gear mesh but draw it differently.

---

#### T3-4: `flywheel`
**Config:** `{ x, y, radius: 30, mass: 5 }` (heavier = more inertia)
**Physics:** High-inertia dynamic circle. `frictionAir: 0.001` (almost no air drag — keeps spinning).
**Ports:**
- `rotary-in`: receives RPM from motor/gear
- `rotary-out`: transmits RPM to next gear (smoothed)
**Behavior tick:**
- Store rolling average of received RPM over last 10 ticks
- Output smoothed RPM rather than instantaneous
- If motor is turned OFF: flywheel continues spinning, decelerating slowly
**Teaching value:** Kids see the machine keep going after motor turns off. Good "aha" moment.

---

#### T3-5: `gearbox`
**Config:** `{ x, y, inputTeeth: 10, outputTeeth: 40 }` (sets ratio)
**Physics:** Black box — no visible internal gears. One input port, one output port.
**Ports:**
- `rotary-in` left side
- `rotary-out` right side at ratio = `outputTeeth / inputTeeth`
**Behavior tick:** `outputRpm = inputRpm * (inputTeeth / outputTeeth)`
**Teaching value:** "Change the number to go faster or slower." Visible ratio on the box.

---

#### T3-6: `drive-wheel` (vehicle)
**Config:** `{ x, y, radius: 20 }`
**Physics:** Same as `wheel` but with higher traction (`friction: 0.8`) — designed for vehicle locomotion rather than belt/gear work.
**Behavior:** When motor drives → wheel rolls → if chassis body is connected via axle → vehicle translates.

---

#### T3-7: `chassis`
**Config:** `{ x, y, width: number, height: number }`
**Physics:** Dynamic rectangle. Two axle-port attachment points (front, rear).
**Ports:**
- `structural-in` ×2 at bottom corners: accepts axle connections
- `structural-in` at top: accepts arm/piston attachment
**Behavior:** Serves as the body of a vehicle. When both axles are driven, chassis moves.

---

#### T3-8: `chute`
**Config:** `{ x, y, length: number, angle: number }`
**Physics:** Static angled rectangle (same as ramp) with side walls to contain material.
- The "walls" are thin static rectangles at 90° to the chute surface
**Ports:**
- `material-in` at top: receives material from conveyor/bucket
- `material-out` at bottom: material exits (feeds hopper, bin, etc.)
**Behavior:** Pure passive physics — gravity does the work.

---

#### T3-9: `funnel` (already partially exists as hopper entrance)
Make this a standalone part that feeds into a hopper or bin.
**Config:** `{ x, y, width: 80, outputX: number, outputY: number }`
**Physics:** Two angled static walls forming a V shape.
**Ports:**
- `material-in` at wide top
- `material-out` at narrow bottom: gravity carries material out
**Behavior:** No tick logic. Matter.js contact with the funnel walls redirects material downward.

---

#### T3-10: `silo-bin`
**Config:** `{ x, y, capacity: number, gateOpen: false }`
**Physics:** Three static walls (left, right, bottom). Top is open.
**Ports:**
- `material-in` at top: receives material
- `material-out` at bottom gate: when gate opens, material falls out
**Behavior tick:**
- Count material bodies inside bin boundaries → store as `hopperFill` variant
- If `gateOpen`: remove bottom wall body from world → material falls
**Control:** Add a toggle control for `gateOpen` in the ControlPanel.

---

### Tier 4 — Materials

---

#### T4-1: `rock`
**Config:** `{ x, y }`
**Physics:** Same as cargo-block but:
- `mass: 3` (heavy)
- `restitution: 0.05` (almost no bounce)
- `friction: 0.9` (high friction on surfaces)
- Shape: irregular polygon (5-6 vertices around a circle) for visual variety
**Ports:**
- `material-out`: counts as 1 unit for hopper/bin

---

#### T4-2: `sand` (granular material)
**Config:** `{ x, y, quantity: 20 }` (max 30 — enforce hard cap for performance)
**Physics:** `quantity` small circle bodies, radius 4px, `mass: 0.1`, `restitution: 0.0`, `friction: 0.5`
**PERFORMANCE WARNING:** Each sand particle is a separate Matter.js body. 30 × 60fps = expensive. Hard cap at 30 particles. If user places another sand pile, refuse and show "sand limit reached" toast.
**Behavior:** Pure physics — piles, flows through funnels, fills bins.
**Known bug risk:** Sand particles can clip through walls if they stack too high and get compressed. Fix: reduce particle size or add `slop: 0` on walls. Also: sand on a conveyor — the anti-gravity force must be applied per-particle, and with 30 particles this still runs at 60fps.

---

#### T4-3: `water` (fluid zone)
**Config:** `{ x, y, width: number, height: number }` — defines a rectangular water zone
**Physics:** No physical bodies for water itself. It's a force zone.
**Behavior tick:**
- For every dynamic body whose center is inside the water rectangle:
  - Apply buoyancy force: `upward = density * volume * gravity` (simplified: fixed upward force based on body mass)
  - Apply drag: `Matter.Body.setVelocity(body, { x: body.velocity.x * 0.95, y: body.velocity.y * 0.95 })`
- `density` config slider: 0.5 (less than water, floats) to 2.0 (sinks)
**Visual:** Semi-transparent blue rectangle with animated wave lines.
**Known bug risk:** Bodies that are partially submerged should get partial force. The simplification (either fully in or not) causes jitter as body crosses the surface. Fix: interpolate force based on what fraction of body is submerged (approximate by y-overlap).

---

### Tier 5 — Structural

---

#### T5-1: `beam` (complete the existing stub)
**Config:** `{ fromNodeId: string, toNodeId: string, stiffness: 1.0 }`
**Physics:** Dynamic rectangle connecting two node positions. Length = `dist(fromNode, toNode)`.
- `Matter.Constraint` at each end to the respective node bodies
**Ports:**
- `structural-in` at each end: connects to node/axle/pivot
**Behavior:** When one end is pinned (static node), beam can swing. When both ends are dynamic, it's a linkage.

---

#### T5-2: `node` (complete the existing stub)
**Config:** `{ x, y }`
**Physics:** Small dynamic body. Can be static (locked) or dynamic.
- If `locked: true` in manifest: set `isStatic: true`
**Ports:**
- `structural-in/out` ×4: accepts beam, axle, arm connections
**Behavior:** Pure connection point. No tick logic.

---

#### T5-3: `hinge`
**Config:** `{ x, y }` — the pivot point
**Physics:** `Matter.Constraint` with `length: 0, stiffness: 1.0` pinning two bodies together at a shared point, with rotation allowed.
**Implementation:** A hinge is actually implemented by creating a constraint between two body's attachment points at the same location with zero length and stiffness 1. The bodies can still rotate relative to each other (since constraints only restrict position, not angle).
**Visual:** Small circle at pivot point.

---

#### T5-4: `tunnel`
**Config:** `{ x, y, width: number, angle: number }`
**Physics:** Two parallel static rectangles (top and bottom of tunnel) with a gap between them.
**Ports:** None (passive)
**Behavior:** Material passes through the gap. Top and bottom walls constrain material to the tunnel path.
**Visual:** Two parallel lines with a rounded entrance/exit.

---

## File-by-File Change Plan

### 1. `src/lib/types.ts`
**Changes:**
- Extend `PrimitiveKind` union with new kinds:
  ```typescript
  | 'ramp' | 'platform' | 'wall' | 'ball' | 'spring-linear'
  | 'pulley' | 'chain-sprocket' | 'rack' | 'piston' | 'hydraulic-arm'
  | 'bucket' | 'crane-arm' | 'counterweight' | 'cam' | 'cam-follower'
  | 'bevel-gear' | 'flywheel' | 'gearbox' | 'drive-wheel' | 'chassis'
  | 'chute' | 'funnel' | 'silo-bin' | 'rock' | 'sand' | 'water'
  | 'beam-simple' | 'hinge' | 'tunnel'
  ```
  Note: `beam`, `node`, `axle`, `winch`, `rope`, `hook` already exist — complete their implementations.

- Add config interfaces for each new kind:
  ```typescript
  interface RampConfig { x: number; y: number; width: number; angle: number }
  interface BallConfig { x: number; y: number; radius: number }
  // ... etc for all new parts
  ```

- Extend `RuntimeSnapshot` with new fields (see above)

- Add new `ProjectSuccessCheck` values as needed for future projects:
  ```typescript
  | 'vehicle-moving' | 'load-lifted' | 'bucket-filled' | 'bucket-dumped' | 'silo-full'
  ```

**Bug risk:** The `PrimitiveKind` union is used in many type guards throughout the codebase. Adding kinds without updating those guards will cause TypeScript errors. Use `tsc --noEmit` to catch all gaps.

---

### 2. `src/lib/part-registry.ts` (NEW FILE)
**Purpose:** Single source of truth for port declarations and part metadata.
```typescript
export interface PartMeta {
  label: string;
  category: 'power' | 'transmission' | 'converter' | 'actuator' | 'transport' | 'structural' | 'material';
  tier: 1 | 2 | 3 | 4 | 5;
  ports: Port[];
  defaultConfig: Record<string, unknown>;
  connectionRange: number;  // default 220, override per part
  maxCount?: number;        // for sand: 1 pile per canvas, etc.
}

export const PART_REGISTRY: Record<PrimitiveKind, PartMeta> = {
  motor: { label: 'Motor', category: 'power', tier: 1, ... },
  gear:  { label: 'Gear',  category: 'transmission', tier: 1, ... },
  // ... all 45+ parts
};
```

**Also export:**
- `getPortsForPrimitive(primitive: PrimitiveInstance): Port[]` — returns world-space port positions (adds config x/y to localOffset)
- `resolvePortConnections(a, b): PortConnection[]` — returns all valid connections between two primitives

---

### 3. `src/lib/physics-engine.ts`
**Additions (do NOT delete existing code):**

**A. New body creation in `buildMatterWorld()`:**
Add a case for each new `PrimitiveKind` in the body-creation section. Follow the existing pattern — create body, add to bodyMap, add to world.

**B. New proximity maps:**
```typescript
const pistonMotorMap = new Map<string, string[]>();    // piston → motors driving it
const winchMotorMap = new Map<string, string[]>();     // winch → motors driving it
const rackGearMap = new Map<string, string>();         // rack → driving gear
const bucketArmMap = new Map<string, string>();        // bucket → arm it's attached to
```
Build these maps in the same loop that builds `motorGearMap`.

**C. New tick functions:**
Add these to the `tick()` function, called after existing tick logic:
- `tickPistons(pistonMotorMap, bodyMap, world, dt)` → updates `pistonExtensions`
- `tickWinches(winchMotorMap, bodyMap, dt)` → updates `winchRopeLengths`, `hookY`
- `tickRacks(rackGearMap, bodyMap)` → converts angular to linear velocity
- `tickBuckets(bucketArmMap, bodyMap)` → checks tilt → dumps material
- `tickFlywheel(bodyMap, dt)` → maintains inertia after motor off
- `tickWaterZones(waterPrimitives, bodyMap, engine)` → buoyancy forces

**D. Update `PhysicsFrame` return:**
Add new fields to match extended `RuntimeSnapshot`.

**Critical rule:** All new tick functions must check that the body exists in `bodyMap` before operating on it. Missing bodies should log a warning and skip — never throw. Pattern:
```typescript
const body = bodyMap.get(primitiveId);
if (!body) { console.warn(`tickPistons: body ${primitiveId} not found`); return; }
```

---

### 4. `src/lib/simulation.ts`
**Changes:** Minimal. Only `createInitialSnapshot` needs to return the new fields with empty defaults:
```typescript
pistonExtensions: {},
winchRopeLengths: {},
bucketContents: {},
vehiclePositions: {},
springCompressions: {},
```
The scripted simulation path never populates these — that's fine.

---

### 5. `src/components/MachineCanvas.tsx`
**Additions:**

**A. New draw functions:**
Add a `draw<PartKind>()` function for each new visual. Follow the existing pattern (check if selected, draw body, draw selection ring).

**B. Port indicators during placement:**
During placing mode (`placingKind !== null`), query `PART_REGISTRY[placingKind].ports` and draw circles at each port's local offset position (offset from where cursor is hovering). This helps kids see where connections will form.

**C. Visual states:**
- Pistons: draw rod at `pistonExtensions[id] * stroke` extension
- Springs: draw compressed zigzag at `springCompressions[id]` ratio
- Winch ropes: draw line to `bodyPositions[hookId]` (not config position)
- Water zones: draw animated semi-transparent rectangle
- Sand: draw individual small circles at `bodyPositions[particleId]`

**Pitfall:** MachineCanvas is already 1300+ lines. When adding new draw functions, add them to a new section clearly marked `// ---- NEW PARTS ----` at the bottom of the draw loop. Do not intermix with existing draw code.

---

### 6. `src/components/InspectorPanel.tsx`
**Additions:**
- Schema-driven property editor: instead of hard-coding motor/gear fields, derive editable fields from `PART_REGISTRY[kind].defaultConfig`
- Special cases still needed: motor power toggle, piston direction toggle, silo gate toggle
- For sand: show particle count with warning if near limit

---

### 7. `src/components/PartPalette.tsx`
**Additions:**
- Group parts by `PART_REGISTRY[kind].category`
- Hide Tier 3+ parts behind a "More Parts" disclosure (keep the palette from overwhelming kids)
- Show `maxCount` warning when a limited part is already at max

---

### 8. `src/lib/jobs.ts`
**Additions:**
- New `ProjectSuccessCheck` evaluators for vehicle-moving, load-lifted, bucket-filled, etc.
- These follow the exact same pattern as existing checks (read `runtime.xxx`, return bool)

---

### 9. `src/lib/seed-data.ts`
**Additions:**
- New starter job definitions for Tier 2+ projects (crane, vehicle, excavator)
- These should NOT be added until the parts are proven working

**Critical:** Bump `CONTENT_EPOCH` to `relaunch-3-projects-v3` when adding new jobs (not when adding new parts — only when job definitions change).

---

## Bug Catalog and Mitigations

### Bug 1: Constraint Instability (HIGH RISK)
**Where:** Winch, rope, beam, piston, arm joints
**Root cause:** Matter.js constraint solver can oscillate when multiple constraints compete, or when constraint length changes too fast.
**Mitigation:**
- Always set `damping: 0.1` or higher on any constraint that will change length
- Cap length change per tick: `Math.min(deltaLength, 2)` px/tick
- If a body has more than 3 constraints, it will likely be unstable. Keep compound assemblies simple.
- If oscillation is detected (`speed > 20`), apply 50% velocity damping that tick as a safety valve

### Bug 2: Matter.js Body Tunneling (MEDIUM RISK)
**Where:** Fast-moving balls, rocks, cannon balls hitting thin walls/ramps
**Root cause:** At 60fps, a fast body can move more than its own diameter in one tick, skipping collision detection entirely.
**Mitigation:**
- Cap all dynamic body velocities: after each tick, `Matter.Body.setVelocity(body, { x: Math.max(-15, Math.min(15, v.x)), y: Math.max(-15, Math.min(15, v.y)) })`
- Set `slop: 0` (zero tolerance) on thin static bodies
- Set `timeScale` to 0.8 (slightly slow physics) to reduce tunneling probability

### Bug 3: Sand Performance (HIGH RISK)
**Where:** Sand material with many particles
**Root cause:** 30 particles × collision detection with all other bodies = O(n²) in particle count
**Mitigation:**
- Hard cap: 30 particles total across all sand primitives. Enforce at placement time.
- Assign sand particles to a dedicated `collisionFilter.category` so they only collide with static bodies and each other — not with gears, motors, etc. (reduces collision checks dramatically)
- If FPS drops below 30: log warning, begin removing oldest particles one per second until FPS recovers

### Bug 4: World Rebuild on Every Placement (CRITICAL — already fixed, preserve fix)
**Where:** `buildMatterWorld()` is called on every `persistDraft()`
**Root cause (already fixed):** Drag events were calling `persistDraft` 60×/sec. This is now fixed with `dragBufferRef`.
**Mitigation for new parts:** Any new interaction that triggers manifest updates (bucket dumps, piston position saved) must NOT save to the manifest on every tick. Only save to `RuntimeSnapshot`. Manifest persistence happens only on explicit user actions.

### Bug 5: Circular Dependency in Power Propagation (HIGH RISK)
**Where:** BFS through gear/pulley meshes
**Root cause:** If gear A drives B drives C drives A, the BFS infinite loops.
**Mitigation (already exists for gears):** Use a `visited: Set<string>` in the BFS. Verify this set is used in any new rotary chain propagation too.

### Bug 6: Multiple Motors Competing (MEDIUM RISK)
**Where:** Two motors both in range of the same gear
**Root cause:** Current code builds `motorGearMap` — last motor wins. With more parts, this is more likely.
**Mitigation:** When resolving rotary power: sum all connected motor RPMs (weighted by distance — closer motor contributes more). `effectiveRpm = motors.reduce((sum, m) => sum + m.rpm * (1 - dist/range), 0)`.

### Bug 7: Deletion of Connected Parts (MEDIUM RISK)
**Where:** Delete a motor that drives a piston; delete a node that a beam attaches to
**Root cause:** The world is rebuilt from manifest on every change, so deleted parts are automatically removed. HOWEVER: if a part that holds a constraint reference (rope's `fromId`, beam's `fromNodeId`) is deleted, the rope/beam part still references a dead ID.
**Mitigation:** In `buildMatterWorld()`, before creating each part's body, validate all `*Id` references exist in manifest. If any are missing, skip the part and add a `dangling-[id]` warning to the snapshot. The UI can then show a "broken connection" indicator.

### Bug 8: Bucket Tilt Ambiguity (MEDIUM RISK)
**Where:** When does a tilted bucket "dump"?
**Root cause:** If the arm swings and the bucket is at 85° → 95° → 85°, it dumps and immediately re-collects material. The tilt trigger fires too easily.
**Mitigation:** Hysteresis: bucket transitions `collecting → dumping` at > 100°, `dumping → collecting` at < 60°. Store `bucketState: 'collecting' | 'dumping'` per bucket in the physics closure.

### Bug 9: Rope Drawing Uses Stale Config Position (LOW RISK)
**Where:** `MachineCanvas.tsx` draws rope between config `fromId`/`toId` positions
**Root cause:** After physics runs, the bodies have moved — but config still has their original positions.
**Mitigation:** Draw rope between `bodyPositions[rope.config.fromId]` and `bodyPositions[rope.config.toId]`, not config positions. Same for any dynamic-body connections.

### Bug 10: Content Epoch / New Part Kinds in Old Saved Drafts (LOW RISK)
**Where:** User has a saved draft, then we add new part kinds. Old manifest has unknown kind.
**Root cause:** A draft saved with `kind: 'gear'` is fine forever. But if we RENAME a kind or REMOVE one, old drafts break.
**Mitigation:** Never rename or remove a PrimitiveKind. Only add. If a part kind is deprecated, keep the type but return early in `buildMatterWorld()` with a warning.

### Bug 11: Spring Zigzag Rendering at Extreme Compression (LOW RISK)
**Where:** Spring compressed to near-zero length
**Root cause:** Zigzag renderer divides length by number of peaks — at zero length, division by zero.
**Mitigation:** `const drawLength = Math.max(restLength * 0.1, actualLength)` — never draw a spring shorter than 10% of rest length.

### Bug 12: Water Zone + Fast Body = No Buoyancy (MEDIUM RISK)
**Where:** Ball dropped from height into water zone
**Root cause:** If the ball passes completely through the water zone in one tick (tunneling + zone is thin), no buoyancy is ever applied.
**Mitigation:** Make water zones at least 60px tall (the canvas velocity cap of 15px/tick × 4 ticks to cross). Enforce minimum height in `WaterConfig`.

### Bug 13: PartPalette Overwhelm (UX BUG)
**Where:** Showing 45 parts to a kid
**Root cause:** More than ~8 options in a palette and kids freeze.
**Mitigation:** Show only parts relevant to the current project step (guided mode). In free-build mode, paginate or categorize behind tabs. The `allowedPartKinds` per step already exists — extend it to cover new parts.

### Bug 14: Inspector Panel Schema Drift (LOW RISK)
**Where:** New part added to physics engine but not to InspectorPanel
**Root cause:** InspectorPanel has hard-coded sections for motor, gear, conveyor, hopper. New parts get no inspector UI.
**Mitigation:** Build schema-driven inspector that reads from `PART_REGISTRY[kind].defaultConfig` to generate fields automatically. Fall back to raw JSON display for unknown fields (useful during development).

---

## Implementation Phases

### Phase 1 — Foundation (do before ANY new parts)
1. Add new `PrimitiveKind` values to `types.ts` (type-only changes, no logic)
2. Create `part-registry.ts` with port declarations for ALL 45 parts (data only, no physics)
3. Extend `RuntimeSnapshot` with new empty-default fields
4. Add schema-driven fallback to `InspectorPanel.tsx`
5. Run `tsc --noEmit` — must be zero errors

### Phase 2 — Tier 1 Parts (unblock most gameplay)
6. `ramp`, `wall`, `platform` — all are just static bodies, trivial to add
7. `ball` — dynamic circle, same as cargo-block
8. `wheel` + `axle` — these unlock vehicle motion
9. Run all 3 existing starter projects — verify NOTHING broke

### Phase 3 — Tier 2 Machine Parts
10. `winch` + `rope` + `hook` — these already exist in types, complete the physics
11. `piston` — linear actuator
12. `crane-arm` + `hydraulic-arm` — arm pivot bodies
13. `bucket` + `counterweight` — bucket dump logic
14. `pulley` — similar to gear, add to BFS
15. Run all 3 existing starter projects again — verify NOTHING broke

### Phase 4 — Tier 3 Transmission
16. `rack`, `cam`, `cam-follower` — motion converters
17. `flywheel`, `gearbox`, `bevel-gear` — transmission variants
18. `chassis`, `drive-wheel` — vehicle body

### Phase 5 — Materials
19. `rock` — trivial (heavy cargo-block variant)
20. `sand` — implement particle system with hard cap
21. `water` — implement force zone

### Phase 6 — Structural
22. `beam` + `node` (complete existing stubs)
23. `hinge`, `chute`, `funnel`, `silo-bin`, `tunnel`

### Phase 7 — New Projects
24. Only after all parts pass 3+ sessions of play testing
25. Add new `SiteJobDefinition` entries to `seed-data.ts`
26. Bump `CONTENT_EPOCH` to `relaunch-3-projects-v3`

---

## "Do Not Break" Checklist

Run these after every implementation phase:

- [ ] Motor → Gear proximity drive still works (BFS, counter-rotate)
- [ ] Gear → Gear meshing still works (ratio propagation)
- [ ] Conveyor anti-gravity force still keeps cargo on belt
- [ ] Hopper `collectedCargoIds` is still monotonically increasing
- [ ] `dragBufferRef` pattern still prevents per-frame world rebuilds
- [ ] All 3 starter projects complete normally (step checks fire, celebration toast appears)
- [ ] Delete/Backspace still removes selected part
- [ ] Motor toggle still works (click on canvas + InspectorPanel button)
- [ ] `npx tsc --noEmit` produces zero errors
- [ ] `npm run build` produces no errors (chunk size warning OK)

---

## Testing Checklist for New Parts

For each new part, verify:
- [ ] Part appears in PartPalette under correct category
- [ ] Part can be placed on canvas
- [ ] Part appears in InspectorPanel with editable properties
- [ ] Part can be deleted (Delete/Backspace)
- [ ] Part can be dragged (one world rebuild on release)
- [ ] Part's physics interaction works with at least one other part
- [ ] Part deletion doesn't crash the physics engine (missing body guard)
- [ ] Adding the part doesn't break any of the 3 existing projects

---

## Key Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/types.ts` | All TypeScript types | ~450 |
| `src/lib/physics-engine.ts` | Matter.js physics | ~723 |
| `src/lib/simulation.ts` | RuntimeSnapshot, scripted path | ~600 |
| `src/lib/jobs.ts` | Step evaluation | ~374 |
| `src/lib/seed-data.ts` | DB seed / starter jobs | ~400 |
| `src/pages/BuildPage.tsx` | Main builder UI | ~1584 |
| `src/components/MachineCanvas.tsx` | p5.js rendering + interaction | ~1316 |
| `src/components/InspectorPanel.tsx` | Part property editor | ~200 |
| `src/components/PartPalette.tsx` | Part picker | ~150 |
| `src/lib/part-registry.ts` | NEW — port declarations | 0 (create) |

---

*Plan written March 2026. Begin implementation only after 3 starter projects have been validated through multiple real play sessions.*
