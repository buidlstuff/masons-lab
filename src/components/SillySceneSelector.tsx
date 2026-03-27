import type { SillyScene } from '../lib/silly-scenes';

interface SillySceneSelectorProps {
  scenes: SillyScene[];
  onLoadScene: (sceneId: string) => void;
  onSurprise: () => void;
}

export function SillySceneSelector({
  scenes,
  onLoadScene,
  onSurprise,
}: SillySceneSelectorProps) {
  return (
    <div className="scene-selector">
      <div className="scene-selector-header">
        <p className="muted">
          Each scene opens as a fresh draft, so your current machine stays untouched.
        </p>
        <button type="button" className="ghost-button" onClick={onSurprise}>
          Surprise Me
        </button>
      </div>
      <div className="scene-grid">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            className="scene-card"
            onClick={() => onLoadScene(scene.id)}
          >
            <div className="scene-card-head">
              <span className="scene-card-emoji" aria-hidden="true">{scene.emoji}</span>
              <span className={`scene-reliability scene-reliability-${scene.reliability}`}>
                {scene.reliability === 'safe' ? 'Safe' : 'Low Risk'}
              </span>
            </div>
            <strong>{scene.title}</strong>
            <p>{scene.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
