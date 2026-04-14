import { NavLink, Link } from 'react-router-dom';

export default function NavBar() {
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
          <span className="market-strip__item">
            <strong>LSE + Cash</strong>
            <span className="text-muted">Snapshot fallback</span>
          </span>
        </div>
      </div>

      <nav className="navbar">
        <Link to="/" className="navbar__brand" aria-label="Fayafolio home">
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
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/holdings" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Holdings
            </NavLink>
          </li>
          <li>
            <NavLink to="/watchlist" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Watchlist
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>
              Settings
            </NavLink>
          </li>
        </ul>

        <div className="navbar__actions">
          <Link to="/holdings" className="btn btn--primary btn--md navbar__cta">
            Add Position
          </Link>
        </div>
      </nav>
    </header>
  );
}
