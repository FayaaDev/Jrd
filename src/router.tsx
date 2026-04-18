import { createBrowserRouter } from 'react-router-dom';
import RootLayout from './routes/RootLayout';
import Landing from './routes/Landing';
import RequireSession from './routes/RequireSession';
import RequireAdmin from './routes/RequireAdmin';
import AppGate from './routes/AppGate';
import Dashboard from './routes/Dashboard';
import Holdings from './routes/Holdings';
import Watchlist from './routes/Watchlist';
import Settings from './routes/Settings';
import AdminDashboard from './routes/AdminDashboard';
import AdminPortfolios from './routes/AdminPortfolios';
import AdminPortfolioDetail from './routes/AdminPortfolioDetail';
import AdminUsers from './routes/AdminUsers';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Landing />,
  },
  {
    path: '/login',
    element: <Landing />,
  },
  {
    element: <RequireSession />,
    children: [
      {
        path: '/app',
        element: <RootLayout />,
        children: [
          {
            element: <AppGate />,
            children: [
              { index: true, element: <Dashboard /> },
              { path: 'holdings', element: <Holdings /> },
              { path: 'watchlist', element: <Watchlist /> },
              { path: 'settings', element: <Settings /> },
            ],
          },
        ],
      },
    ],
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        path: '/admin',
        element: <RootLayout />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'portfolios', element: <AdminPortfolios /> },
          { path: 'portfolios/:userId', element: <AdminPortfolioDetail /> },
          { path: 'users', element: <AdminUsers /> },
        ],
      },
    ],
  },
], { basename });
