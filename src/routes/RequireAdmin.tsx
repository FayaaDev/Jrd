import { Navigate, Outlet } from 'react-router-dom';
import { authClient, isAdminSession } from '../lib/auth-client';

export default function RequireAdmin() {
  const sessionQuery = authClient.useSession();

  if (sessionQuery.isPending) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">Authorizing</span>
        <h1 className="page-title">Checking admin access...</h1>
      </section>
    );
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminSession(sessionQuery.data)) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
