import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { I18nProvider } from './contexts/I18nContext';
import { ToastProvider } from './components/ui/toast';

import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Candidates from './pages/Candidates';
import Automation from './pages/Automation';
import Settings from './pages/Settings';
import Monitor from './pages/Monitor';
import History from './pages/History';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="zhipinyun-theme">
      <I18nProvider>
        <AuthProvider>
          <WebSocketProvider>
            <ToastProvider>
              <BrowserRouter>
                <Routes>
                  {/* Public Routes */}
                  <Route element={<AuthLayout />}>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                  </Route>

                  {/* Protected Routes */}
                  <Route element={<MainLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/candidates" element={<Candidates />} />
                    <Route path="/automation" element={<Automation />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/monitor/:taskId" element={<Monitor />} />
                    <Route path="/history" element={<History />} />
                  </Route>

                  {/* 404 */}
                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </BrowserRouter>
            </ToastProvider>
          </WebSocketProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
