import { Link, NavLink, useLocation } from 'react-router-dom';
import { Button } from './ui/Button';
import { authClient, isAdminSession } from '../lib/auth-client';
import { useSettings } from '../hooks/useSettings';
import { useI18n } from '../i18n/useI18n';

export default function NavBar() {
  const location = useLocation();
  const sessionQuery = authClient.useSession();
  const session = sessionQuery.data;
  const isAdmin = isAdminSession(session);
  const isAdminArea = location.pathname.startsWith('/admin');
  const [settings, setSettings, settingsMeta] = useSettings();
  const { lang, setLang, t } = useI18n();

  // Language is a presentation concern; allow toggling even if the ledger is archived.
  const canToggle = !settingsMeta.isSaving;
  const canPersist = settingsMeta.canEdit && !settingsMeta.isSaving;
  const toggleLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    if (canPersist) {
      setSettings({ ...settings, language: next });
    }
  };

  return (
    <header className="site-header">
      <div className="market-strip" aria-label={t('nav_market_coverage')}>
        <div className="market-strip__inner">
          <span className="market-strip__item">
            <strong>{t('nav_market_us')}</strong>
            <span className="text-positive">{t('nav_market_live_alpaca')}</span>
          </span>
          <span className="market-strip__item">
            <strong>{t('nav_market_saudi')}</strong>
            <span className="text-positive">{t('nav_market_live_sahmk')}</span>
          </span>
        </div>
      </div>

        <nav className="navbar">
        <Link to={isAdminArea ? '/admin' : '/app'} className="navbar__brand" aria-label="Jrd home">
          <span className="navbar__brand-mark" aria-hidden="true">
            <img className="navbar__brand-logo" src={`${import.meta.env.BASE_URL}jrdnbg.png`} alt="" />
          </span>
          <span className="navbar__brand-copy">
            <span className="navbar__logo">Jrd</span>
            <span className="navbar__tag">{t('nav_brand_tagline')}</span>
          </span>
        </Link>

        <ul className="navbar__links">
          <li>
            <NavLink to="/app" end className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              {t('nav_dashboard')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/app/holdings" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              {t('nav_holdings')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/app/watchlist" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              {t('nav_watchlist')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/app/settings" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              {t('nav_settings')}
            </NavLink>
          </li>
          {isAdmin && (
            <li>
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
                {t('nav_admin')}
              </NavLink>
            </li>
          )}
        </ul>

        <div className="navbar__actions">
          <Button
            variant="secondary"
            size="sm"
            className="navbar__cta"
            onClick={toggleLang}
            disabled={!canToggle}
            aria-label={t('language')}
          >
            {lang === 'ar' ? 'EN' : 'عربي'}
          </Button>
          <span className="navbar__user">{session?.user?.name ?? session?.user?.email}</span>
          <Button
            variant="secondary"
            size="sm"
            className="navbar__cta"
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
        </div>
      </nav>
    </header>
  );
}
