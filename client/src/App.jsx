import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Footer } from './components/Footer.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { SignupPage } from './pages/SignupPage.jsx';
import { MasterPage } from './pages/MasterPage.jsx';
import { MeetingBoardPage } from './pages/MeetingBoardPage.jsx';
import { AssigneePage } from './pages/AssigneePage.jsx';
import { UsTimerPage } from './pages/UsTimerPage.jsx';
import { UsMapPage } from './pages/UsMapPage.jsx';

export function App() {
  return (
    <>
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
      <Footer />
    </>
  );
}
