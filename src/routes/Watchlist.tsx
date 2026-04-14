import { useState } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import { useSettings } from '../hooks/useSettings';
import { usePrices } from '../hooks/usePrices';
import { fmtCurrency, fmtAge } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Watchlist() {
  const { watchlist, addWatchItem, removeWatchItem } = useWatchlist();
  const [settings] = useSettings();
  const symbols = watchlist.map((w) => w.symbol);
  const prices = usePrices(
    symbols,
    watchlist.map((item) => ({
      symbol: item.symbol,
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
    const sym = symInput.trim().toUpperCase();
    if (!sym) {
      setAddError('Symbol is required');
      return;
    }
    if (watchlist.some((w) => w.symbol === sym)) {
      setAddError(`${sym} is already in your watchlist`);
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

  return (
    <div className="watchlist-page">
      <section className="page-intro card card--dark">
        <span className="section-kicker">Trade radar</span>
        <div className="page-header">
          <h1 className="page-title">Watchlist</h1>
        </div>
        <p className="page-intro__copy page-intro__copy--inverse">
          Stage symbols before they graduate into the portfolio. Numeric SAR symbols route to Sahmk, everything else defaults to Alpaca.
        </p>
      </section>

      <form onSubmit={handleAdd} className="watchlist-add-form card">
        <h2 className="form-section-title">Add Symbol</h2>
        <div className="form-row">
          <Input
            label="Symbol"
            value={symInput}
            onChange={(e) => {
              setSymInput(e.target.value);
              setAddError('');
            }}
            placeholder="e.g. MSFT"
            error={addError}
          />
          <Input
            label="Quote Currency"
            value={currencyInput}
            onChange={(e) =>
              setCurrencyInput(e.target.value.toUpperCase().slice(0, 3))
            }
            placeholder="USD"
            maxLength={3}
          />
          <Input
            label="Name (optional)"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Microsoft Corp."
          />
        </div>
        <Button type="submit" variant="primary" size="sm">
          Add to Watchlist
        </Button>
      </form>

      {watchlist.length === 0 ? (
        <p className="text-muted" style={{ marginTop: '2rem', textAlign: 'center' }}>
          Your watchlist is empty. Add symbols above.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Symbol</th>
                <th className="table__th">Name</th>
                <th className="table__th">Currency</th>
                <th className="table__th table__th--number">Price</th>
                <th className="table__th table__th--number">As Of</th>
                <th className="table__th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((item) => {
                const quote = prices[item.symbol];
                return (
                  <tr key={item.symbol} className="table__row">
                    <td className="table__td table__td--symbol">{item.symbol}</td>
                    <td className="table__td">{item.name ?? '—'}</td>
                    <td className="table__td">{item.quoteCurrency}</td>
                    <td className="table__td table__td--number">
                      {quote?.price != null
                        ? fmtCurrency(quote.price, item.quoteCurrency)
                        : '—'}
                    </td>
                    <td className="table__td table__td--number">
                      {quote?.asOf != null ? fmtAge(quote.asOf) : '—'}
                    </td>
                    <td className="table__td table__td--actions">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeWatchItem(item.symbol)}
                      >
                        Remove
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
