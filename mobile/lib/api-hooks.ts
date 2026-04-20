// All hooks from shared — RN-safe, no auth-client dependency
export { useHoldings } from '@shared/hooks/useHoldings'
export { useFxRates } from '@shared/hooks/useFxRates'
export { usePortfolioSnapshot } from '@shared/hooks/usePortfolioSnapshot'
export { usePrices } from '@shared/hooks/usePrices'
// usePdfImport is NOT exported here: its upload() takes a browser File object.
// The mobile import screen uses authedFetch directly with RN FormData instead.
export { useSettings } from '@shared/hooks/useSettings'
export { useWatchlist } from '@shared/hooks/useWatchlist'

// Mobile-specific override — swaps web authClient for mobile authClient
export { usePortfolio } from './usePortfolio'
