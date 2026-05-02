import { Navigate, Outlet } from 'react-router-dom';
import { authClient, isAdminSession } from '../lib/auth-client';
import { useI18n } from '../i18n/useI18n';

export default function RequireAdmin() {
  const { t } = useI18n();
  const sessionQuery = authClient.useSession();

  if (sessionQuery.isPending) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">{t('auth_authorizing')}</span>
        <h1 className="page-title">{t('auth_checking_admin')}</h1>
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
