import type { ChallengeCategory, ChallengeTier } from './challenges';

export interface ChallengeLauncherCard {
  id: string;
  title: string;
  description: string;
  tier: ChallengeTier;
  category: ChallengeCategory;
}

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
