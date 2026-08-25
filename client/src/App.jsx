import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Footer } from './components/Footer.jsx';

// Route-based code splitting — each page ships as its own chunk instead
// of one large bundle, and only loads when its route is actually visited.
const LoginPage = lazy(() => import('./pages/LoginPage.jsx').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./pages/SignupPage.jsx').then((m) => ({ default: m.SignupPage })));
const MasterPage = lazy(() => import('./pages/MasterPage.jsx').then((m) => ({ default: m.MasterPage })));
const MeetingBoardPage = lazy(() => import('./pages/MeetingBoardPage.jsx').then((m) => ({ default: m.MeetingBoardPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage.jsx').then((m) => ({ default: m.CalendarPage })));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx').then((m) => ({ default: m.DocumentsPage })));
const AssigneePage = lazy(() => import('./pages/AssigneePage.jsx').then((m) => ({ default: m.AssigneePage })));
const UsTimerPage = lazy(() => import('./pages/UsTimerPage.jsx').then((m) => ({ default: m.UsTimerPage })));
const UsMapPage = lazy(() => import('./pages/UsMapPage.jsx').then((m) => ({ default: m.UsMapPage })));

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-label="Loading">
      <span className="page-loader-spin" />
    </div>
  );
}

export function App() {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MasterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meetings"
            element={<ProtectedRoute><MeetingBoardPage /></ProtectedRoute>}
          />
          <Route
            path="/calendar"
            element={<ProtectedRoute><CalendarPage /></ProtectedRoute>}
          />
          <Route
            path="/documents"
            element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>}
          />
          <Route
            path="/assignee"
            element={<ProtectedRoute><AssigneePage /></ProtectedRoute>}
          />
          {/* No ProtectedRoute here — US Timer.html has no auth gate in the
              original either (no config.js include, no login check). */}
          <Route path="/timer" element={<UsTimerPage />} />
          {/* No ProtectedRoute here either — US Map.html has no auth gate in the
              original (no config.js include, no login/InfoStrideAPI check). */}
          <Route path="/map" element={<UsMapPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  );
}
