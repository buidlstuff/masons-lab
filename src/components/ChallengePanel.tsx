import { useMemo } from 'react';
import type { ChallengeCategory, ChallengeDefinition } from '../lib/challenges';

interface ChallengePanelProps {
  challenges: ChallengeDefinition[];
  completedChallengeIds: string[];
  activeChallengeIds: string[];
}

const CATEGORY_ORDER: ChallengeCategory[] = [
  'discovery',
  'engineering',
  'speed',
  'efficiency',
  'creative',
];

const CATEGORY_LABELS: Record<ChallengeCategory, string> = {
  discovery: 'Discovery',
  engineering: 'Engineering',
  speed: 'Speed',
  efficiency: 'Efficiency',
  creative: 'Creative',
};

export function ChallengePanel({
  challenges,
  completedChallengeIds,
  activeChallengeIds,
}: ChallengePanelProps) {
  const completedSet = useMemo(() => new Set(completedChallengeIds), [completedChallengeIds]);
  const activeSet = useMemo(() => new Set(activeChallengeIds), [activeChallengeIds]);
  const grouped = useMemo(() => {
    const map = new Map<ChallengeCategory, ChallengeDefinition[]>();
    CATEGORY_ORDER.forEach((category) => map.set(category, []));
    challenges.forEach((challenge) => {
      map.get(challenge.category)?.push(challenge);
    });
    return map;
  }, [challenges]);

  const nextChallenge = challenges.find((challenge) => !completedSet.has(challenge.id)) ?? null;

  return (
    <div className="challenge-panel">
      <div className="challenge-panel-summary">
        <p className="eyebrow">Sandbox Challenges</p>
        <h3>{completedSet.size} of {challenges.length} complete</h3>
        {nextChallenge ? (
          <p className="muted">
            Next up: <strong>{nextChallenge.title}</strong>. {nextChallenge.hint}
          </p>
        ) : (
          <p className="muted">Every current challenge is complete on this machine account.</p>
        )}
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = grouped.get(category) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={category} className="challenge-group">
            <h4>{CATEGORY_LABELS[category]}</h4>
            <div className="challenge-card-list">
              {items.map((challenge) => {
                const completed = completedSet.has(challenge.id);
                const active = activeSet.has(challenge.id) && !completed;
                return (
                  <article
                    key={challenge.id}
                    className={`challenge-card${completed ? ' complete' : ''}${active ? ' active' : ''}`}
                  >
                    <div className="challenge-card-header">
                      <strong>{challenge.title}</strong>
                      <span className={`challenge-tier challenge-tier-${challenge.tier}`}>{challenge.tier}</span>
                    </div>
                    <p>{challenge.description}</p>
                    <p className="muted">{completed ? 'Completed' : challenge.hint}</p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

