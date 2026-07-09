import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import GuestRoute from './components/auth/GuestRoute';
import WorkspaceRedirect from './components/auth/WorkspaceRedirect';
import WorkspaceMemberRoute from './components/auth/WorkspaceMemberRoute';
import AuthLoading from './components/auth/AuthLoading';
import { useWorkspace } from './context/WorkspaceContext';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import GoogleOAuthCallback from './pages/GoogleOAuthCallback';
import ProfilePage from './pages/ProfilePage';
import ErrorBoundary from './components/common/ErrorBoundary';

const needsOnboarding = (profile, workspaces) => {
  const hasNoWorkspaces = workspaces.length === 0;
  const isProfileIncomplete = profile?.onboarding_complete === false;
  return hasNoWorkspaces || isProfileIncomplete;
};

const AppOnboardingGuard = () => {
  const { profile, loading: authLoading } = useAuth();
  const { workspaces, loading: workspaceLoading } = useWorkspace();

  if (authLoading || workspaceLoading) {
    return <AuthLoading />;
  }

  if (needsOnboarding(profile, workspaces)) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

const OnboardingEntryGuard = () => {
  const { profile, loading: authLoading } = useAuth();
  const { workspaces, loading: workspaceLoading } = useWorkspace();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isNewWorkspace = params.get('new') === '1';

  if (authLoading || workspaceLoading) {
    return <AuthLoading />;
  }

  if (!isNewWorkspace && !needsOnboarding(profile, workspaces)) {
    return <Navigate to="/" replace />;
  }

  return <OnboardingPage />;
};

const UnknownRouteRedirect = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return <AuthLoading />;
  }

  return <Navigate to={session ? '/' : '/login'} replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <WorkspaceProvider>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingEntryGuard />} />
              <Route path="/integrations/oauth/callback" element={<GoogleOAuthCallback />} />
              <Route path="/integrations/google/callback" element={<GoogleOAuthCallback />} />

              <Route element={<AppOnboardingGuard />}>
                <Route path="/" element={<AppLayout />}>
                  <Route index element={
                    <ErrorBoundary>
                      <Home />
                    </ErrorBoundary>
                  } />
                  <Route path="profile" element={
                    <ErrorBoundary>
                      <ProfilePage />
                    </ErrorBoundary>
                  } />
                  <Route
                    path="workspace/:workspaceId/:moduleId"
                    element={
                      <WorkspaceMemberRoute>
                        <ErrorBoundary>
                          <Workspace />
                        </ErrorBoundary>
                      </WorkspaceMemberRoute>
                    }
                  />
                  <Route path="workspace" element={<WorkspaceRedirect />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<UnknownRouteRedirect />} />
          </Routes>
        </WorkspaceProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;
