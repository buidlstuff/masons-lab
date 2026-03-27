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
  featured?: boolean;
}

export function JobCard({ job, completed = false, featured = false }: JobCardProps) {
  const ctaLabel = job.playable === false
    ? 'Preview Mission'
    : completed
      ? 'Replay Project'
      : featured
        ? 'Start Here'
        : 'Open Project';

  return (
    <article
      className={`job-card ${completed ? 'complete' : ''} ${featured ? 'featured' : ''} ${job.playable === false ? 'preview' : ''}`}
      style={{ ['--card-accent' as string]: job.playable === false ? '#60a5fa' : '#47c5a5' }}
    >
      <div className="job-card-top">
        <div className="job-card-kicker">
          <span className={`tier-badge tier-${job.tier}`}>Tier {job.tier} — {TIER_LABELS[job.tier]}</span>
          {completed && <span className="done-badge">★ Done</span>}
          {job.playable === false && <span className="preview-badge">Coming Soon</span>}
          {featured && !completed && job.playable !== false && <span className="starter-badge">Next Best Step</span>}
        </div>
        <h3>{job.title}</h3>
        <p className="job-card-summary">{job.summary}</p>
      </div>

      <div className="job-card-middle">
        <p className="job-card-label">What You’ll Prove</p>
        <p className="job-card-objective">{job.objective}</p>
      </div>

      <div className="job-card-bottom">
        <p className="job-card-state">
          {job.playable === false
            ? 'Mission shell only'
            : completed
              ? 'Already solved once'
              : featured
                ? 'Recommended next move'
                : 'Guided build'}
        </p>
        <Link
          to={job.playable === false ? `/jobs/${job.jobId}` : `/build?job=${job.jobId}`}
          className="job-card-cta"
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
