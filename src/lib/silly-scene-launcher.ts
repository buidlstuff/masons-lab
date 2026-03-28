export interface SillySceneLauncherCard {
  id: string;
  title: string;
  description: string;
  emoji: string;
}

export const SILLY_SCENE_LAUNCHER_CARDS: SillySceneLauncherCard[] = [
  {
    id: 'moon-mode',
    title: 'Moon Mode',
    description: 'Low gravity turns a simple ramp drop into a floaty slow-motion mess.',
    emoji: '🌙',
  },
  {
    id: 'bowling',
    title: 'Bowling Alley',
    description: 'Roll a heavy ball down a ramp and smash a cargo pyramid.',
    emoji: '🎳',
  },
  {
    id: 'bubble-bath',
    title: 'Bubble Bath',
    description: 'Drop floaty balls and sinky rocks into a huge water zone.',
    emoji: '🛁',
  },
  {
    id: 'conveyor-madness',
    title: 'Conveyor Madness',
    description: 'Five powered belts bounce cargo down toward a hopper.',
    emoji: '🔄',
  },
  {
    id: 'station-shuttle',
    title: 'Station Shuttle',
    description: 'A motor-boosted train loads cargo at one station and dumps it into a hopper at the other.',
    emoji: '🚉',
  },
  {
    id: 'bouncy-castle',
    title: 'Bouncy Castle',
    description: 'An enclosed arena where everything rebounds like a rubber toy.',
    emoji: '🏰',
  },
  {
    id: 'ice-rink',
    title: 'Ice Rink',
    description: 'Everything becomes slippery, so even a gentle slope feels chaotic.',
    emoji: '⛸️',
  },
  {
    id: 'trampoline-park',
    title: 'Trampoline Park',
    description: 'Falling parts ricochet between springy pads instead of dying on the floor.',
    emoji: '🤸',
  },
  {
    id: 'reverse-gravity',
    title: 'Reverse Gravity',
    description: 'Objects launch upward until a ceiling platform catches them.',
    emoji: '🙃',
  },
  {
    id: 'giant-pendulum',
    title: 'Giant Pendulum',
    description: 'A heavy swing smashes through anything left in its path.',
    emoji: '🔔',
  },
];
