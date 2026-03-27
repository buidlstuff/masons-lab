import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { BlueprintPage } from './pages/BlueprintPage';
import { BuildPage } from './pages/BuildPage';
import { HomePage } from './pages/HomePage';
import { JobPage } from './pages/JobPage';
import { MachinePage } from './pages/MachinePage';

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
      { path: 'build', element: <BuildPage /> },
      { path: 'build/:draftId', element: <BuildPage /> },
      { path: 'machines/:machineId', element: <MachinePage /> },
      { path: 'jobs/:jobId', element: <JobPage /> },
      { path: 'blueprints/:blueprintId', element: <BlueprintPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
