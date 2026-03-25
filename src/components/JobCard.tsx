import { Link } from 'react-router-dom';
import type { SiteJobDefinition } from '../lib/types';

interface JobCardProps {
  job: SiteJobDefinition;
  completed?: boolean;
}

export function JobCard({ job, completed = false }: JobCardProps) {
  return (
    <article className={`job-card ${completed ? 'complete' : ''}`} style={{ ['--card-accent' as string]: job.playable === false ? '#60a5fa' : '#47c5a5' }}>
      <div className="job-card-top">
        <p className="eyebrow">
          Tier {job.tier} {job.playable === false ? 'Preview' : 'Playable'}
        </p>
        <h3>{job.title}</h3>
        <p>{job.summary}</p>
      </div>
      <div className="job-card-bottom">
        <p className="muted">{job.objective}</p>
        <Link to={`/jobs/${job.jobId}`}>
          {job.playable === false ? 'Inspect Job' : completed ? 'Replay Job' : 'Open Job'}
        </Link>
      </div>
    </article>
  );
}
