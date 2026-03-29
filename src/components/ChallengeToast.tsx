import { useEffect } from 'react';
import type { ChallengeDefinition } from '../lib/challenges';

interface ChallengeToastProps {
  challenge: ChallengeDefinition | null;
  onDismiss: () => void;
}

export function ChallengeToast({ challenge, onDismiss }: ChallengeToastProps) {
  useEffect(() => {
    if (!challenge) return undefined;
    const timeout = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timeout);
  }, [challenge, onDismiss]);

  if (!challenge) return null;

  return (
    <div className="challenge-toast" role="status" aria-live="polite">
      <div className="challenge-toast-copy">
        <p className="eyebrow">Challenge Complete</p>
        <strong>{challenge.title}</strong>
        <p>{challenge.description}</p>
        <span className={`challenge-toast-tier challenge-tier-${challenge.tier}`}>{challenge.tier}</span>
      </div>
      <button
        type="button"
        className="challenge-toast-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss challenge notice"
      >
        Close
      </button>
    </div>
  );
}
