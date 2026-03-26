import type { BuildTelemetry, SiteJobDefinition } from './types';

export interface GoalProgress {
  label: string;
  current: number;
  target: number;
  unit: string;
  met: boolean;
}

export function isJobComplete(job: SiteJobDefinition | undefined, telemetry: BuildTelemetry): boolean {
  if (!job) return false;
  return getGoalProgress(job, telemetry).met;
}

export function getGoalProgress(job: SiteJobDefinition, telemetry: BuildTelemetry): GoalProgress {
  switch (job.goalType) {
    case 'fill-hopper': {
      const current = Math.min(8, telemetry.hopperFill ?? 0);
      const target = 8;
      return { label: 'Fill hopper', current, target, unit: 'blocks', met: current >= target };
    }
    case 'gear-down': {
      const current = telemetry.outputRpm ?? 999;
      const target = 45;
      return {
        label: 'Reduce output RPM',
        current: Math.round(current),
        target,
        unit: 'RPM',
        met: current <= target && (telemetry.inputRpm ?? 0) > 0,
      };
    }
    case 'deliver-wagon': {
      const delivered = Boolean(telemetry.wagonDelivered);
      return {
        label: 'Deliver wagon',
        current: delivered ? 1 : 0,
        target: 1,
        unit: '',
        met: delivered,
      };
    }
    default:
      return { label: job.goalType, current: 0, target: 1, unit: '', met: false };
  }
}
