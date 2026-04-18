/**
 * confidenceScorer.js
 * Scores each extracted holding with a confidence value 0.0–1.0.
 */

export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_LOW = 0.5;

/**
 * @param {Array<object>} holdings - Raw holdings from OpenAI extraction
 * @param {Map<string, { verified: boolean|null, suggestedName?: string }>} verificationMap
 * @returns {Array<object>}
 */
export function scoreHoldings(holdings, verificationMap) {
  return holdings.map((holding) => {
    let confidence = 1.0;
    const flags = [];
    const warnings = [];

    const symKey = (holding.symbol ?? '').toUpperCase();
    const verification = verificationMap.get(symKey) ?? { verified: null };
    const { verified, suggestedName } = verification;

    // Verification deductions
    if (verified === false) {
      confidence -= 0.30;
      flags.push('Symbol not found on price provider');
    } else if (verified === null) {
      confidence -= 0.15;
      flags.push('Symbol could not be verified (provider unavailable or unknown market)');
    }

    // Numeric cross-check: quantity × avgCost vs totalCost
    const qty = holding.quantity;
    const avgCost = holding.avgCost;
    const totalCost = holding.totalCost;
    const currentPrice = holding.currentPrice;
    const totalMarketValue = holding.totalMarketValue;

    if (typeof qty === 'number' && typeof avgCost === 'number' && typeof totalCost === 'number' && totalCost !== 0) {
      const computed = qty * avgCost;
      if (Math.abs(computed - totalCost) / Math.abs(totalCost) > 0.01) {
        confidence -= 0.20;
        flags.push("Quantity × avg cost doesn't match total cost (>1% discrepancy)");
        warnings.push(
          `Computed cost (${qty} × ${avgCost}) = ${computed.toFixed(2)} vs stated ${totalCost.toFixed(2)}`
        );
      }
    }

    // Numeric cross-check: quantity × currentPrice vs totalMarketValue (informational)
    if (typeof currentPrice === 'number' && typeof totalMarketValue === 'number' && totalMarketValue !== 0) {
      const computedMV = qty * currentPrice;
      if (Math.abs(computedMV - totalMarketValue) / Math.abs(totalMarketValue) > 0.01) {
        warnings.push(
          `Computed market value (${qty} × ${currentPrice}) = ${computedMV.toFixed(2)} vs stated ${totalMarketValue.toFixed(2)}`
        );
      }
    }

    // avgCost is zero
    if (avgCost === 0) {
      confidence -= 0.10;
      flags.push('Average cost is zero (not in statement)');
    }

    // Unknown market
    if ((holding.market ?? '').toUpperCase() === 'UNKNOWN') {
      confidence -= 0.10;
      flags.push('Market could not be determined — please set manually in the Review step.');
    } else if (holding._marketResolvedBy === 'alpaca' || holding._marketResolvedBy === 'yahoo') {
      const via = holding._marketResolvedBy === 'alpaca' ? 'Alpaca' : 'Yahoo Finance';
      flags.push(`Market auto-detected via ${via} (${holding.market}).`);
    } else if (holding._marketResolvedBy === 'shape') {
      flags.push(`Market inferred from symbol shape (${holding._marketBeforeResolve ?? holding.market} → ${holding.market}).`);
    } else if (holding._marketResolvedBy === 'synonym') {
      flags.push(`Market normalised from "${holding._marketBeforeResolve ?? ''}" → ${holding.market}.`);
    }

    // Name missing
    if (holding.name == null || holding.name === '') {
      confidence -= 0.10;
      flags.push('Name could not be extracted');
    }

    // Asset type defaulted to 'other'
    if (holding.assetType === 'other') {
      confidence -= 0.05;
      flags.push("Asset type defaulted to 'other'");
    }

    // Clamp to [0, 1]
    confidence = Math.min(1.0, Math.max(0.0, confidence));

    const resolvedBy = holding._marketResolvedBy;
    const { _marketResolvedBy, _marketResolutionFailed, _marketBeforeResolve, ...cleanHolding } = holding;

    return {
      ...cleanHolding,
      confidence,
      flags,
      verified,
      suggestedName,
      warnings,
      ...(resolvedBy ? { resolvedBy } : {}),
    };
  });
}
