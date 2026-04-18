import { useQuery } from '@tanstack/react-query';
import { fetchPortfolio, portfolioQueryKey, type PortfolioScope, ME_PORTFOLIO_SCOPE } from '../api/portfolio';

export function usePortfolioSnapshot(scope: PortfolioScope = ME_PORTFOLIO_SCOPE) {
  return useQuery({
    queryKey: portfolioQueryKey(scope),
    queryFn: () => fetchPortfolio(scope),
    staleTime: 30 * 1000,
  });
}
