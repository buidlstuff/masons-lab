# Primitive Catalog

This document defines the smallest reliable set of building blocks for Mason's Engineering Lab.

The product direction is now explicitly:

- construction sandbox
- machine playground
- system-combo discovery game

The point is not "generate arbitrary engineering demos."

The point is:

1. Mason imagines a machine, site, or construction problem.
2. The AI maps that request onto known-good machine primitives.
3. The lab renders something playable immediately.
4. Mason tweaks the machine with words and controls.
5. Mason saves the whole machine or one of its modules for reuse later.

If a concept cannot be expressed through this primitive catalog, it should not ship in production mode yet.

## Product Fantasy

Mason is standing in his own engineering yard.

He has:

- machine parts
- structures
- rails
- pipes
- materials
- powered modules
- simple control systems

He discovers that:

- a motor can power a conveyor
- a conveyor can feed a hopper
- a hopper can load a wagon
- a winch can lift a bucket
- a gearbox can trade speed for force
- a generator can power pumps and yard equipment

That discovery loop is the game.

## Core Stance

This is not a realistic construction simulator.

It is a toy-accurate engineering sandbox.

Keep:

- visible force
- visible motion
- visible load transfer
- visible routing
- visible control
- visible tradeoffs

Simplify or fake:

- full hydraulics
- real fluid dynamics
- real soil mechanics
- real structural engineering
- real engine combustion
- real electrical analysis
- fleet pathfinding

## Design Rules

1. Every primitive must be visually legible within 3 seconds.
2. Every primitive must have obvious cause and effect.
3. Every primitive must expose only a few safe parameters.
4. Every primitive must degrade safely when given bad values.
5. Every primitive must be serializable to JSON.
6. Every primitive must be editable by AI without rewriting the whole machine.
7. Every primitive must be explainable in plain English.
8. Every primitive must work inside a single-canvas runtime.
9. Every primitive must be testable with deterministic seeds.
10. If a primitive regularly causes model failures, simplify or remove it.
11. If a primitive teaches the wrong mental model, rename or exclude it.

## Primitive Layers

| Layer | Purpose | Examples |
| --- | --- | --- |
| World | Sets the yard, terrain, and camera | stage, camera2d, terrain |
| Structure | Static or semi-static machine geometry | node, beam, frame, plate |
| Motion | Rolling or guided movement | wheel, axle, track, slider |
| Power | Rotational or machine power transfer | motor, gear, gearbox, shaft |
| Actuation | Converts power into useful movement | piston, winch, rope, bucket |
| Transport | Moves materials around the site | rail, wagon, conveyor, chute |
| Flow | Moves fluid-like or granular material | pipe, valve, pump, hopper |
| Materials | Stuff to move, dump, stack, or sort | soil, gravel, cargo, blocks |
| Controls | Gives Mason agency | slider, toggle, button, switch |
| Instrumentation | Explains what the machine is doing | readout, gauge, warning, graph |
| Goals | Makes the sandbox feel like a game | route goal, throughput goal, lift goal |
| Blueprints | Reusable modules | tracked chassis, crane arm, hopper feeder |

## V1 Runtime Stance

Production mode should support:

- single 2D canvas
- `p5.js` rendering
- optional `Matter.js` for rigid-body behavior
- one control panel
- one HUD / readout layer
- one experiment at a time
- deterministic reset
- AI edits expressed as schema changes
- reusable modules and subassemblies

Production mode should not support:

- arbitrary HTML generation
- arbitrary CSS generation
- arbitrary package installs
- network requests from generated experiments
- user-supplied external scripts
- freeform DOM APIs
- multi-page apps
- 3D
- audio synthesis
- realistic hydraulics
- realistic fluid simulation
- realistic excavation
- multiplayer

## Primitive Status Levels

| Status | Meaning |
| --- | --- |
| `core` | Safe enough for production generation |
| `guided` | Allowed only when the AI is following a recipe |
| `experimental` | Admin-only or feature-flagged |
| `excluded` | Not in scope for v1 production |

## Production Families

| Family | Meaning |
| --- | --- |
| `structures` | frames, supports, towers, gantries |
| `earthworks` | ramps, buckets, loaders, dozers-lite |
| `lifting` | cranes, booms, winches, forks, hooks |
| `transport` | rails, trains, carts, conveyors, chutes |
| `power-and-drivetrain` | motors, gears, shafts, wheels, tracks |
| `flow-and-processing` | pipes, pumps, valves, tanks, hoppers |
| `machine-combos` | systems that combine two or more families |

## World Primitives

### `stage`

Status: `core`

Purpose:
- Defines the canvas, background, bounds, and frame settings.

Key config:
- `width`
- `height`
- `background`
- `grid`
- `boundaryMode`
- `fpsCap`

Safe defaults:
- `1280 x 720`
- dark engineering-yard background
- engineering grid
- `contain`
- `60 fps`

### `camera2d`

Status: `core`

Purpose:
- Adds zoom and pan for larger machines and track layouts.

Key config:
- `zoom`
- `minZoom`
- `maxZoom`
- `panX`
- `panY`
- `followTargetId`

### `terrain`

Status: `guided`

Purpose:
- Defines floor profile, dig zones, slopes, and work pads.

Key config:
- `preset`
- `diggableZones`
- `materialType`

Rule:
- Terrain should be preset-driven or validator-clamped.

## Structure Primitives

### `node`

Status: `core`

Purpose:
- Anchor point for frames, booms, bridges, supports, and linkages.

### `beam`

Status: `core`

Purpose:
- Connects two nodes as a structural member.

Key config:
- `fromNodeId`
- `toNodeId`
- `stiffness`
- `showStressColor`

Rule:
- Stress behavior is approximate and visual, not a true solver.

### `frame`

Status: `core`

Purpose:
- Named group of nodes and beams that forms a chassis, tower, or support frame.

### `plate`

Status: `guided`

Purpose:
- Rigid rectangular surface for decks, blades, bodies, and forks.

### `support`

Status: `guided`

Purpose:
- Static stand, leg, base, or outrigger-like support.

### `hinge`

Status: `guided`

Purpose:
- Rotational joint for booms, arms, and swinging parts.

## Motion Primitives

### `wheel`

Status: `core`

Purpose:
- Rolling support, cart wheel, or powered wheel.

Key config:
- `x`, `y`
- `radius`
- `driven`
- `traction`

### `axle`

Status: `core`

Purpose:
- Shared rotational support for wheels or gears.

### `track`

Status: `guided`

Purpose:
- Simplified tracked drive for dozer and excavator bases.

Key config:
- `x`, `y`
- `length`
- `speed`
- `traction`

Rule:
- Use a movement recipe rather than realistic track physics.

### `slider`

Status: `guided`

Purpose:
- Linear guide for machine parts moving along a constrained path.

### `spring`

Status: `guided`

Purpose:
- Elastic link for suspension, recoil, and buffering.

## Power Primitives

### `motor`

Status: `core`

Purpose:
- Primary power source for powered machines.

Key config:
- `rpm`
- `torque`
- `reversible`
- `powerState`

### `gear`

Status: `core`

Purpose:
- Transfers rotation with a visible ratio change.

Key config:
- `teeth`
- `rpm`
- `input`
- `color`

### `gearbox`

Status: `guided`

Purpose:
- Named ratio-changing module built from gears.

### `shaft`

Status: `guided`

Purpose:
- Carries rotational power between modules.

### `belt`

Status: `guided`

Purpose:
- Flexible power transfer between pulleys.

### `chain`

Status: `guided`

Purpose:
- Explicit mechanical power transfer between machine parts.

### `brake`

Status: `guided`

Purpose:
- Slows or locks motion.

### `generator`

Status: `guided`

Purpose:
- Provides simplified machine power to pumps, conveyors, or yard systems.

Rule:
- Treated as a power source, not a realistic electrical generator.

## Actuation Primitives

### `piston`

Status: `core`

Purpose:
- Simplified hydraulic-like or linear actuator behavior.

Key config:
- `fromId`
- `toId`
- `minLength`
- `maxLength`
- `force`

### `winch`

Status: `core`

Purpose:
- Winds and unwinds a cable or rope.

### `rope`

Status: `core`

Purpose:
- Distance-limited connection used for hoisting and hanging loads.

### `pulley`

Status: `core`

Purpose:
- Redirects or multiplies winch force in simplified form.

### `boom`

Status: `guided`

Purpose:
- Arm-like lifting or digging member.

Rule:
- Use as a named assembly built from hinges, beams, and pistons.

### `bucket`

Status: `guided`

Purpose:
- Loader or excavator bucket with simplified scoop behavior.

### `fork`

Status: `guided`

Purpose:
- Lifts pallets or cargo blocks.

### `hook`

Status: `guided`

Purpose:
- Suspends or grabs loads in crane-style experiments.

### `turntable`

Status: `guided`

Purpose:
- Rotating base for cranes and excavator-like machines.

## Transport Primitives

### `rail-segment`

Status: `core`

Purpose:
- Piece of track for trains, carts, and site logistics.

### `rail-switch`

Status: `guided`

Purpose:
- Redirects a train or cart between paths.

### `bogie`

Status: `guided`

Purpose:
- Wheelset assembly for rolling stock.

### `locomotive`

Status: `guided`

Purpose:
- Powered rail vehicle that pulls wagons.

### `wagon`

Status: `guided`

Purpose:
- Carries cargo or materials on rails.

### `conveyor`

Status: `core`

Purpose:
- Moves material or cargo continuously.

Key config:
- `path`
- `speed`
- `direction`
- `acceptsMaterialTypes`

### `chute`

Status: `guided`

Purpose:
- Passive sloped path for moving loose material.

### `coupler`

Status: `guided`

Purpose:
- Connects wagons and locomotives.

## Flow And Processing Primitives

### `pipe`

Status: `core`

Purpose:
- Carries simplified fluid or slurry between components.

### `valve`

Status: `core`

Purpose:
- Opens or closes a flow path.

### `pump`

Status: `core`

Purpose:
- Moves material through pipes.

### `tank`

Status: `guided`

Purpose:
- Stores fluid-like material.

### `hopper`

Status: `core`

Purpose:
- Stores and releases granular material into conveyors, wagons, or mixers.

### `mixer`

Status: `guided`

Purpose:
- Blends materials in simplified processing or concrete-lite recipes.

## Material Primitives

### `material-pile`

Status: `core`

Purpose:
- Site stockpile for soil, gravel, ore, or debris.

### `cargo-block`

Status: `core`

Purpose:
- Rigid load for cranes, conveyors, wagons, and forks.

### `pallet`

Status: `guided`

Purpose:
- Forklift-friendly grouped cargo.

### `soil-chunk`

Status: `guided`

Purpose:
- Simplified diggable and movable earth piece.

### `concrete-lite-batch`

Status: `experimental`

Purpose:
- Symbolic poured material for processing demos.

## Control Primitives

### `slider`

Status: `core`

Purpose:
- Adjusts numeric machine parameters.

Allowed binds:
- motor rpm
- winch speed
- piston extension
- conveyor speed
- pump rate
- load amount

### `toggle`

Status: `core`

Purpose:
- Turns systems on or off.

### `button`

Status: `core`

Purpose:
- Triggers reset, spawn, route-switch, dump, scoop, or pause.

### `switch`

Status: `core`

Purpose:
- Manual machine control element.

### `sensor-lite`

Status: `guided`

Purpose:
- Very simple detector for presence, fill level, or contact.

Rule:
- Use for gameplay logic, not industrial automation realism.

## Instrumentation Primitives

### `label`

Status: `core`

Purpose:
- Names machine parts and systems.

### `readout`

Status: `core`

Purpose:
- Displays machine values such as rpm, hopper fill, throughput, load, or route state.

### `gauge`

Status: `guided`

Purpose:
- Displays value against a safe range.

### `warning-zone`

Status: `guided`

Purpose:
- Shows safe, warning, and danger states.

### `mini-graph`

Status: `guided`

Purpose:
- Shows time history for load, flow, or throughput.

## Goal Primitives

### `target-zone`

Status: `core`

Purpose:
- Move a load to the right place.

### `throughput-goal`

Status: `core`

Purpose:
- Deliver a certain amount of material in a certain time.

### `lift-goal`

Status: `core`

Purpose:
- Lift or place a load successfully.

### `route-goal`

Status: `guided`

Purpose:
- Send cargo to the correct destination via rails, conveyors, or valves.

### `efficiency-goal`

Status: `guided`

Purpose:
- Complete a task with fewer machines, less energy, or less time.

## Blueprint Categories

Blueprints are not separate runtime primitives. They are reusable assemblies built from primitives plus approved behaviors.

Production mode should support these blueprint categories:

| Blueprint Type | Examples |
| --- | --- |
| chassis | tracked base, wheeled frame, rail cart |
| drivetrain | gearbox, powered axle, chain drive |
| tool-head | bucket arm, crane hook, forklift mast |
| transport | conveyor section, hopper feeder, wagon |
| flow-system | pump station, valve gate, tank cluster |
| control-panel | switch bank, sensor gate |
| structure | gantry frame, support tower |

## Approved V1 Machine Recipes

### Starter Recipes

- Gear Ratio Lab
  - motor + gears + readouts
- Conveyor Loader
  - conveyor + hopper + cargo blocks
- Rail Cart Loop
  - rail segments + cart + switch
- Winch Crane
  - frame + winch + rope + hook + load
- Pump Line
  - tank + pipe + valve + pump

### Mid-Tier Recipes

- Forklift Lite
  - wheeled base + mast + forks + pallet
- Tracked Loader Lite
  - tracked base + boom + bucket + soil chunks
- Tower Crane Lite
  - frame + turntable + boom + winch + hook
- Hopper To Wagon
  - hopper + release gate + wagon + siding
- Generator Yard
  - generator + powered conveyor + pump + indicators

### Combo Recipes

- Dig, Load, Haul
  - loader or excavator-lite + wagon or cart
- Sort, Move, Dump
  - conveyor network + gates + bins
- Mobile Crane Builder
  - saved chassis blueprint + saved crane arm blueprint
- Rail Yard Loader
  - hopper + wagons + switches + destinations

## Things We Intentionally Leave Out

These are explicit non-goals for v1:

- freeform website generation
- arbitrary JavaScript execution from the model
- realistic fluid simulation
- realistic hydraulic circuits
- realistic soil deformation
- fully automated fleets
- multiplayer construction worlds
- custom scripting by Mason

## Wiggle Room

The AI is allowed to vary:

- machine themes
- machine scale
- color palette
- object counts
- route layouts
- challenge goals
- visible readouts
- tutorial language
- recipe combinations

The AI is not allowed to vary:

- runtime backend
- schema contract
- primitive APIs
- save envelope
- validation rules
- banned browser APIs
- package graph

## Primitive Acceptance Checklist

A primitive can enter production generation only if all of these are true:

1. It serializes cleanly into the experiment schema.
2. It renders deterministically from a seed.
3. It survives reset without leaking state.
4. It has a safe default visual.
5. It appears in at least one starter machine recipe.
6. It passes the model bakeoff with at least three production-grade models.
7. It can be explained to Mason in one or two sentences.
8. It combines meaningfully with at least two other primitive families.

## Product Stance

The safest way to make this feel magical is not to expand the primitive catalog endlessly.

The safest way is:

1. keep primitives few
2. keep recipes rich
3. keep controls playful
4. keep machine combos surprising
5. keep explanations honest
6. keep the AI inside the rails
