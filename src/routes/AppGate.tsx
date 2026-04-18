import { Outlet } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { authClient } from '../lib/auth-client';
import { usePortfolioSnapshot } from '../hooks/usePortfolioSnapshot';

export default function AppGate() {
  const portfolioQuery = usePortfolioSnapshot();

  if (portfolioQuery.isPending) {
    return (
      <section className="page-intro card">
        <span className="section-kicker">Portfolio</span>
        <h1 className="page-title">Loading your ledger...</h1>
      </section>
    );
  }

  if (portfolioQuery.error) {
    return (
      <EmptyState
        title="Portfolio unavailable"
        description={portfolioQuery.error instanceof Error ? portfolioQuery.error.message : 'Unable to load your ledger.'}
      />
    );
  }

  if (portfolioQuery.data?.status === 'archived') {
    return (
      <EmptyState
        title="Portfolio archived"
        description="Your ledger is archived. Sign-in still works, but editing is disabled until an admin restores it."
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
            Sign Out
          </Button>
        )}
      />
    );
  }

  return <Outlet />;
}
