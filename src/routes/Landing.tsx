import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { authClient } from '../lib/auth-client';
import { useI18n } from '../i18n/useI18n';

export default function Landing() {
  const sessionQuery = authClient.useSession();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { lang, setLang, t } = useI18n();

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
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src={`${import.meta.env.BASE_URL}jrdnbg.png`}
                alt=""
                width={40}
                height={40}
                style={{ display: 'block' }}
              />
              <span className="hero-badge">{t('landing_badge')}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              aria-label={t('language')}
            >
              {lang === 'ar' ? 'EN' : 'عربي'}
            </Button>
          </div>
          <h1 className="page-title">{t('landing_title')}</h1>
          <p className="landing-hero__lede">
            {t('landing_lede')}
          </p>
          <div className="landing-hero__points">
            <span>{t('landing_point_oauth')}</span>
            <span>{t('landing_point_no_urls')}</span>
            <span>{t('landing_point_admin')}</span>
          </div>
          <div className="landing-hero__actions">
            <Button onClick={() => void continueWithGoogle()} disabled={isRedirecting || sessionQuery.isPending}>
              {isRedirecting ? t('landing_redirecting') : t('landing_continue_google')}
            </Button>
            {errorMessage && <p className="text-negative">{errorMessage}</p>}
          </div>
        </div>

        <div className="landing-hero__panel card card--dark">
          <div className="landing-stat">
            <span>{t('landing_stat_ownership_label')}</span>
            <strong>{t('landing_stat_ownership_value')}</strong>
          </div>
          <div className="landing-stat">
            <span>{t('landing_stat_visibility_label')}</span>
            <strong>{t('landing_stat_visibility_value')}</strong>
          </div>
          <div className="landing-stat">
            <span>{t('landing_stat_admin_label')}</span>
            <strong>{t('landing_stat_admin_value')}</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
