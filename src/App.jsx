import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
