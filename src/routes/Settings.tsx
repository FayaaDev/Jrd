import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authClient, getSessionRole, isAdminSession } from '../lib/auth-client';
import { useSettings } from '../hooks/useSettings';
import {
  exportPortfolio,
  getApiErrorMessage,
  importPortfolio,
  resetPortfolio,
} from '../api/portfolio';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PdfImportWizard } from '../components/PdfImportWizard';
import type { Settings as SettingsType } from '../schemas/settings';

export default function Settings() {
  const sessionQuery = authClient.useSession();
  const [settings, setSettings, settingsMeta] = useSettings();
  const [importStatus, setImportStatus] = useState<string>('');
  const [pdfImportOpen, setPdfImportOpen] = useState(false);

  const session = sessionQuery.data;
  const isAdmin = isAdminSession(session);
  const role = getSessionRole(session);
  const canEdit = settingsMeta.canEdit && !sessionQuery.isPending;
  const disableWrites = !canEdit || settingsMeta.isSaving;

  const update = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    if (!canEdit) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleExport = async () => {
    try {
      const jsonStr = await exportPortfolio();
      setImportStatus('');
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fayafolio-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportStatus(getApiErrorMessage(error, 'Export failed.'));
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await importPortfolio(reader.result as string);
        setImportStatus('Import successful. Your private ledger was updated.');
      } catch (error) {
        setImportStatus(getApiErrorMessage(error, 'Import failed: invalid or malformed file.'));
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-imported
    e.target.value = '';
  };

  const handleReset = () => {
    if (!canEdit) return;
    if (
      window.confirm(
        'Reset your ledger back to a blank portfolio? This will replace your holdings, watchlist, and settings.'
      )
    ) {
      void resetPortfolio()
        .then(() => {
          setImportStatus('Your ledger was reset to a blank state.');
        })
        .catch((error) => {
          setImportStatus(getApiErrorMessage(error, 'Reset failed.'));
        });
    }
  };

  const handleSignOut = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.assign('/');
        },
      },
    });
  };

  return (
    <div className="settings-page">
      <section className="page-intro card">
        <span className="section-kicker">System controls</span>
        <h1 className="page-title">Settings</h1>
        <p className="page-intro__copy">
          Manage the base settings for your private ledger, export or import your own data, and keep your account session under control.
        </p>
        <p className="readonly-note">
          Signed in as {session?.user?.email ?? 'your account'}{isAdmin ? ' with admin access.' : '.'}
        </p>
      </section>

      <Card className="settings-section">
        <h2 className="settings-section__title">Account</h2>
        <Input label="Name" value={session?.user?.name ?? '—'} readOnly />
        <Input label="Email" value={session?.user?.email ?? '—'} readOnly />
        <Input label="Role" value={role} readOnly />
        <div className="settings-actions">
          {isAdmin && <Link to="/admin" className="btn btn--secondary btn--md">Open Admin Console</Link>}
          <Button type="button" variant="secondary" onClick={handleSignOut}>Sign Out</Button>
        </div>
        {settingsMeta.errorMessage && <p className="text-negative">{settingsMeta.errorMessage}</p>}
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">Portfolio</h2>
        <Input
          label="Base Currency"
          value={settings.baseCurrency}
          disabled={disableWrites}
          onChange={(e) =>
            update('baseCurrency', e.target.value.toUpperCase().slice(0, 3))
          }
          maxLength={3}
          placeholder="SAR"
        />
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">Data Providers</h2>
        <Input label="Price Provider" value="Auto by market (Alpaca + CoinMarketCap + Sahmk + snapshot fallback)" readOnly />
        <Input label="FX Provider" value="Frankfurter (ECB rates)" readOnly />
        <Input label="Refresh Interval" value={`${settings.refreshIntervalSec} seconds (server-managed)`} readOnly />
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">Appearance</h2>
        <Select
          label="Theme"
          value={settings.theme}
          disabled={disableWrites}
          onChange={(e) =>
            update('theme', e.target.value as SettingsType['theme'])
          }
          options={[
            { value: 'system', label: 'Exchange default (dark)' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">Data Management</h2>
        <div className="settings-actions">
          <div className="settings-action-group">
            <Button variant="secondary" onClick={() => void handleExport()}>
              Export Data
            </Button>
            <p className="text-muted">Download your private ledger as a JSON snapshot.</p>
          </div>
          <div className="settings-action-group">
            <label
              className="btn btn--secondary btn--md"
              style={{
                cursor: disableWrites ? 'not-allowed' : 'pointer',
                opacity: disableWrites ? 0.56 : 1,
                pointerEvents: disableWrites ? 'none' : 'auto',
              }}
            >
              Import Data
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={disableWrites}
                style={{ display: 'none' }}
              />
            </label>
            {importStatus && (
              <p
                className={
                  importStatus.includes('failed') ? 'text-negative' : 'text-positive'
                }
              >
                {importStatus}
              </p>
            )}
          </div>
          <div className="settings-action-group">
            <Button variant="secondary" onClick={() => setPdfImportOpen(true)} disabled={disableWrites}>
              Import from PDF
            </Button>
            <p className="text-muted">Import holdings from a brokerage statement PDF.</p>
          </div>
          <div className="settings-action-group">
            <Button variant="danger" onClick={handleReset} disabled={disableWrites}>
              Reset All Data
            </Button>
            <p className="text-muted">
              Replace your ledger with a blank portfolio.
            </p>
          </div>
        </div>
      </Card>
      <PdfImportWizard
        open={pdfImportOpen}
        onClose={() => setPdfImportOpen(false)}
      />
    </div>
  );
}
