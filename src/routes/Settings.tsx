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
import { useI18n } from '../i18n/useI18n';

export default function Settings() {
  const sessionQuery = authClient.useSession();
  const [settings, setSettings, settingsMeta] = useSettings();
  const [importStatus, setImportStatus] = useState<string>('');
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const { lang, setLang, t } = useI18n();

  const session = sessionQuery.data;
  const isAdmin = isAdminSession(session);
  const role = getSessionRole(session);
  const canEdit = settingsMeta.canEdit && !sessionQuery.isPending;
  const disableWrites = !canEdit || settingsMeta.isSaving;

  const update = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    if (!canEdit) return;
    if (key === 'language') {
      setLang(value as SettingsType[K] as 'en' | 'ar');
    }
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
      setImportStatus(getApiErrorMessage(error, t('settings_export_failed')));
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
        setImportStatus(t('settings_import_ok'));
      } catch (error) {
        setImportStatus(getApiErrorMessage(error, t('settings_import_bad')));
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
        t('settings_reset_confirm')
      )
    ) {
      void resetPortfolio()
        .then(() => {
          setImportStatus(t('settings_reset_ok'));
        })
        .catch((error) => {
          setImportStatus(getApiErrorMessage(error, t('settings_reset_failed')));
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
        <span className="section-kicker">{t('settings_kicker')}</span>
        <h1 className="page-title">{t('settings_title')}</h1>
        <p className="page-intro__copy">
          {t('settings_lede')}
        </p>
        <p className="readonly-note">
          {t('settings_signed_in_as')} {session?.user?.email ?? '—'} {isAdmin ? t('settings_with_admin') : ''}
        </p>
      </section>

      <Card className="settings-section">
        <h2 className="settings-section__title">{t('settings_account')}</h2>
        <Input label={lang === 'ar' ? 'الاسم' : 'Name'} value={session?.user?.name ?? '—'} readOnly />
        <Input label={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={session?.user?.email ?? '—'} readOnly />
        <Input label={lang === 'ar' ? 'الدور' : 'Role'} value={role} readOnly />
        <div className="settings-actions">
          {isAdmin && <Link to="/admin" className="btn btn--secondary btn--md">{t('settings_open_admin')}</Link>}
          <Button type="button" variant="secondary" onClick={handleSignOut}>{t('nav_sign_out')}</Button>
        </div>
        {settingsMeta.errorMessage && <p className="text-negative">{settingsMeta.errorMessage}</p>}
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">{t('settings_portfolio')}</h2>
        <Input
          label={t('settings_base_currency')}
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
        <h2 className="settings-section__title">{t('settings_appearance')}</h2>
        <Select
          label={t('language')}
          value={settings.language}
          disabled={disableWrites}
          onChange={(e) => update('language', e.target.value as SettingsType['language'])}
          options={[
            { value: 'en', label: t('english') },
            { value: 'ar', label: t('arabic') },
          ]}
        />
        <Select
          label={t('settings_theme')}
          value={settings.theme}
          disabled={disableWrites}
          onChange={(e) =>
            update('theme', e.target.value as SettingsType['theme'])
          }
          options={[
            { value: 'system', label: t('settings_theme_system') },
            { value: 'light', label: t('settings_theme_light') },
            { value: 'dark', label: t('settings_theme_dark') },
          ]}
        />
      </Card>

      <Card className="settings-section">
        <h2 className="settings-section__title">{t('settings_data')}</h2>
        <div className="settings-actions">
          <div className="settings-action-group">
            <Button variant="secondary" onClick={() => void handleExport()}>
              {t('settings_export')}
            </Button>
            <p className="text-muted">{t('settings_export_help')}</p>
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
              {t('settings_import')}
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
              {t('settings_import_pdf')}
            </Button>
            <p className="text-muted">{t('settings_import_pdf_help')}</p>
          </div>
          <div className="settings-action-group">
            <Button variant="danger" onClick={handleReset} disabled={disableWrites}>
              {t('settings_reset_all')}
            </Button>
            <p className="text-muted">
              {t('settings_reset_help')}
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
