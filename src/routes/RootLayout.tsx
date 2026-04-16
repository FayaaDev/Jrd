import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { SettingsSchema } from '../schemas/settings';
import { usePortfolioSnapshot } from '../hooks/usePortfolioSnapshot';
import '../styles/app.css';

export default function RootLayout() {
  const portfolioQuery = usePortfolioSnapshot();
  const theme = portfolioQuery.data?.settings.theme ?? SettingsSchema.parse({}).theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'system' ? 'dark' : theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <NavBar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
