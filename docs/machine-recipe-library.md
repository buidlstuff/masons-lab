# Machine Recipe Library

This document defines the machine recipes the AI should prefer when creating experiments.

The point of recipes is to preserve sandbox magic while keeping the system reliable.

A recipe is:

- a proven machine pattern
- built from approved primitives
- connected by approved behaviors
- packaged so the AI can vary it without breaking the runtime

Recipes are how the product feels broad without actually being unconstrained.

## Recipe Philosophy

The AI should not invent machines from first principles every time.

It should usually do one of these:

1. instantiate a starter recipe
2. vary a starter recipe
3. combine two recipes
4. mount a saved blueprint onto a compatible recipe

## Recipe Levels

| Level | Meaning |
| --- | --- |
| starter | first-visit, obvious interaction, works immediately |
| builder | introduces reusable machine logic |
| combo | combines two systems |
| yard-master | larger site logistics challenge |

## Starter Recipes

### `gear-train-lab`

Level: `starter`

Concept:
- speed vs force

Uses:
- motor
- gears
- readouts

Suggested controls:
- input rpm
- gear tooth counts

Suggested goal:
- hit a target output rpm range

### `conveyor-loader`

Level: `starter`

Concept:
- transport and throughput

Uses:
- conveyor
- hopper
- cargo blocks or gravel-lite

Suggested controls:
- conveyor speed
- hopper release rate

Suggested goal:
- move 10 pieces into the output zone

### `rail-cart-loop`

Level: `starter`

Concept:
- guided transport

Uses:
- rail segments
- locomotive or cart
- wagon
- route goal

Suggested controls:
- train speed
- switch route

Suggested goal:
- deliver the wagon to the right station

### `winch-crane`

Level: `starter`

Concept:
- lifting and placement

Uses:
- frame
- winch
- rope
- hook
- cargo block

Suggested controls:
- winch speed
- boom angle preset

Suggested goal:
- place a load on a target platform

### `pump-line`

Level: `starter`

Concept:
- gated flow

Uses:
- tank
- pipe
- valve
- pump

Suggested controls:
- pump rate
- valve open or closed

Suggested goal:
- fill the destination tank to the target line

## Builder Recipes

### `tracked-loader-lite`

Level: `builder`

Concept:
- chassis + actuation + material movement

Uses:
- tracked chassis blueprint
- boom
- bucket
- piston
- soil chunks

Suggested goal:
- scoop and move material to a dump zone

### `forklift-lite`

Level: `builder`

Concept:
- lift geometry and load balance

Uses:
- wheel base
- mast
- forks
- pallet

Suggested goal:
- stack two pallets without dropping them

### `tower-crane-lite`

Level: `builder`

Concept:
- structure + rotation + hoist

Uses:
- frame
- turntable
- boom
- winch
- hook

Suggested goal:
- move steel blocks onto a frame

### `hopper-to-wagon`

Level: `builder`

Concept:
- staged loading

Uses:
- hopper
- release gate
- wagon
- rail siding

Suggested goal:
- load exactly the target amount into one wagon

### `generator-yard`

Level: `builder`

Concept:
- one source powers several machines

Uses:
- generator
- powered conveyor
- pump
- indicator lights

Suggested goal:
- run the yard without overloading the system

## Combo Recipes

### `dig-load-haul`

Level: `combo`

Concept:
- extraction + loading + transport

Uses:
- tracked-loader-lite or excavator-lite
- wagon or dump cart
- rail or ground path

Suggested goal:
- move a target amount of soil from pit to dump zone

### `sort-move-dump`

Level: `combo`

Concept:
- routing logic

Uses:
- conveyor network
- sensors
- gates
- destination bins

Suggested goal:
- send each material type to the right destination

### `mobile-crane-builder`

Level: `combo`

Concept:
- module reuse

Uses:
- saved tracked chassis blueprint
- saved crane arm blueprint
- steel-block cargo

Suggested goal:
- assemble a mobile crane and place loads at multiple points

### `rail-yard-loader`

Level: `combo`

Concept:
- logistics chain

Uses:
- hopper feeder
- conveyors
- rail loop
- wagons
- switch track

Suggested goal:
- load the correct wagon and send it to the correct bay

## Yard-Master Recipes

### `site-logistics-chain`

Level: `yard-master`

Concept:
- multiple machine families working together

Uses:
- material source
- conveyor feeder
- hopper
- wagon
- crane
- placement area

Suggested goal:
- complete the whole chain before time runs out

### `switching-yard`

Level: `yard-master`

Concept:
- rail control and sequencing

Uses:
- several wagons
- multiple switches
- loading stations
- delivery targets

Suggested goal:
- dispatch each wagon to the right station in order

### `build-the-frame`

Level: `yard-master`

Concept:
- transport + lifting + placement

Uses:
- wagons carrying steel blocks
- crane
- support frame
- placement targets

Suggested goal:
- build a simple tower frame from shipped parts

## Blueprint-First Recipes

These recipes explicitly encourage module reuse.

### `saved-chassis-upgrade`

Flow:

1. load saved chassis blueprint
2. add a new drivetrain blueprint
3. upgrade traction or speed

### `tool-head-swap`

Flow:

1. load saved base machine
2. mount bucket, fork, or hook module
3. compare how the machine behaves

### `yard-kitbash`

Flow:

1. load two or three saved blueprints
2. connect via compatible ports
3. create a new combo machine

This is one of the strongest product loops in the whole system.

## Recipe Metadata Shape

```ts
export interface MachineRecipeDefinition {
  recipeId: string;
  level: 'starter' | 'builder' | 'combo' | 'yard-master';
  family:
    | 'structures'
    | 'earthworks'
    | 'lifting'
    | 'transport'
    | 'power-and-drivetrain'
    | 'flow-and-processing'
    | 'machine-combos';
  title: string;
  summary: string;
  teachingGoal: string;
  requiredPrimitiveKinds: string[];
  optionalPrimitiveKinds: string[];
  requiredBehaviorKinds: string[];
  recommendedControls: string[];
  recommendedMetrics: string[];
  recommendedGoals: string[];
  blueprintFriendly: boolean;
}
```

## Product Stance

Recipes are not there to make the sandbox smaller.

They are there to make the sandbox trustworthy.

The user should feel:

- "I can make anything construction-ish"

But under the hood, the system should really mean:

- "I can make anything built from a growing library of machine recipes and reusable modules"
