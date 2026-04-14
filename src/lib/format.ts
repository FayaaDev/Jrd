import { formatDistanceToNow } from 'date-fns';

export function fmtCurrency(value: number | undefined, currency: string, locale?: string): string {
  if (value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat(locale ?? 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtPercent(value: number | undefined, decimals = 2): string {
  if (value === undefined || isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtAge(isoDate: string): string {
  return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
}
