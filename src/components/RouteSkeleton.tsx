interface RouteSkeletonProps {
  variant?: 'build' | 'detail';
}

export function RouteSkeleton({ variant = 'detail' }: RouteSkeletonProps) {
  if (variant === 'build') {
    return (
      <div className="page page-build route-skeleton route-skeleton-build" aria-busy="true">
        <section className="panel task-ribbon route-skeleton-panel">
          <div className="skeleton-line skeleton-line-eyebrow" />
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-line skeleton-line-copy" />
        </section>

        <section className="panel recovery-strip route-skeleton-panel">
          <div className="skeleton-line skeleton-line-copy" />
          <div className="route-skeleton-action-row">
            <span className="skeleton-pill" />
            <span className="skeleton-pill" />
            <span className="skeleton-pill" />
          </div>
        </section>

        <div className="build-layout build-layout-compact">
          <div className="panel route-skeleton-stage">
            <div className="route-skeleton-glow" />
            <div className="route-skeleton-grid" />
          </div>
          <div className="right-rail route-skeleton-rail">
            <section className="panel route-skeleton-panel">
              <div className="skeleton-line skeleton-line-eyebrow" />
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line skeleton-line-copy" />
              <div className="skeleton-line skeleton-line-copy short" />
            </section>
            <section className="panel route-skeleton-panel">
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line skeleton-line-copy" />
              <div className="skeleton-line skeleton-line-copy short" />
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page route-skeleton" aria-busy="true">
      <section className="hero-shell route-skeleton-panel">
        <div className="skeleton-line skeleton-line-eyebrow" />
        <div className="skeleton-line skeleton-line-title" />
        <div className="skeleton-line skeleton-line-copy" />
      </section>
      <section className="panel route-skeleton-panel">
        <div className="skeleton-line skeleton-line-title" />
        <div className="skeleton-line skeleton-line-copy" />
        <div className="skeleton-line skeleton-line-copy short" />
      </section>
    </div>
  );
}
