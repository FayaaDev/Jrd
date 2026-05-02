import { useState } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import { useSettings } from '../hooks/useSettings';
import { usePrices } from '../hooks/usePrices';
import { ME_PORTFOLIO_SCOPE } from '../api/portfolio';
import { fmtCurrency, fmtAge } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useI18n } from '../i18n/useI18n';

export default function Watchlist() {
  const { t, lang } = useI18n();
  const { watchlist, addWatchItem, removeWatchItem, canEdit, isLoading, errorMessage, isSaving } = useWatchlist();
  const [settings] = useSettings();
  const symbols = watchlist.map((w) => w.symbol);
  const prices = usePrices(
    ME_PORTFOLIO_SCOPE,
    symbols,
    watchlist.map((item) => ({
      symbol: item.symbol,
      assetType: 'stock' as const,
      market:
        item.quoteCurrency === 'SAR' && /^\d+$/.test(item.symbol)
          ? 'XSAU'
          : 'XNAS',
    })),
    settings,
  );

  const [symInput, setSymInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState('USD');
  const [nameInput, setNameInput] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const sym = symInput.trim().toUpperCase();
    if (!sym) {
      setAddError(t('watchlist_symbol_required'));
      return;
    }
    if (watchlist.some((w) => w.symbol === sym)) {
      setAddError(`${sym} ${t('watchlist_already_in')}`);
      return;
    }
    const currency = currencyInput.trim().toUpperCase() || 'USD';
    addWatchItem({
      symbol: sym,
      quoteCurrency: currency,
      name: nameInput.trim() || undefined,
    });
    setSymInput('');
    setNameInput('');
    setCurrencyInput('USD');
    setAddError('');
  };

  if (isLoading) {
    return (
      <section className="page-intro card card--dark">
        <span className="section-kicker">{t('watchlist_kicker')}</span>
        <h1 className="page-title">{t('watchlist_loading')}</h1>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <div className="watchlist-page">
        <section className="page-intro card card--dark">
          <span className="section-kicker">{t('watchlist_kicker')}</span>
          <h1 className="page-title">{t('watchlist_unavailable')}</h1>
          <p className="page-intro__copy page-intro__copy--inverse">{errorMessage}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="watchlist-page">
      <section className="page-intro card card--dark">
        <span className="section-kicker">{t('watchlist_kicker')}</span>
        <div className="page-header">
          <h1 className="page-title">{t('watchlist_title')}</h1>
        </div>
        <p className="page-intro__copy page-intro__copy--inverse">
          {t('watchlist_lede')}
        </p>
      </section>

      <form onSubmit={handleAdd} className="watchlist-add-form card">
        <h2 className="form-section-title">{t('watchlist_add_symbol')}</h2>
        <div className="form-row">
          <Input
            label={t('watchlist_symbol')}
            value={symInput}
            onChange={(e) => {
              setSymInput(e.target.value);
              setAddError('');
            }}
            disabled={!canEdit || isSaving}
            placeholder="MSFT"
            error={addError}
          />
          <Input
            label={t('watchlist_quote_currency')}
            value={currencyInput}
            onChange={(e) =>
              setCurrencyInput(e.target.value.toUpperCase().slice(0, 3))
            }
            disabled={!canEdit || isSaving}
            placeholder="USD"
            maxLength={3}
          />
          <Input
            label={t('watchlist_name_optional')}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            disabled={!canEdit || isSaving}
            placeholder={lang === 'ar' ? 'مثال: Microsoft' : 'e.g. Microsoft Corp.'}
          />
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={!canEdit || isSaving}>
          {t('watchlist_add')}
        </Button>
      </form>

      {watchlist.length === 0 ? (
        <p className="text-muted" style={{ marginTop: '2rem', textAlign: 'center' }}>
          {t('watchlist_empty')}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
                <tr>
                  <th className="table__th">{t('watchlist_col_symbol')}</th>
                  <th className="table__th">{t('watchlist_col_name')}</th>
                  <th className="table__th">{t('watchlist_col_currency')}</th>
                  <th className="table__th table__th--number">{t('watchlist_col_price')}</th>
                  <th className="table__th table__th--number">{t('watchlist_col_asof')}</th>
                  <th className="table__th">{t('watchlist_col_actions')}</th>
                </tr>
              </thead>
            <tbody>
              {watchlist.map((item) => {
                const quote = prices.prices[item.symbol];
                return (
                  <tr key={item.symbol} className="table__row">
                    <td className="table__td table__td--symbol">{item.symbol}</td>
                    <td className="table__td">{item.name ?? '—'}</td>
                    <td className="table__td">{item.quoteCurrency}</td>
                    <td className="table__td table__td--number">
                      {quote?.price != null
                        ? fmtCurrency(quote.price, quote.currency ?? item.quoteCurrency)
                        : '—'}
                    </td>
                    <td className="table__td table__td--number">
                      {quote?.asOf != null ? fmtAge(quote.asOf) : '—'}
                    </td>
                    <td className="table__td table__td--actions">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={!canEdit || isSaving}
                        onClick={() => removeWatchItem(item.symbol)}
                      >
                        {t('watchlist_remove')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
