import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../schemas/settings';
import { loadSettings, saveSettings } from '../lib/storage';

export function useSettings(): [Settings, (s: Settings) => void] {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    const theme = settings.theme;
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [settings.theme]);

  const setSettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  return [settings, setSettings];
}
