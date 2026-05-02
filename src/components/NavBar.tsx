import { Link, NavLink, useLocation } from 'react-router-dom';
import { Button } from './ui/Button';
import { authClient, getSessionRole, isAdminSession } from '../lib/auth-client';

export default function NavBar() {
  const location = useLocation();
  const sessionQuery = authClient.useSession();
  const session = sessionQuery.data;
  const isAdmin = isAdminSession(session);
  const role = getSessionRole(session);
  const isAdminArea = location.pathname.startsWith('/admin');

  return (
    <header className="site-header">
      <div className="market-strip" aria-label="Market coverage">
        <div className="market-strip__inner">
          <span className="market-strip__item">
            <strong>US</strong>
            <span className="text-positive">Alpaca Live</span>
          </span>
          <span className="market-strip__item">
            <strong>Saudi</strong>
            <span className="text-positive">Sahmk Live</span>
          </span>
        </div>
      </div>

      <nav className="navbar">
        <Link to={isAdminArea ? '/admin' : '/app'} className="navbar__brand" aria-label="Fayafolio home">
          <span className="navbar__brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="navbar__brand-copy">
            <span className="navbar__logo">Fayafolio</span>
            <span className="navbar__tag">Portfolio command center</span>
          </span>
        </Link>

        <ul className="navbar__links">
          <li>
            <NavLink to="/app" end className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/app/holdings" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Holdings
            </NavLink>
          </li>
          <li>
            <NavLink to="/app/watchlist" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Watchlist
            </NavLink>
          </li>
          <li>
            <NavLink to="/app/settings" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Settings
            </NavLink>
          </li>
          {isAdmin && (
            <li>
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
                Admin
              </NavLink>
            </li>
          )}
        </ul>

        <div className="navbar__actions">
          <span className={`status-pill ${isAdmin ? 'status-pill--positive' : 'status-pill--muted'}`}>
            {role === 'admin' ? 'Admin session' : 'Signed in'}
          </span>
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
            Sign Out
          </Button>
        </div>
      </nav>
    </header>
  );
}
