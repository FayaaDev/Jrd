import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { exportAll, importAll, resetAll } from '../lib/storage';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { Settings as SettingsType } from '../schemas/settings';

export default function Settings() {
  const [settings, setSettings] = useSettings();
  const [importStatus, setImportStatus] = useState<string>('');

  const update = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleExport = () => {
    // exportAll() returns a JSON string
    const jsonStr = exportAll();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fayafolio-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // importAll() takes a JSON string and validates + saves
        importAll(reader.result as string);
        setImportStatus('Import successful! Reload the page to see changes.');
      } catch {
        setImportStatus('Import failed: invalid or malformed file.');
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-imported
    e.target.value = '';
  };

  const handleReset = () => {
    if (
      window.confirm(
        'Reset ALL data? This will delete all holdings, watchlist, and settings. This cannot be undone.'
      )
    ) {
      resetAll();
      window.location.reload();
    }
  };

  return (
    <div className="settings-page">
      <section className="page-intro card">
        <span className="section-kicker">System controls</span>
        <h1 className="page-title">Settings</h1>
        <p className="page-intro__copy">
          Tune the portfolio lens, choose your preferred surface mode, and control how the data set moves in and out of the app.
        </p>
      </section>

      <Card className="settings-section">
        <h2 className="settings-section__title">Portfolio</h2>
        <Input
          label="Base Currency"
          value={settings.baseCurrency}
          onChange={(e) =>
            update('baseCurrency', e.target.value.toUpperCase().slice(0, 3))
          }
          maxLength={3}
          placeholder="SAR"
        />
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">Data Providers</h2>
        <Input label="Price Provider" value="Auto by market (Alpaca + Sahmk + snapshot fallback)" readOnly />
        <Input label="FX Provider" value="Frankfurter (ECB rates)" readOnly />
        <Input
          label="Refresh Interval (seconds)"
          type="number"
          min="10"
          max="3600"
          value={settings.refreshIntervalSec}
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
            <Button variant="secondary" onClick={handleExport}>
              Export Data
            </Button>
            <p className="text-muted">Download all your data as a JSON file.</p>
          </div>
          <div className="settings-action-group">
            <label className="btn btn--secondary btn--md" style={{ cursor: 'pointer' }}>
              Import Data
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
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
            <Button variant="danger" onClick={handleReset}>
              Reset All Data
            </Button>
            <p className="text-muted">
              Permanently delete all holdings, watchlist, and settings.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
