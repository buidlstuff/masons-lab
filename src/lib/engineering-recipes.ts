import { getPoweredHingeControls } from './connectors';
import type { MachineBlueprint, SavedBlueprintRecord } from './types';

const STARTER_TIMESTAMP = '2026-03-28T00:00:00.000Z';

export interface EngineeringRecipe {
  id: string;
  title: string;
  summary: string;
  partList: string[];
  steps: string[];
  whyItWorks: string;
  variation: string;
  assistantPrompt: string;
  blueprintRecord: SavedBlueprintRecord;
}

function createBlueprintRecord(blueprint: MachineBlueprint): SavedBlueprintRecord {
  return {
    recordId: blueprint.blueprintId,
    blueprint,
    starter: true,
    createdAt: STARTER_TIMESTAMP,
    updatedAt: STARTER_TIMESTAMP,
  };
}

function createRecipes(): EngineeringRecipe[] {
  const poweredHingeControls = getPoweredHingeControls('powered-arm-hinge', 'Powered Hinge');
  const excavatorHingeControls = getPoweredHingeControls('excavator-hinge', 'Boom');

  return [
    // ── Vehicle recipes ──────────────────────────────────────────────────────
    {
      id: 'simple-car',
      title: 'Simple Car',
      summary: 'A motor-driven chassis with two wheels that rolls across the lab floor.',
      partList: ['Chassis', 'Wheel x2', 'Motor'],
      steps: [
        'The chassis sits above the ground with two wheels underneath.',
        'The motor is bolted on top and powers both wheels through proximity.',
        'Toggle the motor on — the wheels push off the ground and the whole car rolls.',
        'Use the speed slider to go faster or slower.',
      ],
      whyItWorks: 'The motor spins the wheels, the wheels push off the ground through friction, and the chassis rides along on the axle constraints.',
      variation: 'Add a third wheel in front for a tricycle, or mount a crane arm on top for a mobile platform.',
      assistantPrompt: 'Explain how the wheels transmit force to the chassis and what happens if you change wheel traction or motor speed.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-simple-car',
        category: 'chassis',
        title: 'Simple Car',
        summary: 'A motor-driven two-wheeled chassis.',
        tags: ['starter', 'recipe', 'vehicle', 'transport'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'car-chassis', kind: 'chassis', label: 'Chassis', config: { x: 400, y: 460, width: 160, height: 20 } },
            { id: 'car-wheel-l', kind: 'wheel', label: 'Left Wheel', config: { x: 340, y: 490, radius: 28, traction: 0.9, attachedToId: 'car-chassis', attachOffsetX: -55, attachOffsetY: 18 } },
            { id: 'car-wheel-r', kind: 'wheel', label: 'Right Wheel', config: { x: 460, y: 490, radius: 28, traction: 0.9, attachedToId: 'car-chassis', attachOffsetX: 55, attachOffsetY: 18 } },
            { id: 'car-motor', kind: 'motor', label: 'Motor', config: { x: 400, y: 440, rpm: 60, torque: 1.0, powerState: true, attachedToId: 'car-chassis', attachOffsetX: 0, attachOffsetY: -15 } },
          ],
          behaviors: [],
          controls: [
            { id: 'car-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'car-motor', path: 'powerState' }, defaultValue: true },
            { id: 'car-speed', kind: 'slider', label: 'Motor Speed', bind: { targetId: 'car-motor', path: 'rpm' }, defaultValue: 60, min: 10, max: 140, step: 5 },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'skid-steer',
      title: 'Skid Steer',
      summary: 'A compact four-wheeled loader with a front bucket on a powered hinge.',
      partList: ['Chassis', 'Wheel x4', 'Motor', 'Powered Hinge', 'Crane Arm', 'Bucket'],
      steps: [
        'Four wheels give the chassis extra grip and stability.',
        'The motor powers all four wheels and drives the boom hinge.',
        'Use the boom angle slider to scoop the bucket down or lift it up.',
        'Drive into cargo blocks, scoop them up, and carry them across the lab.',
      ],
      whyItWorks: 'Four driven wheels give strong traction, and the powered hinge lets the boom lift loads while the vehicle keeps rolling.',
      variation: 'Replace the bucket with a hook for a forklift, or add a counterweight on the back.',
      assistantPrompt: 'Explain how the four wheels share traction, and why the powered hinge can lift loads without tipping the chassis.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-skid-steer',
        category: 'chassis',
        title: 'Skid Steer',
        summary: 'A four-wheeled loader with a powered boom and bucket.',
        tags: ['starter', 'recipe', 'vehicle', 'construction', 'loader'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'skid-chassis', kind: 'chassis', label: 'Chassis', config: { x: 400, y: 440, width: 140, height: 22 } },
            { id: 'skid-whl-fl', kind: 'wheel', label: 'Front Left', config: { x: 345, y: 470, radius: 22, traction: 0.95, attachedToId: 'skid-chassis', attachOffsetX: -55, attachOffsetY: 18 } },
            { id: 'skid-whl-fr', kind: 'wheel', label: 'Front Right', config: { x: 345, y: 470, radius: 22, traction: 0.95, attachedToId: 'skid-chassis', attachOffsetX: -55, attachOffsetY: 18 } },
            { id: 'skid-whl-rl', kind: 'wheel', label: 'Rear Left', config: { x: 455, y: 470, radius: 22, traction: 0.95, attachedToId: 'skid-chassis', attachOffsetX: 55, attachOffsetY: 18 } },
            { id: 'skid-whl-rr', kind: 'wheel', label: 'Rear Right', config: { x: 455, y: 470, radius: 22, traction: 0.95, attachedToId: 'skid-chassis', attachOffsetX: 55, attachOffsetY: 18 } },
            { id: 'skid-motor', kind: 'motor', label: 'Motor', config: { x: 420, y: 420, rpm: 50, torque: 1.5, powerState: true, attachedToId: 'skid-chassis', attachOffsetX: 20, attachOffsetY: -15 } },
            { id: 'skid-arm', kind: 'crane-arm', label: 'Boom Arm', config: { x: 340, y: 420, length: 100 } },
            { id: 'skid-bucket', kind: 'bucket', label: 'Bucket', config: { x: 290, y: 430, width: 38, depth: 26, attachedToId: 'skid-arm' } },
            {
              id: 'excavator-hinge',
              kind: 'powered-hinge-link',
              label: 'Boom Hinge',
              config: {
                fromId: 'skid-chassis',
                toId: 'skid-arm',
                pivotX: 350,
                pivotY: 426,
                fromLocalX: -50,
                fromLocalY: -14,
                toLocalX: -50,
                toLocalY: 0,
                minAngle: -45,
                maxAngle: 60,
                motorId: 'skid-motor',
                targetAngle: 0,
                enabled: true,
              },
            },
          ],
          behaviors: [],
          controls: [
            { id: 'skid-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'skid-motor', path: 'powerState' }, defaultValue: true },
            { id: 'skid-speed', kind: 'slider', label: 'Drive Speed', bind: { targetId: 'skid-motor', path: 'rpm' }, defaultValue: 50, min: 10, max: 120, step: 5 },
            ...excavatorHingeControls,
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'mobile-crane',
      title: 'Mobile Crane',
      summary: 'A wheeled platform with a rope-and-winch crane for lifting cargo on the move.',
      partList: ['Chassis', 'Wheel x2', 'Motor', 'Winch', 'Rope', 'Hook', 'Counterweight'],
      steps: [
        'The chassis rolls on two wheels with a motor driving them.',
        'A winch is mounted on top with a rope hanging down to a hook.',
        'A counterweight on the opposite side keeps the crane balanced.',
        'Drive to the cargo, lower the hook, clip the load, and reel it up as you drive away.',
      ],
      whyItWorks: 'The rolling chassis carries the crane to the load site, the winch reels the rope, and the counterweight prevents tipping.',
      variation: 'Replace the hook with a bucket for a mobile scoop, or add a boom arm for reach.',
      assistantPrompt: 'Explain how the counterweight keeps the crane stable and what happens if the load is too heavy.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-mobile-crane',
        category: 'chassis',
        title: 'Mobile Crane',
        summary: 'A wheeled crane platform with winch, rope, and hook.',
        tags: ['starter', 'recipe', 'vehicle', 'crane', 'lifting'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'crane-chassis', kind: 'chassis', label: 'Chassis', config: { x: 500, y: 460, width: 180, height: 22 } },
            { id: 'crane-whl-l', kind: 'wheel', label: 'Left Wheel', config: { x: 435, y: 490, radius: 26, traction: 0.9, attachedToId: 'crane-chassis', attachOffsetX: -65, attachOffsetY: 18 } },
            { id: 'crane-whl-r', kind: 'wheel', label: 'Right Wheel', config: { x: 565, y: 490, radius: 26, traction: 0.9, attachedToId: 'crane-chassis', attachOffsetX: 65, attachOffsetY: 18 } },
            { id: 'crane-motor', kind: 'motor', label: 'Motor', config: { x: 530, y: 440, rpm: 45, torque: 1.0, powerState: true, attachedToId: 'crane-chassis', attachOffsetX: 30, attachOffsetY: -15 } },
            { id: 'crane-winch', kind: 'winch', label: 'Winch', config: { x: 460, y: 420, speed: 25, ropeLength: 140, attachedToId: 'crane-chassis', attachOffsetX: -40, attachOffsetY: -30 } },
            { id: 'crane-hook', kind: 'hook', label: 'Hook', config: { x: 460, y: 360 } },
            { id: 'crane-rope', kind: 'rope', label: 'Crane Rope', config: { fromId: 'crane-winch', toId: 'crane-hook', length: 140 } },
            { id: 'crane-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 560, y: 440, mass: 8, attachedToId: 'crane-chassis', attachOffsetX: 60, attachOffsetY: -15 } },
            { id: 'crane-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 300, y: 480, weight: 1 } },
          ],
          behaviors: [],
          controls: [
            { id: 'crane-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'crane-motor', path: 'powerState' }, defaultValue: true },
            { id: 'crane-speed', kind: 'slider', label: 'Drive Speed', bind: { targetId: 'crane-motor', path: 'rpm' }, defaultValue: 45, min: 10, max: 100, step: 5 },
            {
              id: 'crane-rope-length',
              kind: 'slider',
              label: 'Rope Length',
              description: 'Raise or lower the hook.',
              bind: { targetId: 'crane-winch', path: 'ropeLength' },
              defaultValue: 140,
              min: 50,
              max: 200,
              step: 5,
            },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'hook-hoist',
      title: 'Hook Hoist',
      summary: 'A simple hoist that shortens a rope to lift a hooked load.',
      partList: ['Winch', 'Rope', 'Hook', 'Cargo Block'],
      steps: [
        'Start with the winch above the load so the rope hangs straight down.',
        'Keep the hook directly under the winch before you shorten the rope.',
        'Attach the cargo block to the hook and watch the whole hoist move together.',
        'Use the rope length slider to lift, pause, and lower the load again.',
      ],
      whyItWorks: 'The winch changes rope length, and the hook passes that lift into the cargo block.',
      variation: 'Try replacing the cargo block with a bucket for a hanging scoop.',
      assistantPrompt: 'Explain how the hook hoist works, what part is carrying the load, and what I should tune first.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-hook-hoist',
        category: 'tool-head',
        title: 'Hook Hoist',
        summary: 'Winch, rope, hook, and cargo arranged as a working hoist.',
        tags: ['starter', 'recipe', 'lifting', 'hoist'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'hook-hoist-winch', kind: 'winch', label: 'Winch', config: { x: 180, y: 120, speed: 30, ropeLength: 190 } },
            { id: 'hook-hoist-hook', kind: 'hook', label: 'Hook', config: { x: 180, y: 280 } },
            { id: 'hook-hoist-rope', kind: 'rope', label: 'Hoist Rope', config: { fromId: 'hook-hoist-winch', toId: 'hook-hoist-hook', length: 190 } },
            { id: 'hook-hoist-cargo', kind: 'cargo-block', label: 'Cargo Block', config: { x: 180, y: 320, weight: 1, attachedToId: 'hook-hoist-hook' } },
          ],
          behaviors: [],
          controls: [
            {
              id: 'hook-hoist-rope-length',
              kind: 'slider',
              label: 'Rope Length',
              description: 'Shorter rope lifts the hook and cargo.',
              bind: { targetId: 'hook-hoist-winch', path: 'ropeLength' },
              defaultValue: 190,
              min: 90,
              max: 230,
              step: 5,
            },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'bucket-hoist',
      title: 'Bucket Hoist',
      summary: 'A hanging bucket that can be raised and lowered directly from a winch.',
      partList: ['Winch', 'Rope', 'Bucket'],
      steps: [
        'Place the winch high enough that the bucket can hang freely under it.',
        'Connect the rope straight to the bucket instead of routing through a hook.',
        'Shorten the rope until the bucket clears the floor, then lower it again.',
        'Drop loose material near the bucket to see how the hanging tool changes the pickup path.',
      ],
      whyItWorks: 'The rope attaches to the top of the bucket, so changing rope length moves the bucket itself.',
      variation: 'Add a pulley to redirect the bucket path around another machine.',
      assistantPrompt: 'Explain why the bucket lifts even without a hook and what other parts I can route the rope through.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-bucket-hoist',
        category: 'tool-head',
        title: 'Bucket Hoist',
        summary: 'A winch lifting a bucket directly from its rim.',
        tags: ['starter', 'recipe', 'lifting', 'bucket'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'bucket-hoist-winch', kind: 'winch', label: 'Winch', config: { x: 180, y: 120, speed: 30, ropeLength: 180 } },
            { id: 'bucket-hoist-bucket', kind: 'bucket', label: 'Bucket', config: { x: 180, y: 270, width: 48, depth: 32 } },
            { id: 'bucket-hoist-rope', kind: 'rope', label: 'Bucket Rope', config: { fromId: 'bucket-hoist-winch', toId: 'bucket-hoist-bucket', length: 180 } },
          ],
          behaviors: [],
          controls: [
            {
              id: 'bucket-hoist-rope-length',
              kind: 'slider',
              label: 'Rope Length',
              description: 'Raise or lower the bucket.',
              bind: { targetId: 'bucket-hoist-winch', path: 'ropeLength' },
              defaultValue: 180,
              min: 90,
              max: 230,
              step: 5,
            },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'boom-hoist',
      title: 'Boom Hoist',
      summary: 'A winch pulling on the tip of a crane arm so the arm swings under tension.',
      partList: ['Winch', 'Rope', 'Crane Arm'],
      steps: [
        'Let the crane arm pivot from the ground so the left end acts like a fixed hinge.',
        'Place the winch above and to the side so the rope has a clear pull angle.',
        'Connect the rope to the arm tip and shorten it slowly.',
        'Watch how the same rope changes both arm angle and load path.',
      ],
      whyItWorks: 'The rope pulls on the arm tip instead of the arm center, so the whole boom rotates around its pivot.',
      variation: 'Hang a bucket from the arm to turn the boom hoist into a tiny crane.',
      assistantPrompt: 'Explain why the rope pulls the crane arm around its pivot and what changes if I move the winch.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-boom-hoist',
        category: 'tool-head',
        title: 'Boom Hoist',
        summary: 'A winch pulling on a crane-arm tip.',
        tags: ['starter', 'recipe', 'lifting', 'arm'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'boom-hoist-winch', kind: 'winch', label: 'Winch', config: { x: 120, y: 120, speed: 30, ropeLength: 220 } },
            { id: 'boom-hoist-arm', kind: 'crane-arm', label: 'Crane Arm', config: { x: 180, y: 270, length: 140 } },
            { id: 'boom-hoist-rope', kind: 'rope', label: 'Arm Rope', config: { fromId: 'boom-hoist-winch', toId: 'boom-hoist-arm', length: 220 } },
          ],
          behaviors: [],
          controls: [
            {
              id: 'boom-hoist-rope-length',
              kind: 'slider',
              label: 'Rope Length',
              description: 'Pull the arm inward or let it swing back out.',
              bind: { targetId: 'boom-hoist-winch', path: 'ropeLength' },
              defaultValue: 220,
              min: 120,
              max: 260,
              step: 5,
            },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'powered-arm',
      title: 'Powered Arm',
      summary: 'A motor-driven hinge swinging a crane arm with a bucket on the end.',
      partList: ['Motor', 'Powered Hinge', 'Crane Arm', 'Bucket', 'Counterweight', 'Chassis'],
      steps: [
        'Use the chassis as the base so the arm has something sturdy to swing from.',
        'Connect the chassis and arm with a powered hinge, then place the motor nearby.',
        'Hang the bucket from the arm and add a counterweight behind the pivot.',
        'Use the Run toggle and target-angle slider to sweep the arm through a controlled arc.',
      ],
      whyItWorks: 'The motor sets how fast the hinge can chase its target angle, and the arm carries the bucket through that swing.',
      variation: 'Swap the bucket for a hook or move the counterweight to see how balance changes the feel.',
      assistantPrompt: 'Explain how the powered hinge, motor, arm, and counterweight work together in this recipe.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-powered-arm',
        category: 'tool-head',
        title: 'Powered Arm',
        summary: 'A motor-linked powered hinge driving a crane arm.',
        tags: ['starter', 'recipe', 'hinge', 'powered'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
          { portId: 'power-in', kind: 'power-in', label: 'Motor Link', compatibleWith: ['power-out', 'mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'powered-arm-chassis', kind: 'chassis', label: 'Chassis', config: { x: 190, y: 300, width: 180, height: 24 } },
            { id: 'powered-arm-motor', kind: 'motor', label: 'Motor', config: { x: 120, y: 250, rpm: 90, torque: 1.2, powerState: true } },
            { id: 'powered-arm-arm', kind: 'crane-arm', label: 'Crane Arm', config: { x: 190, y: 280, length: 150 } },
            { id: 'powered-arm-bucket', kind: 'bucket', label: 'Bucket', config: { x: 330, y: 280, width: 42, depth: 28, attachedToId: 'powered-arm-arm' } },
            { id: 'powered-arm-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 220, y: 280, mass: 6, attachedToId: 'powered-arm-arm' } },
            {
              id: 'powered-arm-hinge',
              kind: 'powered-hinge-link',
              label: 'Powered Hinge',
              config: {
                fromId: 'powered-arm-chassis',
                toId: 'powered-arm-arm',
                pivotX: 190,
                pivotY: 280,
                fromLocalX: 0,
                fromLocalY: -20,
                toLocalX: -75,
                toLocalY: 0,
                minAngle: -55,
                maxAngle: 65,
                motorId: 'powered-arm-motor',
                targetAngle: 35,
                enabled: true,
              },
            },
          ],
          behaviors: [],
          controls: poweredHingeControls,
          hud: [],
        },
      }),
    },
    {
      id: 'piston-pusher',
      title: 'Piston Pusher',
      summary: 'A motor-powered piston extending into a cargo block and shoving it along a guide.',
      partList: ['Motor', 'Piston', 'Cargo Block', 'Platform', 'Wall'],
      steps: [
        'Keep the piston and cargo lined up so the rod pushes straight into the block.',
        'Use the platform as a simple guide so the block does not drop under the rod.',
        'Place the wall at the far end to make the travel distance obvious.',
        'Move the motor farther away and watch the piston lose power.',
      ],
      whyItWorks: 'The motor powers piston extension, and the rod turns that extension into a straight push on the cargo block.',
      variation: 'Swap the wall for a bucket or hopper entrance and use the piston as a feeder.',
      assistantPrompt: 'Explain how the piston turns motor power into a straight push and what changes if the cargo is not aligned.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-piston-pusher',
        category: 'drivetrain',
        title: 'Piston Pusher',
        summary: 'A piston pushing cargo toward a stop.',
        tags: ['starter', 'recipe', 'piston', 'linear-motion'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
          { portId: 'power-in', kind: 'power-in', label: 'Power Mount', compatibleWith: ['power-out', 'mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'piston-pusher-motor', kind: 'motor', label: 'Motor', config: { x: 100, y: 240, rpm: 100, torque: 1, powerState: true } },
            { id: 'piston-pusher-platform', kind: 'platform', label: 'Platform', config: { x: 250, y: 290, width: 260 } },
            { id: 'piston-pusher-wall', kind: 'wall', label: 'Stop Wall', config: { x: 380, y: 250, height: 90 } },
            { id: 'piston-pusher-piston', kind: 'piston', label: 'Piston', config: { x: 180, y: 250, orientation: 'horizontal', stroke: 90, speed: 40 } },
            { id: 'piston-pusher-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 240, y: 250, weight: 1 } },
          ],
          behaviors: [],
          controls: [],
          hud: [],
        },
      }),
    },
    {
      id: 'spring-launcher',
      title: 'Spring Launcher',
      summary: 'A falling ball compresses a spring and bounces toward a target bucket.',
      partList: ['Spring', 'Ball', 'Bucket', 'Platform'],
      steps: [
        'Stand the spring upright so the ball lands on the moving plate.',
        'Place the ball high enough that gravity gives it a good drop.',
        'Put the bucket downrange so the launch has a visible goal.',
        'Move the bucket and ball to explore how launch angle changes the result.',
      ],
      whyItWorks: 'The ball stores energy by compressing the spring, and the spring pushes that energy back into the ball.',
      variation: 'Add a wall or ramp to turn the launcher into a ricochet shot.',
      assistantPrompt: 'Explain what the spring is storing, why the ball launches, and how to improve the shot into the bucket.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-spring-launcher',
        category: 'tool-head',
        title: 'Spring Launcher',
        summary: 'A vertical spring popping a ball toward a bucket.',
        tags: ['starter', 'recipe', 'spring', 'launcher'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'spring-launcher-platform', kind: 'platform', label: 'Launch Platform', config: { x: 220, y: 340, width: 220 } },
            { id: 'spring-launcher-spring', kind: 'spring-linear', label: 'Spring', config: { x: 150, y: 280, orientation: 'vertical', restLength: 60, stiffness: 0.08 } },
            { id: 'spring-launcher-ball', kind: 'ball', label: 'Ball', config: { x: 150, y: 180, radius: 14 } },
            { id: 'spring-launcher-bucket', kind: 'bucket', label: 'Target Bucket', config: { x: 320, y: 250, width: 42, depth: 28 } },
          ],
          behaviors: [],
          controls: [],
          hud: [],
        },
      }),
    },
  ];
}

export const ENGINEERING_RECIPES = createRecipes();

export function getEngineeringRecipeBlueprints() {
  return ENGINEERING_RECIPES.map((recipe) => recipe.blueprintRecord);
}
