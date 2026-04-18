import { createBrowserRouter } from 'react-router-dom';
import RootLayout from './routes/RootLayout';
import Dashboard from './routes/Dashboard';
import Holdings from './routes/Holdings';
import Watchlist from './routes/Watchlist';
import Settings from './routes/Settings';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'holdings', element: <Holdings /> },
      { path: 'watchlist', element: <Watchlist /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
], { basename });
