import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authClient } from '../lib/auth-client';

export default function RequireSession() {
  const location = useLocation();
  const sessionQuery = authClient.useSession();

  if (sessionQuery.isPending) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">Authenticating</span>
        <h1 className="page-title">Loading your session...</h1>
      </section>
    );
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
