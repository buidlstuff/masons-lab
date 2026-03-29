export interface SillySceneLauncherCard {
  id: string;
  title: string;
  description: string;
  emoji: string;
}

const HIDDEN_PUBLIC_SILLY_SCENE_IDS = new Set([
  'station-shuttle',
  'wagon-wash',
]);

export const SILLY_SCENE_LAUNCHER_CARDS: SillySceneLauncherCard[] = [
  { id: 'moon-mode', title: 'Moon Mode', description: 'Low gravity turns a simple ramp drop into a floaty slow-motion mess.', emoji: '🌙' },
  { id: 'bowling', title: 'Bowling Alley', description: 'Roll a heavy ball down a ramp and smash a cargo pyramid.', emoji: '🎳' },
  { id: 'bubble-bath', title: 'Bubble Bath', description: 'Drop floaty balls and sinky rocks into a huge water zone.', emoji: '🛁' },
  { id: 'conveyor-madness', title: 'Conveyor Madness', description: 'Five powered belts bounce cargo down toward a hopper.', emoji: '🔄' },
  { id: 'station-shuttle', title: 'Station Shuttle', description: 'A motor-boosted train loads cargo at one station and dumps it into a hopper at the other.', emoji: '🚉' },
  { id: 'bouncy-castle', title: 'Bouncy Castle', description: 'An enclosed arena where everything rebounds like a rubber toy.', emoji: '🏰' },
  { id: 'ice-rink', title: 'Ice Rink', description: 'Everything becomes slippery, so even a gentle slope feels chaotic.', emoji: '⛸️' },
  { id: 'trampoline-park', title: 'Trampoline Park', description: 'Falling parts ricochet between springy pads instead of dying on the floor.', emoji: '🤸' },
  { id: 'reverse-gravity', title: 'Reverse Gravity', description: 'Objects launch upward until a ceiling platform catches them.', emoji: '🙃' },
  { id: 'giant-pendulum', title: 'Giant Pendulum', description: 'A heavy swing smashes through anything left in its path.', emoji: '🔔' },
  { id: 'pulley-playground', title: 'Pulley Playground', description: 'A rope reroutes through pulleys while a flywheel spins beside it.', emoji: '🪢' },
  { id: 'crane-carnival', title: 'Crane Carnival', description: 'A prebuilt powered crane arm swings cargo toward a waiting hopper.', emoji: '🎡' },
  { id: 'spring-circus', title: 'Spring Circus', description: 'Three launch springs send balls and cargo into a chaotic juggling act.', emoji: '🎪' },
  { id: 'silo-spill', title: 'Silo Spill', description: 'A loaded silo is ready to dump the moment you open the floor gate.', emoji: '🏺' },
  { id: 'tunnel-trouble', title: 'Tunnel Trouble', description: 'Balls race down mismatched ramps and try to survive the tunnel maze.', emoji: '🚇' },
  { id: 'flywheel-fair', title: 'Flywheel Fair', description: 'One motor spins a belt-fed flywheel while cargo cruises toward a hopper.', emoji: '🛞' },
  { id: 'bucket-brigade', title: 'Bucket Brigade', description: 'A bucket hoist starts loaded and ready for a clumsy delivery run.', emoji: '🧺' },
  { id: 'gear-garden', title: 'Gear Garden', description: 'Meshed gears, pulleys, and a flywheel all bloom around one busy motor.', emoji: '🌻' },
  { id: 'wagon-wash', title: 'Wagon Wash', description: 'A little train shuttles cargo past a giant water tank and down the line.', emoji: '🫧' },
  { id: 'trampoline-mailroom', title: 'Trampoline Mailroom', description: 'Mailballs bounce across spring pads, bank off a wall, and try to hit the bucket.', emoji: '📬' },
];

export const VISIBLE_SILLY_SCENE_LAUNCHER_CARDS = SILLY_SCENE_LAUNCHER_CARDS.filter(
  (scene) => !HIDDEN_PUBLIC_SILLY_SCENE_IDS.has(scene.id),
);
