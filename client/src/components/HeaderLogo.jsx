import { lazy, Suspense } from 'react';

const Logo3D = lazy(() => import('./Logo3D.jsx').then((m) => ({ default: m.Logo3D })));

/** The animated 3D logo (same one used on the dashboard/login/signup
 *  hero) sized down for the top-left corner of every other page's
 *  header. Loaded lazily so pages that otherwise have no 3D dependency
 *  (Meeting Board, Assignee) aren't forced to download Three.js just to
 *  render a corner logo — it fades in once its chunk is ready instead
 *  of blocking the rest of the page. */
export function HeaderLogo() {
  return (
    <Suspense fallback={null}>
      <Logo3D variant="header" />
    </Suspense>
  );
}
