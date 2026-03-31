import { useMemo, useRef, useState } from 'react';
import { PART_CATEGORIES, type ExperimentManifest, type PrimitiveKind } from '../lib/types';
import { countKinds, iconForPart, isPublicPartVisible, labelForPart, QUICK_PARTS } from './PartPalette';

interface ToolbarPartStripProps {
  manifest: ExperimentManifest;
  selectedKind?: PrimitiveKind | null;
  allowedKinds?: PrimitiveKind[];
  onSelectKind: (kind: PrimitiveKind | null) => void;
}

export function ToolbarPartStrip({
  manifest,
  selectedKind,
  allowedKinds,
  onSelectKind,
}: ToolbarPartStripProps) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => countKinds(manifest), [manifest]);

  const guidedKinds = useMemo(
    () => (allowedKinds ? Array.from(new Set(allowedKinds.filter((kind) => isPublicPartVisible(kind)))) : null),
    [allowedKinds],
  );

  const quickPartKinds = useMemo(() => {
    if (guidedKinds) return guidedKinds.slice(0, 12);
    return QUICK_PARTS;
  }, [guidedKinds]);

  const visibleCategories = useMemo(
    () => PART_CATEGORIES
      .map((category) => ({
        ...category,
        kinds: category.kinds.filter((kind) => isPublicPartVisible(kind)),
      }))
      .filter((category) => category.kinds.length > 0),
    [],
  );

  const isLimitedStep = Boolean(guidedKinds);

  const handleSelect = (kind: PrimitiveKind) => {
    onSelectKind(selectedKind === kind ? null : kind);
    setCatalogOpen(false);
  };

  const renderTile = (kind: PrimitiveKind, className: string) => (
    <button
      key={kind}
      type="button"
      className={`${className}${selectedKind === kind ? ' is-active' : ''}`}
      title={labelForPart(kind)}
      disabled={isLimitedStep && !guidedKinds?.includes(kind)}
      onClick={() => handleSelect(kind)}
    >
      <span className="toolbar-icon strip-part-icon">{iconForPart(kind)}</span>
      <span className="toolbar-label">{labelForPart(kind)}</span>
      {counts[kind] ? <span className="strip-part-count">x{counts[kind]}</span> : null}
    </button>
  );

  return (
    <div className="toolbar-part-strip-wrapper">
      <div className="toolbar-part-strip-scroll">
        {quickPartKinds.map((kind) => renderTile(kind, 'toolbar-btn strip-part-tile'))}
        <button
          type="button"
          className={`toolbar-btn strip-catalog-trigger${catalogOpen ? ' is-active' : ''}`}
          title="All Parts"
          aria-expanded={catalogOpen}
          onClick={() => setCatalogOpen((prev) => !prev)}
        >
          <svg className="toolbar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="3" width="5.5" height="5.5" rx="1"/>
            <rect x="11.5" y="3" width="5.5" height="5.5" rx="1"/>
            <rect x="3" y="11.5" width="5.5" height="5.5" rx="1"/>
            <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1"/>
          </svg>
          <span className="toolbar-label">More</span>
        </button>
      </div>

      {catalogOpen ? (
        <div className="strip-catalog-dropdown" ref={catalogRef}>
          <div className="strip-catalog-header">
            <strong>All Parts</strong>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setCatalogOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="strip-catalog-body">
            {visibleCategories.map((category) => (
              <section key={category.label} className="strip-catalog-category">
                <p className="strip-catalog-category-label">{category.label}</p>
                <div className="strip-catalog-grid">
                  {category.kinds.map((kind) => renderTile(kind, 'strip-catalog-tile'))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
