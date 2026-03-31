export interface PuzzleChallengeLauncherCard {
  id: string;
  title: string;
  emoji: string;
  description: string;
  objective: string;
}

const HIDDEN_PUBLIC_PUZZLE_CHALLENGE_IDS = new Set(['wagon-transfer']);

export const PUZZLE_CHALLENGE_LAUNCHER_CARDS: PuzzleChallengeLauncherCard[] = [
  { id: 'hook-and-drop', title: 'Hook and Drop', emoji: '🪝', description: 'Carry the hooked cargo over the wall and lower it into the hopper.', objective: 'Use the winch, rope, and hook to get one real cargo block into the hopper.' },
  { id: 'pulley-detour', title: 'Pulley Detour', emoji: '🧵', description: 'Route the rope through an idler pulley so the bucket can lift onto the high shelf.', objective: 'Use the pulley as a real rope redirector and lift the bucket onto the upper platform.' },
  { id: 'bucket-bridge', title: 'Bucket Bridge', emoji: '🪣', description: 'Use the hanging bucket to carry cargo over the gap and into the hopper.', objective: 'Get one cargo block across the gap and into the hopper with the bucket hoist.' },
  { id: 'powered-sweep', title: 'Bowling Score', emoji: '🎳', description: 'Roll the ball down the ramp and knock the cargo blocks into the hopper.', objective: 'Position the ramp so the ball smashes the blocks into the hopper in one shot.' },
  { id: 'spring-mail', title: 'Spring Mail', emoji: '📮', description: 'Drop the ball onto the spring and pop it into the waiting bucket.', objective: 'Use the spring launcher to land the ball inside the bucket.' },
  { id: 'tunnel-shot', title: 'Tunnel Shot', emoji: '🕳️', description: 'Send the ball through the tunnel and chute so it reaches the far side.', objective: 'Build a clean shot that carries the ball through the tunnel run into the target lane.' },
  { id: 'flywheel-nudge', title: 'Ramp Relay', emoji: '🛝', description: 'Guide the ball down through the obstacle course and into the bucket at the bottom.', objective: 'Place ramps so the ball zig-zags all the way down into the bucket.' },
  { id: 'wagon-transfer', title: 'Wagon Transfer', emoji: '🚃', description: 'Run the wagon through the load station, then unload the cargo into the hopper.', objective: 'Complete a full load-and-unload trip with the train parts and station zones.' },
  { id: 'counterweight-rescue', title: 'Chute Drop', emoji: '📦', description: 'Catch the falling cargo in a chute and slide it into the hopper.', objective: 'Position chutes so the cargo tumbles from the high shelf into the hopper below.' },
  { id: 'trampoline-bank-shot', title: 'Trampoline Bank Shot', emoji: '🤾', description: 'Use the springy pads and walls to ricochet the ball into the bucket.', objective: 'Make the ball bank off the trampoline path and finish in the bucket.' },
];

export const VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS = PUZZLE_CHALLENGE_LAUNCHER_CARDS.filter(
  (challenge) => !HIDDEN_PUBLIC_PUZZLE_CHALLENGE_IDS.has(challenge.id),
);
