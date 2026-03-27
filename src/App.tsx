import { lazy, Suspense, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { RouteSkeleton } from './components/RouteSkeleton';
import { HomePage } from './pages/HomePage';
import {
  loadBlueprintPage,
  loadBuildPage,
  loadJobPage,
  loadMachinePage,
} from './lib/route-preload';

const LazyBuildPage = lazy(async () => {
  const module = await loadBuildPage();
  return { default: module.BuildPage };
});

const LazyMachinePage = lazy(async () => {
  const module = await loadMachinePage();
  return { default: module.MachinePage };
});

const LazyJobPage = lazy(async () => {
  const module = await loadJobPage();
  return { default: module.JobPage };
});

const LazyBlueprintPage = lazy(async () => {
  const module = await loadBlueprintPage();
  return { default: module.BlueprintPage };
});

function withRouteFallback(node: ReactNode, variant: 'build' | 'detail' = 'detail') {
  return (
    <Suspense fallback={<RouteSkeleton variant={variant} />}>
      {node}
    </Suspense>
  );
}

function RootLayout() {
  const pressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key.toLowerCase() === 'd') {
        window.dispatchEvent(new Event('mason:toggle-adult-tools'));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function clearPressTimer() {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function handleBrandPointerDown() {
    longPressTriggeredRef.current = false;
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      window.dispatchEvent(new Event('mason:toggle-adult-tools'));
    }, 800);
  }

  function handleBrandPointerUp(event: ReactPointerEvent<HTMLAnchorElement>) {
    clearPressTimer();
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link
          to="/"
          className="brand-mark"
          onPointerDown={handleBrandPointerDown}
          onPointerUp={handleBrandPointerUp}
          onPointerLeave={clearPressTimer}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="brand-icon">M</span>
          <div>
            <p className="eyebrow">Engineering Yard</p>
            <strong>Mason&apos;s Construction Sandbox</strong>
          </div>
        </Link>
        <nav className="site-nav">
          <Link to="/">Home</Link>
          <Link to="/build">Build</Link>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'build', element: withRouteFallback(<LazyBuildPage />, 'build') },
      { path: 'build/:draftId', element: withRouteFallback(<LazyBuildPage />, 'build') },
      { path: 'machines/:machineId', element: withRouteFallback(<LazyMachinePage />) },
      { path: 'jobs/:jobId', element: withRouteFallback(<LazyJobPage />) },
      { path: 'blueprints/:blueprintId', element: withRouteFallback(<LazyBlueprintPage />) },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
