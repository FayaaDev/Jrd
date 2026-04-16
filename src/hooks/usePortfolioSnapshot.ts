import { useQuery } from '@tanstack/react-query';
import { fetchPortfolio, portfolioQueryKey } from '../api/portfolio';

export function usePortfolioSnapshot() {
  return useQuery({
    queryKey: portfolioQueryKey,
    queryFn: fetchPortfolio,
    staleTime: 30 * 1000,
  });
}
