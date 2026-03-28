export interface EngineeringHandbookEntry {
  id: string;
  title: string;
  summary: string;
  partList: string[];
  blueprintId: string;
}

export const ENGINEERING_HANDBOOK_ENTRIES: EngineeringHandbookEntry[] = [
  {
    id: 'hook-hoist',
    title: 'Hook Hoist',
    summary: 'A simple hoist that shortens a rope to lift a hooked load.',
    partList: ['Winch', 'Rope', 'Hook', 'Cargo Block'],
    blueprintId: 'starter-hook-hoist',
  },
  {
    id: 'bucket-hoist',
    title: 'Bucket Hoist',
    summary: 'A hanging bucket that can be raised and lowered directly from a winch.',
    partList: ['Winch', 'Rope', 'Bucket'],
    blueprintId: 'starter-bucket-hoist',
  },
  {
    id: 'boom-hoist',
    title: 'Boom Hoist',
    summary: 'A winch pulling on the tip of a crane arm so the arm swings under tension.',
    partList: ['Winch', 'Rope', 'Crane Arm'],
    blueprintId: 'starter-boom-hoist',
  },
  {
    id: 'powered-arm',
    title: 'Powered Arm',
    summary: 'A motor-driven hinge swinging a crane arm with a bucket on the end.',
    partList: ['Motor', 'Powered Hinge', 'Crane Arm', 'Bucket', 'Counterweight', 'Chassis'],
    blueprintId: 'starter-powered-arm',
  },
  {
    id: 'piston-pusher',
    title: 'Piston Pusher',
    summary: 'A motor-powered piston extending into a cargo block and shoving it along a guide.',
    partList: ['Motor', 'Piston', 'Cargo Block', 'Platform', 'Wall'],
    blueprintId: 'starter-piston-pusher',
  },
  {
    id: 'spring-launcher',
    title: 'Spring Launcher',
    summary: 'A spring-loaded launcher tossing a ball toward a waiting bucket.',
    partList: ['Spring', 'Ball', 'Bucket', 'Wall', 'Platform'],
    blueprintId: 'starter-spring-launcher',
  },
];
