import { useState } from 'react';
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
import { useAdminSession } from '../hooks/useAdminSession';

export default function Settings() {
  const { token, isUnlocked, isChecking, unlock, lock } = useAdminSession();
  const [settings, setSettings, settingsMeta] = useSettings();
  const [importStatus, setImportStatus] = useState<string>('');
  const [adminToken, setAdminToken] = useState('');
  const [adminStatus, setAdminStatus] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);

  const canEdit = settingsMeta.canEdit && !isChecking;
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
        await importPortfolio(reader.result as string, token);
        setImportStatus('Import successful. Shared portfolio updated.');
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
        'Reset the shared portfolio back to the default seeded dataset? This will replace holdings, watchlist, and settings for everyone.'
      )
    ) {
      void resetPortfolio(token)
        .then(() => {
          setImportStatus('Shared portfolio reset to the default seeded state.');
        })
        .catch((error) => {
          setImportStatus(getApiErrorMessage(error, 'Reset failed.'));
        });
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adminToken.trim()) {
      setAdminStatus('Enter the admin token to unlock editing.');
      return;
    }

    setIsUnlocking(true);
    try {
      await unlock(adminToken.trim());
      setAdminStatus('Admin access unlocked for this browser session.');
      setAdminToken('');
    } catch (error) {
      setAdminStatus(getApiErrorMessage(error, 'Unable to unlock admin access.'));
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLock = () => {
    lock();
    setAdminStatus('Admin access cleared. The app is back in read-only mode.');
  };

  return (
    <div className="settings-page">
      <section className="page-intro card">
        <span className="section-kicker">System controls</span>
        <h1 className="page-title">Settings</h1>
        <p className="page-intro__copy">
          Public visitors can inspect the shared portfolio. Only an unlocked admin session can change holdings, watchlist entries, or shared settings.
        </p>
        <p className="readonly-note">
          {isChecking
            ? 'Checking this browser session for admin access...'
            : isUnlocked
            ? 'Admin access is active for this browser session.'
            : 'This browser is in read-only mode until you unlock admin access.'}
        </p>
      </section>

      <Card className="settings-section">
        <h2 className="settings-section__title">Admin Access</h2>
        <form className="admin-panel" onSubmit={handleUnlock}>
          <Input
            label="Admin Token"
            type="password"
            value={adminToken}
            onChange={(e) => {
              setAdminToken(e.target.value);
              setAdminStatus('');
            }}
            disabled={isChecking || isUnlocking || isUnlocked}
            placeholder="Enter admin token"
          />
          <div className="settings-actions">
            <Button type="submit" variant="primary" disabled={isChecking || isUnlocking || isUnlocked}>
              {isUnlocking ? 'Unlocking...' : isUnlocked ? 'Admin Unlocked' : 'Unlock Editing'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleLock} disabled={!isUnlocked}>
              Lock Session
            </Button>
          </div>
        </form>
        {(adminStatus || settingsMeta.errorMessage) && (
          <p className={adminStatus.toLowerCase().includes('unlock') && !adminStatus.toLowerCase().includes('unable') ? 'text-positive' : adminStatus ? 'text-muted' : 'text-negative'}>
            {adminStatus || settingsMeta.errorMessage}
          </p>
        )}
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
        <Input
          label="Refresh Interval (seconds)"
          type="number"
          min="10"
          max="3600"
          value={settings.refreshIntervalSec}
          disabled={disableWrites}
          onChange={(e) =>
            update('refreshIntervalSec', parseInt(e.target.value) || 60)
          }
        />
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
            <p className="text-muted">Download the shared portfolio as a JSON snapshot.</p>
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
            {!canEdit && <p className="text-muted">Admin unlock required for import.</p>}
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
            {!canEdit && <p className="text-muted">Admin unlock required for PDF import.</p>}
          </div>
          <div className="settings-action-group">
            <Button variant="danger" onClick={handleReset} disabled={disableWrites}>
              Reset All Data
            </Button>
            <p className="text-muted">
              Replace the shared portfolio with the default seeded dataset.
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
