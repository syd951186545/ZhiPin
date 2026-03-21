import React from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {ThemeProvider} from './contexts/ThemeContext';
import {AuthProvider} from './contexts/AuthContext';
import {I18nProvider} from './contexts/I18nContext';
import {ToastProvider} from './components/ui/toast';

import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import EnterpriseManagement from './pages/Jobs';
import Candidates from './pages/Candidates';
import JilingRecruit from './pages/JilingRecruit';
import ComingSoon from './pages/ComingSoon';
import Settings from './pages/Settings';
import Monitor from './pages/Monitor';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="zhipinyun-theme">
      <I18nProvider>
        <AuthProvider>
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
                  <Route path="/enterprise" element={<EnterpriseManagement />} />
                  <Route path="/jobs" element={<Navigate to="/enterprise" replace />} />
                  {/* Legacy redirects */}
                  <Route path="/candidates" element={<Navigate to="/enterprise" replace />} />
                  <Route path="/automation" element={<Navigate to="/jiling-recruit" replace />} />
                  {/* Digital employees */}
                  <Route path="/jiling-recruit" element={<JilingRecruit />} />
                  <Route path="/coming-soon" element={<ComingSoon />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/monitor/:taskId" element={<Monitor />} />
                </Route>

                {/* 404 */}
                <Route path="/404" element={<NotFound />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
