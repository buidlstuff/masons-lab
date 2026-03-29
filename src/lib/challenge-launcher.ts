export type ChallengeTier = 'bronze' | 'silver' | 'gold';
export type ChallengeCategory = 'discovery' | 'engineering' | 'speed' | 'efficiency' | 'creative';

export interface ChallengeLauncherCard {
  id: string;
  title: string;
  description: string;
  tier: ChallengeTier;
  category: ChallengeCategory;
}

export interface SandboxChallengeCatalogEntry extends ChallengeLauncherCard {
  hint: string;
}

export const ACTIVE_SANDBOX_CHALLENGE_LIMIT = 3;

export const FEATURED_CHALLENGE_LAUNCHER_CARDS: ChallengeLauncherCard[] = [
  {
    id: 'first-spin',
    title: 'First Spin',
    description: 'Place a motor and watch the yard come alive.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'gear-head',
    title: 'Gear Head',
    description: 'Spread motion across three linked rotating parts.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'delivery-boy',
    title: 'Delivery Boy',
    description: 'Drive a locomotive all the way to the end of the track.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'splash-zone',
    title: 'Splash Zone',
    description: 'Drop a ball into water and watch the physics react.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'rube-goldberg',
    title: 'Rube Goldberg Starter',
    description: 'Build a 15-part machine that powers a belt and fills a hopper.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'long-haul',
    title: 'The Long Haul',
    description: 'Stretch a conveyor 600+ pixels and still deliver the cargo.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'crane-operator',
    title: 'Crane Operator',
    description: 'Use a winch and rope to lift cargo high into the air.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'speed-loader',
    title: 'Speed Loader',
    description: 'Fill a hopper with five blocks in under thirty seconds.',
    tier: 'silver',
    category: 'speed',
  },
  {
    id: 'pinball-wizard',
    title: 'Pinball Wizard',
    description: 'Build a five-obstacle pinball scene that drops a ball into a bucket.',
    tier: 'gold',
    category: 'creative',
  },
  {
    id: 'full-monty',
    title: 'The Full Monty',
    description: 'Combine structure, power, rail, and flow in one giant machine.',
    tier: 'gold',
    category: 'creative',
  },
];

export const SANDBOX_CHALLENGE_CATALOG: SandboxChallengeCatalogEntry[] = [
  {
    id: 'first-spin',
    title: 'First Spin',
    description: 'Place a motor and watch it turn.',
    hint: 'Drag a motor from the palette onto the canvas.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'gear-head',
    title: 'Gear Head',
    description: 'Get 3 rotating parts linked in a live drive chain.',
    hint: 'Start with a motor, then chain gears together until the motion spreads.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'delivery-boy',
    title: 'Delivery Boy',
    description: 'Get a locomotive to the end of its track.',
    hint: 'Place a rail segment, then put a locomotive on it and give it speed or a rotating driver.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'splash-zone',
    title: 'Splash Zone',
    description: 'Drop a ball into water.',
    hint: 'Place a water zone, then drop a ball above it.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'sand-castle',
    title: 'Sand Castle',
    description: 'Spawn a big sand shower.',
    hint: 'A material pile releases sand particles.',
    tier: 'bronze',
    category: 'discovery',
  },
  {
    id: 'rube-goldberg',
    title: 'Rube Goldberg Starter',
    description: 'Build a 15+ part machine that fills a hopper with a powered belt.',
    hint: 'Connect motors to gears to conveyors so the whole chain has to work.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'speed-demon',
    title: 'Speed Demon',
    description: 'Get a gear train spinning above 500 RPM.',
    hint: 'A gearbox with more input teeth than output teeth speeds things up.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'long-haul',
    title: 'The Long Haul',
    description: 'Build a 600px+ conveyor that delivers cargo to a hopper.',
    hint: 'Stretch out the conveyor path points and keep the hopper at the end.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'crane-operator',
    title: 'Crane Operator',
    description: 'Use a winch to lift cargo high above the ground.',
    hint: 'Connect winch → rope → hook, then attach cargo to the hook.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'bridge-builder',
    title: 'Bridge Builder',
    description: 'Build a beam bridge and roll a ball across it.',
    hint: 'Connect nodes with beams, then roll a ball over the span.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'counterbalance',
    title: 'Counterbalance',
    description: 'Hold a crane arm close to level for 3 seconds.',
    hint: 'Add a counterweight on the side opposite from the bucket.',
    tier: 'gold',
    category: 'engineering',
  },
  {
    id: 'gear-ratio-master',
    title: 'Gear Ratio Master',
    description: 'Achieve a gear ratio close to 4:1.',
    hint: 'A 48-tooth gear driving a 12-tooth gear is the classic speed-up.',
    tier: 'gold',
    category: 'engineering',
  },
  {
    id: 'perpetual-motion',
    title: 'Perpetual Motion (Almost)',
    description: 'Let a flywheel coast for 10 seconds after the motor input drops away.',
    hint: 'Heavy flywheels store energy. Spin one up, then let it keep the machine alive.',
    tier: 'gold',
    category: 'engineering',
  },
  {
    id: 'spring-launcher',
    title: 'Spring Launcher',
    description: 'Launch a ball high with a spring.',
    hint: 'Compress the spring and let it fling the ball upward.',
    tier: 'silver',
    category: 'engineering',
  },
  {
    id: 'bucket-brigade',
    title: 'Bucket Brigade',
    description: 'Have 3 buckets containing material at the same time.',
    hint: 'Use cranes and buckets to hold onto multiple loads.',
    tier: 'gold',
    category: 'engineering',
  },
  {
    id: 'speed-loader',
    title: 'Speed Loader',
    description: 'Fill a hopper with 5 blocks in under 30 seconds.',
    hint: 'Pre-position cargo on a powered belt and keep the path short.',
    tier: 'silver',
    category: 'speed',
  },
  {
    id: 'express-train',
    title: 'Express Train',
    description: 'Reach the end of the track in under 10 seconds.',
    hint: 'Crank up the locomotive speed or drive it from a fast rotating part.',
    tier: 'bronze',
    category: 'speed',
  },
  {
    id: 'blitz-build',
    title: 'Blitz Build',
    description: 'Spin a real two-gear train in under 15 seconds.',
    hint: 'Motor first, then two gears close enough to mesh.',
    tier: 'gold',
    category: 'speed',
  },
  {
    id: 'minimalist',
    title: 'Minimalist',
    description: 'Fill a hopper using only 4 parts.',
    hint: 'One motor, one conveyor, one hopper, and one cargo block is enough.',
    tier: 'silver',
    category: 'efficiency',
  },
  {
    id: 'power-miser',
    title: 'Power Miser',
    description: 'Drive 5+ linked rotating parts with a single motor.',
    hint: 'One motor can animate a long gear chain if you keep the meshes alive.',
    tier: 'silver',
    category: 'efficiency',
  },
  {
    id: 'compact-machine',
    title: 'Compact Machine',
    description: 'Build a working loader inside a tight footprint.',
    hint: 'Stack the conveyor above the hopper and keep everything tucked in.',
    tier: 'gold',
    category: 'efficiency',
  },
  {
    id: 'waterfall',
    title: 'Waterfall',
    description: 'Route 3 cargo pieces through 3 chutes into a hopper.',
    hint: 'Angle the chutes so each one hands off to the next.',
    tier: 'silver',
    category: 'creative',
  },
  {
    id: 'pinball-wizard',
    title: 'Pinball Wizard',
    description: 'Build a 5-obstacle pinball scene that lands a ball in a bucket.',
    hint: 'Walls and ramps can act like bumpers if the bucket waits at the end.',
    tier: 'gold',
    category: 'creative',
  },
  {
    id: 'ramp-jump',
    title: 'Ramp Jump',
    description: 'Launch a ball off a ramp and land on a distant platform.',
    hint: 'Steeper ramps plus a clean landing platform make the jump legible.',
    tier: 'silver',
    category: 'creative',
  },
  {
    id: 'full-monty',
    title: 'The Full Monty',
    description: 'Use structure, power, rail, and flow parts in one machine.',
    hint: 'You need at least one building piece, one power part, one rail part, and one flow part.',
    tier: 'gold',
    category: 'creative',
  },
];

export function getActiveSandboxChallengeIds(
  completedChallengeIds: Iterable<string>,
  limit = ACTIVE_SANDBOX_CHALLENGE_LIMIT,
) {
  const completedSet = new Set(completedChallengeIds);
  return SANDBOX_CHALLENGE_CATALOG
    .filter((challenge) => !completedSet.has(challenge.id))
    .slice(0, limit)
    .map((challenge) => challenge.id);
}
