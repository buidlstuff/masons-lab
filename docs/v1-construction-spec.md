# V1 Construction Spec

This document turns the construction-sandbox idea into a concrete v1 product.

It answers four questions:

1. What are the 25-40 initial parts?
2. What are the first 10 starter blueprints?
3. What are the first 12 site jobs?
4. How should save, remix, and the home screen work?

This spec is intentionally biased toward:

- clear progression
- reliable generation
- visible combos
- reusable machine modules
- kid-friendly discovery

It is intentionally biased away from:

- full simulation realism
- giant part lists
- hidden systems
- open-ended complexity too early

## Product Pillars

The first version should feel like this:

- Mason opens his yard and already has cool machines.
- He can make something work fast.
- He can swap modules and see what changes.
- He can solve jobs with multiple possible machine setups.
- His yard grows into a personal machine collection.

The first version should not feel like:

- a code playground
- a CAD tool
- a spreadsheet of machine stats
- a giant menu of 200 parts

## 1. Initial Part Palette

V1 should expose **32 player-facing parts**.

That is enough to feel rich, but still small enough for:

- the AI to use reliably
- the UI to teach clearly
- the runtime to validate aggressively
- Mason to recognize recurring patterns

### V1 Part Design Rules

1. Every part must be useful in at least 2 recipe families.
2. Every part must combine with at least 2 other families.
3. Every part must have visible output when activated.
4. Every part must have 1-3 editable parameters max.
5. Every part must have a short one-sentence explanation in the UI.

### V1 Part Groups

#### Structure Parts

| Part | Purpose | Player-facing knobs |
| --- | --- | --- |
| `Node` | anchor point for machine geometry | none |
| `Beam` | basic structural member | stiffness preset |
| `Frame` | grouped support body | size preset |
| `Plate` | rigid body or surface | width, height |
| `Support` | stand, leg, or base | height |
| `Hinge` | rotating joint | angle limit preset |

Count so far: 6

#### Motion And Drivetrain Parts

| Part | Purpose | Player-facing knobs |
| --- | --- | --- |
| `Wheel` | rolling support or driven wheel | size, traction |
| `Axle` | shared rotation support | none |
| `Track Base` | simplified tracked movement | speed, traction |
| `Motor` | primary power source | rpm, torque preset |
| `Gear` | ratio-changing rotary transfer | teeth count |
| `Gearbox` | bundled ratio module | ratio preset |
| `Shaft` | connects rotating systems | none |
| `Brake` | slows or locks movement | brake strength |

Count so far: 14

#### Actuation Parts

| Part | Purpose | Player-facing knobs |
| --- | --- | --- |
| `Piston` | hydraulic-lite extension and retraction | length, force |
| `Winch` | hoists and lowers lines | speed |
| `Rope` | hanging and pulling connection | length |
| `Pulley` | redirects or multiplies force | fixed / moving |
| `Boom` | arm segment for lifting or digging | length |
| `Bucket` | scoops and dumps material | size |
| `Fork` | lifts pallets and blocks | width |
| `Hook` | grabs hanging loads | none |
| `Turntable` | rotating machine base | rotation speed |

Count so far: 23

#### Transport Parts

| Part | Purpose | Player-facing knobs |
| --- | --- | --- |
| `Rail Segment` | guide path for rail vehicles | straight / curve |
| `Rail Switch` | route selector | branch choice |
| `Locomotive` | powered rail mover | speed |
| `Wagon` | cargo carrier | capacity preset |
| `Conveyor` | moves materials continuously | speed, direction |
| `Chute` | passive gravity-fed transport | slope preset |

Count so far: 29

#### Flow And Processing Parts

| Part | Purpose | Player-facing knobs |
| --- | --- | --- |
| `Pipe` | connects flow systems | none |
| `Valve` | opens or closes pipe flow | open state |
| `Pump` | pushes slurry or fluid-like material | flow rate |
| `Tank` | stores fluid-like material | capacity preset |
| `Hopper` | stores and releases granular material | release rate |

Count so far: 34

#### Materials And Controls

These should exist in the system, but only **some** need to show up in the visible parts drawer.

Visible in drawer:

| Part | Purpose | Player-facing knobs |
| --- | --- | --- |
| `Cargo Block` | liftable rigid load | weight preset |
| `Material Pile` | soil, gravel, ore source | quantity |
| `Switch` | simple control input | on/off |
| `Sensor` | simple trigger | trigger mode |

Count so far: 38

### Recommended Public Part Count

Even though 38 parts are defined above, I would only expose **30-32 at launch**.

Hidden or recipe-only at launch:

- `Sensor`
- `Tank`
- `Brake`
- `Chute`
- `Support`
- `Frame`

That gets the visible launch palette down into the sweet spot.

### Launch Drawer Organization

The parts menu should be grouped like this:

- `Frames`
  - Node
  - Beam
  - Plate
  - Hinge
- `Motion`
  - Wheel
  - Axle
  - Track Base
  - Turntable
- `Power`
  - Motor
  - Gear
  - Gearbox
  - Shaft
- `Tools`
  - Piston
  - Winch
  - Rope
  - Pulley
  - Boom
  - Bucket
  - Fork
  - Hook
- `Transport`
  - Rail Segment
  - Rail Switch
  - Locomotive
  - Wagon
  - Conveyor
  - Chute
- `Flow`
  - Pipe
  - Valve
  - Pump
  - Hopper
- `Stuff`
  - Cargo Block
  - Material Pile

### Parts To Explicitly Leave Out In V1

Do not expose these at launch:

- belts
- chains
- all-terrain tires vs tire compounds
- drilling heads
- tunnel boring machines
- asphalt paving systems
- cold planer mechanics
- concrete curing
- utility vehicles
- generators as visible electric systems

Some of these can still exist as recipe internals later, but not as first-drawer parts.

## 2. First 10 Starter Blueprints

Blueprints are what make this feel like a game instead of a one-off generator.

Mason should quickly learn:

- "I can reuse my good machine parts"
- "I can stick my crane arm onto a different base"
- "I can upgrade a drivetrain"

V1 should ship with **10 starter blueprints**.

### Blueprint 1: `tracked-chassis-mk1`

Category: `chassis`

Contains:

- track base
- frame
- turntable mount

Use cases:

- dozer-lite
- excavator-lite
- mobile crane

### Blueprint 2: `wheeled-chassis-mk1`

Category: `chassis`

Contains:

- 4 wheels
- axle layout
- motor mount

Use cases:

- forklift-lite
- site hauler
- mobile pump cart

### Blueprint 3: `rail-cart-mk1`

Category: `transport`

Contains:

- wagon body
- basic bogie layout

Use cases:

- cargo hauling
- switching yard jobs
- hopper loading jobs

### Blueprint 4: `gear-drive-mk1`

Category: `drivetrain`

Contains:

- motor
- 2 gears
- output shaft

Use cases:

- conveyor drive
- winch drive
- machine ratio demos

### Blueprint 5: `winch-hoist-mk1`

Category: `tool-head`

Contains:

- winch
- rope
- hook

Use cases:

- crane
- lift station
- cargo retrieval challenge

### Blueprint 6: `bucket-arm-mk1`

Category: `tool-head`

Contains:

- boom
- hinge
- bucket
- piston

Use cases:

- loader-lite
- excavator-lite
- material transfer machine

### Blueprint 7: `fork-mast-mk1`

Category: `tool-head`

Contains:

- fork
- vertical support
- lift actuator

Use cases:

- forklift-lite
- pallet stacker
- cargo sorter

### Blueprint 8: `conveyor-section-mk1`

Category: `transport`

Contains:

- conveyor
- support frame

Use cases:

- loading line
- sorting line
- hopper feed line

### Blueprint 9: `hopper-feeder-mk1`

Category: `flow-system`

Contains:

- hopper
- release gate
- output mouth

Use cases:

- wagon loading
- conveyor feeding
- quantity control jobs

### Blueprint 10: `pump-station-mk1`

Category: `flow-system`

Contains:

- pump
- valve
- pipe pair

Use cases:

- slurry transfer
- site dewatering-lite
- process routing

### Starter Blueprint Rules

Every starter blueprint should:

1. solve one obvious problem
2. connect cleanly to at least 2 other blueprints
3. have 2-4 ports max
4. have a recognizable silhouette
5. be useful even outside its original recipe

## 3. First 12 Site Jobs

Site jobs are how the yard becomes a game.

Without jobs, Mason builds toys.
With jobs, Mason solves engineering problems.

V1 should ship with **12 jobs** across four difficulty bands.

### Tier 1: First Day On Site

These should be solvable in 2-5 minutes.

#### Job 1: `load-the-hopper`

Goal:

- move 8 cargo blocks into a hopper

Teaches:

- transport direction
- timing

Good solutions:

- manual conveyor
- crane and drop

#### Job 2: `gear-down-the-motor`

Goal:

- reduce output speed while increasing lifting ability

Teaches:

- gear ratio
- speed vs force

#### Job 3: `deliver-the-wagon`

Goal:

- send the wagon to the correct bay using a rail switch

Teaches:

- routing
- control timing

### Tier 2: Machine Operator

These should take 5-10 minutes.

#### Job 4: `stack-the-pallets`

Goal:

- lift and place two pallets on marked platforms

Teaches:

- balance
- fork positioning

#### Job 5: `fill-one-wagon-only`

Goal:

- load exactly one wagon from a hopper without spilling too much

Teaches:

- controlled release
- batching

#### Job 6: `pump-the-slurry`

Goal:

- move slurry from tank A to tank B

Teaches:

- flow control
- valve logic

### Tier 3: Yard Engineer

These should take 10-20 minutes.

#### Job 7: `build-a-mobile-crane`

Goal:

- mount a saved winch or crane arm onto a moving chassis

Teaches:

- blueprint reuse
- module composition

#### Job 8: `dig-load-haul`

Goal:

- move material from pit to wagon to dump zone

Teaches:

- multi-step logistics
- machine sequencing

#### Job 9: `sort-the-yard`

Goal:

- route two material types to two destinations

Teaches:

- sensors
- branching transport

### Tier 4: Site Boss

These should take 20+ minutes or multiple attempts.

#### Job 10: `build-the-frame`

Goal:

- deliver and place steel blocks onto a simple tower frame

Teaches:

- transport plus lifting combo

#### Job 11: `run-the-loading-yard`

Goal:

- keep a hopper, conveyor, wagon, and switch yard running for a target throughput

Teaches:

- bottlenecks
- throughput tuning

#### Job 12: `kitbash-a-new-machine`

Goal:

- combine at least 2 saved blueprints into a new useful machine and complete a delivery job

Teaches:

- creative recombination
- machine identity

### Site Job Structure

Each job should include:

- title
- one-sentence objective
- required success metric
- recommended starting machine
- 1-3 hint cards
- possible solution paths
- one “engineering idea” sentence

### Site Job Metadata Shape

```ts
export interface SiteJobDefinition {
  jobId: string;
  tier: 1 | 2 | 3 | 4;
  title: string;
  summary: string;
  teachingGoal: string;
  startingRecipeIds: string[];
  recommendedBlueprintIds: string[];
  allowedFamilies: string[];
  goalType:
    | 'move-load'
    | 'lift-load'
    | 'fill-wagon'
    | 'deliver-material'
    | 'route-correctly'
    | 'maintain-throughput'
    | 'complete-site-job';
  hints: string[];
}
```

## 4. Save, Remix, And Home Screen Loop

This is where the product becomes personal.

The home screen is not just a save gallery.

It is Mason's machine yard.

## Home Screen Structure

The home screen should have five areas.

### Area 1: `Featured Machines`

Purpose:

- preload delight
- show Uncle Kyle-built starters

At launch, ship with:

- Gear Ratio Lab
- Conveyor Loader
- Winch Crane
- Rail Cart Loop

### Area 2: `My Machines`

Purpose:

- saved full experiments

Card should show:

- thumbnail
- machine name
- tags
- last played
- buttons for `Play`, `Remix`, `Duplicate`

### Area 3: `My Blueprints`

Purpose:

- saved reusable modules

Card should show:

- silhouette thumbnail
- blueprint category
- ports
- buttons for `Use In Build`, `Inspect`, `Duplicate`

### Area 4: `Today's Job Board`

Purpose:

- make the yard feel active

Shows:

- 3 surfaced site jobs
- one recommended machine or blueprint

### Area 5: `Lab Notebook`

Purpose:

- capture reflection without friction

Shows:

- recent builds
- what he learned
- what to try next

## Save Flow

When Mason finishes something, the app should offer three save choices:

### Save Option A: `Save Machine`

Use when:

- the whole experiment is worth keeping

Stores:

- full manifest
- thumbnail
- lab notes

### Save Option B: `Save As Blueprint`

Use when:

- a subassembly is the valuable part

Examples:

- tracked chassis
- bucket arm
- pump station

Stores:

- blueprint fragment
- ports
- module thumbnail

### Save Option C: `Save Both`

Use when:

- the machine and one of its key modules are both useful

This should probably be the recommended option most of the time.

## Remix Flow

The remix loop should be frictionless.

From any machine card:

- `Remix`
  - loads the experiment into the build screen
  - keeps the original untouched
  - creates a new draft

From any blueprint card:

- `Use In Build`
  - opens build screen
  - preloads that blueprint in the assembly tray
  - suggests compatible recipes or chassis

## Build Screen Loop

The build screen should support four modes of action:

### Mode 1: `Create`

Examples:

- "Make a train that carries gravel."
- "Build a crane that lifts steel blocks."

### Mode 2: `Edit`

Examples:

- "Make the conveyor faster."
- "Add a second wagon."

### Mode 3: `Compose`

Examples:

- "Put my crane arm on the tracked base."
- "Connect the hopper feeder to the wagon line."

### Mode 4: `Explain`

Examples:

- "Why does this gear make it slower?"
- "What does the hopper do?"

## Thumbnail Rules

Thumbnails matter because the home screen is a portfolio.

Every saved machine should produce:

- one clean hero angle
- strong silhouette
- visible motion or machine intent

Blueprint thumbnails should:

- focus on the module itself
- show ports or connection highlights
- look distinct from full machine saves

## Naming Rules

The app should help Mason name things well.

Suggested save names:

- `Gravel Loader Mk1`
- `Tracked Crane Base`
- `Fast Conveyor Test`
- `Switch Yard Wagon`
- `Bucket Arm Long Reach`

The naming pattern should quietly teach iteration:

- `Mk1`
- `Mk2`
- `Lite`
- `Long Reach`
- `Heavy Lift`

## Progression Loop

The loop should feel like:

1. play a starter machine
2. solve a small job
3. save a machine
4. extract a blueprint
5. reuse the blueprint in a new job
6. discover a combo
7. build a more complex yard

That is the actual progression curve.

## V1 Launch Recommendation

If you want the simplest strong launch:

- visible launch parts: 30-32
- starter blueprints: 10
- starter recipes: 10-12
- site jobs: 12
- featured machines: 4

That is enough to feel like a real product and not a prototype.

## Product Stance

The first version should not try to be an infinite sandbox all at once.

It should try to be:

- a machine toy
- a problem-solving game
- a blueprint collector
- a combo discovery sandbox

If it nails those four things, it will feel much bigger than it actually is.
