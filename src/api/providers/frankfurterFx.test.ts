import { describe, expect, it } from 'vitest';
import { frankfurterFxProvider } from './frankfurterFx';

describe('frankfurterFxProvider', () => {
  it('returns the USD/SAR peg without a network call', async () => {
    await expect(frankfurterFxProvider.getRate('USD', 'SAR')).resolves.toBe(3.75);
    await expect(frankfurterFxProvider.getRate('SAR', 'USD')).resolves.toBeCloseTo(1 / 3.75);
  });
});
