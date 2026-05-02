import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { SettingsSchema } from '../schemas/settings';
import { usePortfolioSnapshot } from '../hooks/usePortfolioSnapshot';
import { useI18n } from '../i18n/useI18n';
import '../styles/app.css';

export default function RootLayout() {
  const portfolioQuery = usePortfolioSnapshot();
  const theme = portfolioQuery.data?.settings.theme ?? SettingsSchema.parse({}).theme;
  const language = portfolioQuery.data?.settings.language ?? SettingsSchema.parse({}).language;
  const { setLang } = useI18n();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'system' ? 'dark' : theme);
  }, [theme]);

  useEffect(() => {
    // Keep i18n state aligned with the persisted user setting.
    setLang(language);
  }, [language, setLang]);

  return (
    <div className="app-shell">
      <NavBar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
