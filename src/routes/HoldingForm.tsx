import { useState } from 'react';
import type { Holding, AssetTypeValue } from '../schemas/holding';
import { HoldingSchema } from '../schemas/holding';
import { useHoldings } from '../hooks/useHoldings';
import { type PortfolioScope, ME_PORTFOLIO_SCOPE } from '../api/portfolio';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  holding?: Holding;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
  scope?: PortfolioScope;
}

const ASSET_TYPES: Array<{ value: AssetTypeValue; label: string }> = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'fund', label: 'Fund' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

type FormErrors = Partial<Record<string, string>>;

interface FormState {
  symbol: string;
  name: string;
  assetType: AssetTypeValue;
  market: string;
  quantity: string;
  avgCost: string;
  costCurrency: string;
  quoteCurrency: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  symbol: '',
  name: '',
  assetType: 'stock',
  market: '',
  quantity: '0',
  avgCost: '0',
  costCurrency: 'USD',
  quoteCurrency: 'USD',
  notes: '',
});

const holdingToForm = (h: Holding): FormState => ({
  symbol: h.symbol,
  name: h.name ?? '',
  assetType: h.assetType,
  market: h.market,
  quantity: String(h.quantity),
  avgCost: String(h.avgCost),
  costCurrency: h.costCurrency,
  quoteCurrency: h.quoteCurrency,
  notes: h.notes ?? '',
});

// Schema for the mutable fields only (id, createdAt, updatedAt derived by hook)
const HoldingInputSchema = HoldingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export default function HoldingForm({ open, onClose, holding, onDelete, canEdit = true, scope = ME_PORTFOLIO_SCOPE }: Props) {
  const { addHolding, updateHolding, isSaving } = useHoldings(scope);
  const [form, setForm] = useState<FormState>(() => (holding ? holdingToForm(holding) : emptyForm()));
  const [errors, setErrors] = useState<FormErrors>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const payload = {
      symbol: form.symbol,
      name: form.name || undefined,
      assetType: form.assetType,
      market: form.market,
      quantity: parseFloat(form.quantity) || 0,
      avgCost: parseFloat(form.avgCost) || 0,
      costCurrency: form.costCurrency,
      quoteCurrency: form.quoteCurrency,
      notes: form.notes || undefined,
    };

    const result = HoldingInputSchema.safeParse(payload);

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    if (holding) {
      updateHolding(holding.id, result.data);
    } else {
      addHolding(result.data);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!holding || !onDelete || !canEdit) return;
    if (window.confirm(`Delete ${holding.symbol}? This cannot be undone.`)) {
      onDelete(holding.id);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={holding ? `Edit ${holding.symbol}` : 'Add Holding'}
    >
      <form onSubmit={handleSubmit} className="holding-form" noValidate>
        <div className="form-row">
          <Input
            label="Symbol"
            value={form.symbol}
            onChange={(e) => set('symbol', e.target.value.toUpperCase())}
            error={errors.symbol}
            disabled={!canEdit || isSaving}
            required
            placeholder="e.g. AAPL"
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
            disabled={!canEdit || isSaving}
            placeholder="e.g. Apple Inc."
          />
        </div>

        <div className="form-row">
          <Select
            label="Asset Type"
            value={form.assetType}
            onChange={(e) => set('assetType', e.target.value as AssetTypeValue)}
            options={ASSET_TYPES}
            error={errors.assetType}
            disabled={!canEdit || isSaving}
          />
          <Input
            label="Market"
            value={form.market}
            onChange={(e) => set('market', e.target.value.toUpperCase())}
            error={errors.market}
            disabled={!canEdit || isSaving}
            placeholder="e.g. XNAS"
          />
        </div>

        <div className="form-row">
          <Input
            label="Quantity"
            type="number"
            min="0"
            step="any"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={errors.quantity}
            disabled={!canEdit || isSaving}
          />
          <Input
            label="Avg Cost"
            type="number"
            min="0"
            step="any"
            value={form.avgCost}
            onChange={(e) => set('avgCost', e.target.value)}
            error={errors.avgCost}
            disabled={!canEdit || isSaving}
          />
        </div>

        <div className="form-row">
          <Input
            label="Cost Currency"
            value={form.costCurrency}
            onChange={(e) =>
              set('costCurrency', e.target.value.toUpperCase().slice(0, 3))
            }
            error={errors.costCurrency}
            disabled={!canEdit || isSaving}
            placeholder="USD"
            maxLength={3}
          />
          <Input
            label="Quote Currency"
            value={form.quoteCurrency}
            onChange={(e) =>
              set('quoteCurrency', e.target.value.toUpperCase().slice(0, 3))
            }
            error={errors.quoteCurrency}
            disabled={!canEdit || isSaving}
            placeholder="USD"
            maxLength={3}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="holding-notes">
            Notes
          </label>
          <textarea
            id="holding-notes"
            className="form-input form-textarea"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            disabled={!canEdit || isSaving}
            rows={3}
            placeholder="Optional notes..."
          />
        </div>

        <div className="form-actions">
          {holding && onDelete && (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={!canEdit || isSaving}>
              Delete Holding
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canEdit || isSaving}>
            {holding ? 'Save Changes' : 'Add Holding'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
