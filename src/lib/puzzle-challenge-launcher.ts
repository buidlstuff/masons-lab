export interface PuzzleChallengeLauncherCard {
  id: string;
  title: string;
  emoji: string;
  description: string;
  objective: string;
}

export const PUZZLE_CHALLENGE_LAUNCHER_CARDS: PuzzleChallengeLauncherCard[] = [
  { id: 'hook-and-drop', title: 'Hook and Drop', emoji: '🪝', description: 'Carry the hooked cargo over the wall and lower it into the hopper.', objective: 'Use the winch, rope, and hook to get one real cargo block into the hopper.' },
  { id: 'pulley-detour', title: 'Pulley Detour', emoji: '🧵', description: 'Route the rope through an idler pulley so the bucket can lift onto the high shelf.', objective: 'Use the pulley as a real rope redirector and lift the bucket onto the upper platform.' },
  { id: 'bucket-bridge', title: 'Bucket Bridge', emoji: '🪣', description: 'Use the hanging bucket to carry cargo over the gap and into the hopper.', objective: 'Get one cargo block across the gap and into the hopper with the bucket hoist.' },
  { id: 'powered-sweep', title: 'Powered Sweep', emoji: '🦾', description: 'Drive the crane arm with a powered hinge and sweep the cargo into the hopper.', objective: 'Create a real powered hinge, run it, and sweep one block into the hopper.' },
  { id: 'spring-mail', title: 'Spring Mail', emoji: '📮', description: 'Drop the ball onto the spring and pop it into the waiting bucket.', objective: 'Use the spring launcher to land the ball inside the bucket.' },
  { id: 'tunnel-shot', title: 'Tunnel Shot', emoji: '🕳️', description: 'Send the ball through the tunnel and chute so it reaches the far side.', objective: 'Build a clean shot that carries the ball through the tunnel run into the target lane.' },
  { id: 'flywheel-nudge', title: 'Flywheel Nudge', emoji: '🌀', description: 'Spin up the flywheel and let the stored motion finish the last push.', objective: 'Use a belt-driven flywheel to keep the loader moving long enough to score.' },
  { id: 'wagon-transfer', title: 'Wagon Transfer', emoji: '🚃', description: 'Run the wagon through the load station, then unload the cargo into the hopper.', objective: 'Complete a full load-and-unload trip with the train parts and station zones.' },
  { id: 'counterweight-rescue', title: 'Counterweight Rescue', emoji: '⚖️', description: 'Use the counterweight to keep the arm calm enough to lift the load over the blocker.', objective: 'Lift the cargo above the blocker while the arm stays reasonably level.' },
  { id: 'trampoline-bank-shot', title: 'Trampoline Bank Shot', emoji: '🤾', description: 'Use the springy pads and walls to ricochet the ball into the bucket.', objective: 'Make the ball bank off the trampoline path and finish in the bucket.' },
];
