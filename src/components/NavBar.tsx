import { NavLink } from 'react-router-dom';

export default function NavBar() {
  return (
    <nav className="navbar">
      <div className="navbar__brand">
        <span className="navbar__logo">Fayafolio</span>
      </div>
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
    </nav>
  );
}
