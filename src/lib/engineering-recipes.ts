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
  const dumpHingeControls = getPoweredHingeControls('dump-hinge', 'Bed');

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
            { id: 'car-chassis', kind: 'chassis', label: 'Chassis', config: { x: 300, y: 510, width: 160, height: 20 } },
            { id: 'car-wheel-l', kind: 'wheel', label: 'Left Wheel', config: { x: 245, y: 530, radius: 28, traction: 0.9, attachedToId: 'car-chassis', attachOffsetX: -55, attachOffsetY: 20 } },
            { id: 'car-wheel-r', kind: 'wheel', label: 'Right Wheel', config: { x: 355, y: 530, radius: 28, traction: 0.9, attachedToId: 'car-chassis', attachOffsetX: 55, attachOffsetY: 20 } },
            { id: 'car-motor', kind: 'motor', label: 'Motor', config: { x: 300, y: 495, rpm: 60, torque: 1.0, powerState: false, attachedToId: 'car-chassis', attachOffsetX: 0, attachOffsetY: -15 } },
          ],
          behaviors: [],
          controls: [
            { id: 'car-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'car-motor', path: 'powerState' }, defaultValue: false },
            { id: 'car-speed', kind: 'slider', label: 'Motor Speed', bind: { targetId: 'car-motor', path: 'rpm' }, defaultValue: 60, min: 10, max: 140, step: 5 },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'skid-steer',
      title: 'Skid Steer',
      summary: 'A compact loader with a front bucket on a powered hinge boom.',
      partList: ['Chassis', 'Wheel x2', 'Motor', 'Powered Hinge', 'Crane Arm', 'Bucket', 'Counterweight'],
      steps: [
        'Two wide-set wheels give the chassis stability on the ground.',
        'The motor powers the wheels and drives the boom hinge.',
        'Use the boom angle slider to scoop the bucket down or lift it up.',
        'A rear counterweight keeps the loader from tipping when the bucket is loaded.',
      ],
      whyItWorks: 'The driven wheels push off the ground, the powered hinge swings the boom, and the counterweight balances the load.',
      variation: 'Replace the bucket with a hook for a forklift, or swap the counterweight for cargo.',
      assistantPrompt: 'Explain how the counterweight prevents tipping and why the powered hinge can lift loads while driving.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-skid-steer',
        category: 'chassis',
        title: 'Skid Steer',
        summary: 'A wheeled loader with a powered boom and bucket.',
        tags: ['starter', 'recipe', 'vehicle', 'construction', 'loader'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'skid-chassis', kind: 'chassis', label: 'Chassis', config: { x: 300, y: 506, width: 180, height: 22 } },
            { id: 'skid-whl-front', kind: 'wheel', label: 'Front Wheel', config: { x: 225, y: 530, radius: 26, traction: 0.95, attachedToId: 'skid-chassis', attachOffsetX: -70, attachOffsetY: 20 } },
            { id: 'skid-whl-rear', kind: 'wheel', label: 'Rear Wheel', config: { x: 375, y: 530, radius: 26, traction: 0.95, attachedToId: 'skid-chassis', attachOffsetX: 70, attachOffsetY: 20 } },
            { id: 'skid-motor', kind: 'motor', label: 'Motor', config: { x: 330, y: 486, rpm: 50, torque: 1.5, powerState: false, attachedToId: 'skid-chassis', attachOffsetX: 30, attachOffsetY: -15 } },
            { id: 'skid-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 370, y: 490, mass: 6, attachedToId: 'skid-chassis', attachOffsetX: 65, attachOffsetY: -12 } },
            // Arm pivot: chassis fromLocalX=-65 means pivot world X = chassis.x + (-65) = 235.
            // crane-arm body center = cfg.x + length/2.  toLocalX=-50 is the arm's left end.
            // For left end to land at pivot: cfg.x + length/2 - 50 = 235 → cfg.x = 235.
            // Body center = 235 + 50 = 285.  Arm right tip = 285 + 50 = 335.
            { id: 'skid-arm', kind: 'crane-arm', label: 'Boom Arm', config: { x: 235, y: 494, length: 100 } },
            { id: 'skid-bucket', kind: 'bucket', label: 'Bucket', config: { x: 335, y: 480, width: 40, depth: 28, attachedToId: 'skid-arm', attachOffsetX: 50, attachOffsetY: 0 } },
            {
              id: 'excavator-hinge',
              kind: 'powered-hinge-link',
              label: 'Boom Hinge',
              config: {
                fromId: 'skid-chassis',
                toId: 'skid-arm',
                pivotX: 235,
                pivotY: 494,
                fromLocalX: -65,
                fromLocalY: -12,
                toLocalX: -50,
                toLocalY: 0,
                minAngle: -60,
                maxAngle: 45,
                motorId: 'skid-motor',
                targetAngle: 0,
                enabled: false,
              },
            },
          ],
          behaviors: [],
          controls: [
            { id: 'skid-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'skid-motor', path: 'powerState' }, defaultValue: false },
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
            { id: 'crane-chassis', kind: 'chassis', label: 'Chassis', config: { x: 600, y: 506, width: 180, height: 22 } },
            { id: 'crane-whl-l', kind: 'wheel', label: 'Left Wheel', config: { x: 535, y: 530, radius: 26, traction: 0.9, attachedToId: 'crane-chassis', attachOffsetX: -65, attachOffsetY: 20 } },
            { id: 'crane-whl-r', kind: 'wheel', label: 'Right Wheel', config: { x: 665, y: 530, radius: 26, traction: 0.9, attachedToId: 'crane-chassis', attachOffsetX: 65, attachOffsetY: 20 } },
            { id: 'crane-motor', kind: 'motor', label: 'Motor', config: { x: 630, y: 488, rpm: 45, torque: 1.0, powerState: false, attachedToId: 'crane-chassis', attachOffsetX: 30, attachOffsetY: -15 } },
            { id: 'crane-winch', kind: 'winch', label: 'Winch', config: { x: 560, y: 470, speed: 25, ropeLength: 120, attachedToId: 'crane-chassis', attachOffsetX: -40, attachOffsetY: -30 } },
            { id: 'crane-hook', kind: 'hook', label: 'Hook', config: { x: 560, y: 430 } },
            { id: 'crane-rope', kind: 'rope', label: 'Crane Rope', config: { fromId: 'crane-winch', toId: 'crane-hook', length: 120 } },
            { id: 'crane-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 660, y: 490, mass: 8, attachedToId: 'crane-chassis', attachOffsetX: 60, attachOffsetY: -15 } },
            { id: 'crane-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 400, y: 530, weight: 1 } },
          ],
          behaviors: [],
          controls: [
            { id: 'crane-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'crane-motor', path: 'powerState' }, defaultValue: false },
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

    // ── More complex composite recipes ──────────────────────────────────────
    {
      id: 'dump-truck',
      title: 'Dump Truck',
      summary: 'A wheeled truck with a tiltable bed that dumps its cargo when raised.',
      partList: ['Chassis', 'Wheel x2', 'Motor', 'Powered Hinge', 'Crane Arm (Bed)', 'Bucket', 'Counterweight'],
      steps: [
        'The chassis rides on two wheels with a motor for driving.',
        'A short crane arm acts as the dump bed, pivoting from the rear of the chassis.',
        'A bucket on the bed end catches cargo for hauling.',
        'Use the bed angle slider to tilt the bed up and dump the load, then flatten it to reload.',
      ],
      whyItWorks: 'The powered hinge tilts the bed arm, and gravity slides the cargo off when the angle is steep enough.',
      variation: 'Load cargo from a hopper or conveyor, then drive to a dump site.',
      assistantPrompt: 'Explain how the hinge angle controls dumping and why the counterweight keeps the truck from tipping backward.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-dump-truck',
        category: 'chassis',
        title: 'Dump Truck',
        summary: 'A wheeled truck with a tiltable dump bed.',
        tags: ['starter', 'recipe', 'vehicle', 'construction', 'dump'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'dump-chassis', kind: 'chassis', label: 'Chassis', config: { x: 300, y: 506, width: 200, height: 22 } },
            { id: 'dump-whl-front', kind: 'wheel', label: 'Front Wheel', config: { x: 215, y: 530, radius: 26, traction: 0.95, attachedToId: 'dump-chassis', attachOffsetX: -85, attachOffsetY: 20 } },
            { id: 'dump-whl-rear', kind: 'wheel', label: 'Rear Wheel', config: { x: 385, y: 530, radius: 26, traction: 0.95, attachedToId: 'dump-chassis', attachOffsetX: 85, attachOffsetY: 20 } },
            { id: 'dump-motor', kind: 'motor', label: 'Motor', config: { x: 340, y: 486, rpm: 45, torque: 1.5, powerState: false, attachedToId: 'dump-chassis', attachOffsetX: 40, attachOffsetY: -15 } },
            { id: 'dump-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 210, y: 490, mass: 5, attachedToId: 'dump-chassis', attachOffsetX: -80, attachOffsetY: -12 } },
            // Bed arm: pivot at rear of chassis (x=380), arm extends forward over the chassis
            // Pivot world X = chassis.x + 80 = 380. Arm left end at pivot: cfg.x + length/2 - 50 = 380 → cfg.x = 380 - 50 = 330. Body center = 330 + 50 = 380. Actually let's place pivot at back.
            { id: 'dump-bed', kind: 'crane-arm', label: 'Dump Bed', config: { x: 280, y: 494, length: 120 } },
            { id: 'dump-bucket', kind: 'bucket', label: 'Bed Scoop', config: { x: 340, y: 480, width: 50, depth: 24, attachedToId: 'dump-bed', attachOffsetX: 40, attachOffsetY: 0 } },
            {
              id: 'dump-hinge',
              kind: 'powered-hinge-link',
              label: 'Bed Hinge',
              config: {
                fromId: 'dump-chassis',
                toId: 'dump-bed',
                pivotX: 380,
                pivotY: 494,
                fromLocalX: 80,
                fromLocalY: -12,
                toLocalX: 60,
                toLocalY: 0,
                minAngle: -5,
                maxAngle: 65,
                motorId: 'dump-motor',
                targetAngle: 0,
                enabled: false,
              },
            },
          ],
          behaviors: [],
          controls: [
            { id: 'dump-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'dump-motor', path: 'powerState' }, defaultValue: false },
            { id: 'dump-speed', kind: 'slider', label: 'Drive Speed', bind: { targetId: 'dump-motor', path: 'rpm' }, defaultValue: 45, min: 10, max: 100, step: 5 },
            ...dumpHingeControls,
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'crane-cab',
      title: 'Crane Cab',
      summary: 'A stationary crane tower with a winch, rope, and hook for lifting cargo from a fixed base.',
      partList: ['Chassis (Base)', 'Crane Arm', 'Winch', 'Rope', 'Hook', 'Counterweight', 'Cargo Block'],
      steps: [
        'The heavy chassis sits on the ground as a stable base — no wheels needed.',
        'A long crane arm extends out from the base with a counterweight behind the pivot.',
        'The winch sits on top of the base and the rope hangs down to the hook.',
        'Lower the hook onto cargo, let it grab, then reel it up.',
      ],
      whyItWorks: 'The heavy base and counterweight keep the crane from tipping. The arm provides horizontal reach while the winch controls vertical lift.',
      variation: 'Add wheels and a motor to make it mobile, or swap the hook for a bucket.',
      assistantPrompt: 'Explain how the counterweight balances the load on the arm and what happens if the cargo is too heavy.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-crane-cab',
        category: 'structure',
        title: 'Crane Cab',
        summary: 'A stationary crane with arm, winch, rope, and hook.',
        tags: ['starter', 'recipe', 'crane', 'lifting', 'stationary'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'cab-base', kind: 'chassis', label: 'Crane Base', config: { x: 200, y: 520, width: 140, height: 28 } },
            { id: 'cab-arm', kind: 'crane-arm', label: 'Boom', config: { x: 180, y: 460, length: 180, attachedToId: 'cab-base', attachOffsetX: -20, attachOffsetY: -30 } },
            { id: 'cab-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 140, y: 460, mass: 10, attachedToId: 'cab-base', attachOffsetX: -60, attachOffsetY: -30 } },
            { id: 'cab-winch', kind: 'winch', label: 'Winch', config: { x: 300, y: 430, speed: 30, ropeLength: 160 } },
            { id: 'cab-hook', kind: 'hook', label: 'Hook', config: { x: 340, y: 420 } },
            { id: 'cab-rope', kind: 'rope', label: 'Crane Rope', config: { fromId: 'cab-winch', toId: 'cab-hook', length: 160 } },
            { id: 'cab-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 400, y: 530, weight: 1 } },
          ],
          behaviors: [],
          controls: [
            {
              id: 'cab-rope-length',
              kind: 'slider',
              label: 'Rope Length',
              description: 'Raise or lower the hook.',
              bind: { targetId: 'cab-winch', path: 'ropeLength' },
              defaultValue: 160,
              min: 50,
              max: 220,
              step: 5,
            },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'flatbed-truck',
      title: 'Flatbed Truck',
      summary: 'A long-bed truck with a flat platform for hauling cargo across the lab.',
      partList: ['Chassis', 'Wheel x2', 'Motor', 'Platform (Bed)', 'Cargo Block x2'],
      steps: [
        'A wide chassis provides a stable rolling base.',
        'Two wheels underneath are driven by a motor.',
        'Cargo blocks sit on the flat bed and ride along as the truck drives.',
        'Drive to a drop-off point and push the cargo off with a wall or piston.',
      ],
      whyItWorks: 'The wide chassis and low center of gravity keep the cargo stable. Friction between the cargo and chassis keeps blocks from sliding off.',
      variation: 'Add walls on the sides to make a walled truck bed, or add a winch to load heavy cargo.',
      assistantPrompt: 'Explain why the cargo stays on the truck and what would make it slide off.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-flatbed-truck',
        category: 'chassis',
        title: 'Flatbed Truck',
        summary: 'A wide truck for hauling loose cargo.',
        tags: ['starter', 'recipe', 'vehicle', 'transport', 'hauling'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'flat-chassis', kind: 'chassis', label: 'Chassis', config: { x: 500, y: 506, width: 220, height: 22 } },
            { id: 'flat-whl-l', kind: 'wheel', label: 'Left Wheel', config: { x: 405, y: 530, radius: 26, traction: 0.95, attachedToId: 'flat-chassis', attachOffsetX: -95, attachOffsetY: 20 } },
            { id: 'flat-whl-r', kind: 'wheel', label: 'Right Wheel', config: { x: 595, y: 530, radius: 26, traction: 0.95, attachedToId: 'flat-chassis', attachOffsetX: 95, attachOffsetY: 20 } },
            { id: 'flat-motor', kind: 'motor', label: 'Motor', config: { x: 540, y: 486, rpm: 40, torque: 1.5, powerState: false, attachedToId: 'flat-chassis', attachOffsetX: 40, attachOffsetY: -15 } },
            { id: 'flat-cargo-1', kind: 'cargo-block', label: 'Cargo A', config: { x: 470, y: 480, weight: 1 } },
            { id: 'flat-cargo-2', kind: 'cargo-block', label: 'Cargo B', config: { x: 500, y: 480, weight: 1 } },
          ],
          behaviors: [],
          controls: [
            { id: 'flat-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'flat-motor', path: 'powerState' }, defaultValue: false },
            { id: 'flat-speed', kind: 'slider', label: 'Drive Speed', bind: { targetId: 'flat-motor', path: 'rpm' }, defaultValue: 40, min: 10, max: 100, step: 5 },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'bulldozer',
      title: 'Bulldozer',
      summary: 'A heavy machine with a front blade that pushes cargo and debris along the ground.',
      partList: ['Chassis', 'Wheel x2', 'Motor', 'Counterweight', 'Wall (Blade)', 'Cargo Block x2'],
      steps: [
        'The chassis is heavier than a car thanks to the counterweight on the back.',
        'Two high-traction wheels give the bulldozer plenty of grip.',
        'A wall mounted at the front acts as a blade that pushes anything in its path.',
        'Drive forward and watch the blade shove the cargo blocks across the lab floor.',
      ],
      whyItWorks: 'The counterweight adds mass so the wheels have more traction. The blade is rigid and wide enough to push multiple blocks at once.',
      variation: 'Replace the blade with a bucket on a hinge to make it scoop instead of push.',
      assistantPrompt: 'Explain why more weight helps the wheels grip and how the blade transfers the pushing force.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-bulldozer',
        category: 'chassis',
        title: 'Bulldozer',
        summary: 'A heavy pusher with a front blade.',
        tags: ['starter', 'recipe', 'vehicle', 'construction', 'push'],
        ports: [
          { portId: 'mount-top', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'dozer-chassis', kind: 'chassis', label: 'Chassis', config: { x: 700, y: 506, width: 160, height: 24 } },
            { id: 'dozer-whl-front', kind: 'wheel', label: 'Front Wheel', config: { x: 635, y: 530, radius: 28, traction: 0.98, attachedToId: 'dozer-chassis', attachOffsetX: -65, attachOffsetY: 20 } },
            { id: 'dozer-whl-rear', kind: 'wheel', label: 'Rear Wheel', config: { x: 765, y: 530, radius: 28, traction: 0.98, attachedToId: 'dozer-chassis', attachOffsetX: 65, attachOffsetY: 20 } },
            { id: 'dozer-motor', kind: 'motor', label: 'Motor', config: { x: 730, y: 484, rpm: 55, torque: 2.0, powerState: false, attachedToId: 'dozer-chassis', attachOffsetX: 30, attachOffsetY: -18 } },
            { id: 'dozer-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 760, y: 488, mass: 8, attachedToId: 'dozer-chassis', attachOffsetX: 60, attachOffsetY: -14 } },
            // Blade: a wide bucket bolted to the front of the chassis acts as a pusher
            { id: 'dozer-blade', kind: 'bucket', label: 'Blade', config: { x: 620, y: 516, width: 56, depth: 32, attachedToId: 'dozer-chassis', attachOffsetX: -80, attachOffsetY: 10 } },
            { id: 'dozer-cargo-1', kind: 'cargo-block', label: 'Debris A', config: { x: 560, y: 530, weight: 1 } },
            { id: 'dozer-cargo-2', kind: 'cargo-block', label: 'Debris B', config: { x: 530, y: 530, weight: 1 } },
          ],
          behaviors: [],
          controls: [
            { id: 'dozer-power', kind: 'toggle', label: 'Motor Power', bind: { targetId: 'dozer-motor', path: 'powerState' }, defaultValue: false },
            { id: 'dozer-speed', kind: 'slider', label: 'Drive Speed', bind: { targetId: 'dozer-motor', path: 'rpm' }, defaultValue: 55, min: 10, max: 120, step: 5 },
          ],
          hud: [],
        },
      }),
    },
    {
      id: 'wrecking-ball',
      title: 'Wrecking Ball',
      summary: 'A crane arm with a heavy ball dangling from a rope — swing it to smash things.',
      partList: ['Chassis (Base)', 'Crane Arm', 'Rope', 'Rock (Ball)', 'Counterweight', 'Wall (Target)'],
      steps: [
        'A heavy base keeps the crane from tipping when the ball swings.',
        'The crane arm sticks out horizontally from the base.',
        'A rope hangs from the arm tip with a heavy rock acting as the wrecking ball.',
        'Drag the ball to one side and let go — watch it demolish the target wall!',
      ],
      whyItWorks: 'The ball stores energy as it swings upward and releases it on impact. A heavier ball hits harder.',
      variation: 'Add a winch to control the rope length, or mount the whole thing on wheels for a mobile wrecker.',
      assistantPrompt: 'Explain how pendulum energy works and why the ball swings back after hitting the wall.',
      blueprintRecord: createBlueprintRecord({
        blueprintId: 'starter-wrecking-ball',
        category: 'tool-head',
        title: 'Wrecking Ball',
        summary: 'A crane arm with a pendulum demolition ball.',
        tags: ['starter', 'recipe', 'crane', 'demolition', 'pendulum'],
        ports: [
          { portId: 'mount-main', kind: 'mount', label: 'Main Mount', compatibleWith: ['mount'] },
        ],
        fragment: {
          primitives: [
            { id: 'wreck-base', kind: 'chassis', label: 'Base', config: { x: 200, y: 524, width: 120, height: 28 } },
            { id: 'wreck-arm', kind: 'crane-arm', label: 'Boom', config: { x: 200, y: 470, length: 160, attachedToId: 'wreck-base', attachOffsetX: 0, attachOffsetY: -28 } },
            { id: 'wreck-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 150, y: 470, mass: 10, attachedToId: 'wreck-base', attachOffsetX: -50, attachOffsetY: -28 } },
            { id: 'wreck-ball', kind: 'rock', label: 'Wrecking Ball', config: { x: 360, y: 400 } },
            { id: 'wreck-rope', kind: 'rope', label: 'Ball Rope', config: { fromId: 'wreck-arm', toId: 'wreck-ball', length: 110 } },
            { id: 'wreck-target', kind: 'cargo-block', label: 'Target', config: { x: 500, y: 530, weight: 1 } },
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
