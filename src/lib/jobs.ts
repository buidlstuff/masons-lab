import type { BuildTelemetry, SiteJobDefinition } from './types';

export function isJobComplete(job: SiteJobDefinition | undefined, telemetry: BuildTelemetry): boolean {
  if (!job) {
    return false;
  }

  switch (job.goalType) {
    case 'fill-hopper':
      return (telemetry.hopperFill ?? 0) >= 8;
    case 'gear-down':
      return (telemetry.outputRpm ?? 999) <= 45;
    case 'deliver-wagon':
      return Boolean(telemetry.wagonDelivered);
    default:
      return false;
  }
}
