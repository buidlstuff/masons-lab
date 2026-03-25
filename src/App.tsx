import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { BlueprintPage } from './pages/BlueprintPage';
import { BuildPage } from './pages/BuildPage';
import { HomePage } from './pages/HomePage';
import { JobPage } from './pages/JobPage';
import { MachinePage } from './pages/MachinePage';

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand-mark">
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
