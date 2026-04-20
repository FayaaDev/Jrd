import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { configureApiBase } from './api/base';
import './index.css';
import './styles/app.css';
import App from './App';

const queryClient = new QueryClient();

configureApiBase({
  basePath: import.meta.env.VITE_API_BASE_PATH ?? '/api',
  storageScope: import.meta.env.BASE_URL,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools />
    </QueryClientProvider>
  </StrictMode>
);
