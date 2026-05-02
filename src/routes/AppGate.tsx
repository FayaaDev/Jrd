import { Outlet } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { authClient } from '../lib/auth-client';
import { usePortfolioSnapshot } from '../hooks/usePortfolioSnapshot';
import { useI18n } from '../i18n/useI18n';

export default function AppGate() {
  const { t } = useI18n();
  const portfolioQuery = usePortfolioSnapshot();

  if (portfolioQuery.isPending) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">{t('appgate_kicker')}</span>
        <h1 className="page-title">{t('appgate_loading_ledger')}</h1>
      </section>
    );
  }

  if (portfolioQuery.error) {
    return (
      <EmptyState
        title={t('appgate_portfolio_unavailable')}
        description={portfolioQuery.error instanceof Error ? portfolioQuery.error.message : 'Unable to load your ledger.'}
      />
    );
  }

  if (portfolioQuery.data?.status === 'archived') {
    return (
      <EmptyState
        title={t('appgate_archived_title')}
        description={t('appgate_archived_desc')}
        action={(
          <Button
            variant="secondary"
            onClick={() => {
              void authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.assign('/');
                  },
                },
              });
            }}
          >
            {t('nav_sign_out')}
          </Button>
        )}
      />
    );
  }

  return <Outlet />;
}
