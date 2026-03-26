import { Link } from 'react-router-dom';
import type { SiteJobDefinition } from '../lib/types';

const TIER_LABELS: Record<number, string> = {
  1: 'First Day',
  2: 'Operator',
  3: 'Engineer',
  4: 'Site Boss',
};

interface JobCardProps {
  job: SiteJobDefinition;
  completed?: boolean;
}

export function JobCard({ job, completed = false }: JobCardProps) {
  return (
    <article
      className={`job-card ${completed ? 'complete' : ''}`}
      style={{ ['--card-accent' as string]: job.playable === false ? '#60a5fa' : '#47c5a5' }}
    >
      <div className="job-card-top">
        <div className="job-card-eyebrow">
          <span className={`tier-badge tier-${job.tier}`}>Tier {job.tier} — {TIER_LABELS[job.tier]}</span>
          {completed && <span className="done-badge">★ Done</span>}
          {job.playable === false && <span className="preview-badge">Coming Soon</span>}
        </div>
        <h3>{job.title}</h3>
        <p>{job.summary}</p>
      </div>
      <div className="job-card-bottom">
        <p className="muted">{job.objective}</p>
        <Link to={`/jobs/${job.jobId}`}>
          {job.playable === false ? 'Preview' : completed ? 'Replay Project' : 'Start Project'}
        </Link>
      </div>
    </article>
  );
}
