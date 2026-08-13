import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { AppLayout } from '@/components/layout';
import { LoginPage, PendingPage, RegisterPage } from '@/pages/auth';
import { BoardsPage } from '@/pages/boards';
import { BoardDetailPage } from '@/pages/board-detail';
import { ProjectPage } from '@/pages/project';
import { TasksPage } from '@/pages/tasks';
import { TimeTrackingPage } from '@/pages/time-tracking';
import { UsersPage } from '@/pages/users';
import { NotificationsPage } from '@/pages/notifications';
import { ProfilePage } from '@/pages/profile';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, initialized, fetchMe } = useAuthStore();

  useEffect(() => {
    if (!initialized) void fetchMe();
  }, [initialized, fetchMe]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'PENDING') return <Navigate to="/pending" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, initialized, fetchMe } = useAuthStore();

  useEffect(() => {
    if (!initialized) void fetchMe();
  }, [initialized, fetchMe]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if (user?.role === 'PENDING') return <Navigate to="/pending" replace />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminOnly() {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/pending"
        element={
          <PendingGate>
            <PendingPage />
          </PendingGate>
        }
      />

      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<BoardsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="time" element={<TimeTrackingPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="boards/:boardId" element={<BoardDetailPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route element={<AdminOnly />}>
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PendingGate({ children }: { children: React.ReactNode }) {
  const { user, initialized, fetchMe } = useAuthStore();

  useEffect(() => {
    if (!initialized) void fetchMe();
  }, [initialized, fetchMe]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PENDING') return <Navigate to="/" replace />;
  return <>{children}</>;
}
