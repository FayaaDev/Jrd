import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authClient } from '../lib/auth-client';
import { useI18n } from '../i18n/useI18n';

export default function RequireSession() {
  const { t } = useI18n();
  const location = useLocation();
  const sessionQuery = authClient.useSession();

  if (sessionQuery.isPending) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">{t('auth_authenticating')}</span>
        <h1 className="page-title">{t('auth_loading_session')}</h1>
      </section>
    );
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
