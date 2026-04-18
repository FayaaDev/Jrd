import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { authClient } from '../lib/auth-client';

export default function Landing() {
  const sessionQuery = authClient.useSession();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isRedirecting, setIsRedirecting] = useState(false);

  if (!sessionQuery.isPending && sessionQuery.data) {
    return <Navigate to="/app" replace />;
  }

  const continueWithGoogle = async () => {
    setIsRedirecting(true);
    setErrorMessage(undefined);

    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/app',
    });

    if (result.error) {
      setErrorMessage(result.error.message || 'Google sign-in is unavailable right now.');
      setIsRedirecting(false);
    }
  };

  return (
    <main className="landing-page">
      <section className="landing-hero card card--hero">
        <div className="landing-hero__copy">
          <span className="hero-badge">Private By Default</span>
          <h1 className="page-title">One Google sign-in. One private portfolio ledger.</h1>
          <p className="landing-hero__lede">
            Fayafolio now runs as one product: your own holdings, watchlist, settings, and live market view under a single authenticated ledger.
          </p>
          <div className="landing-hero__points">
            <span>Google OAuth only</span>
            <span>No public portfolio URLs</span>
            <span>Admin support when needed</span>
          </div>
          <div className="landing-hero__actions">
            <Button onClick={() => void continueWithGoogle()} disabled={isRedirecting || sessionQuery.isPending}>
              {isRedirecting ? 'Redirecting...' : 'Continue with Google'}
            </Button>
            {errorMessage && <p className="text-negative">{errorMessage}</p>}
          </div>
        </div>

        <div className="landing-hero__panel card card--dark">
          <div className="landing-stat">
            <span>Ownership</span>
            <strong>One ledger per user</strong>
          </div>
          <div className="landing-stat">
            <span>Visibility</span>
            <strong>Private only</strong>
          </div>
          <div className="landing-stat">
            <span>Admin controls</span>
            <strong>Inspect, archive, restore, delete</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
