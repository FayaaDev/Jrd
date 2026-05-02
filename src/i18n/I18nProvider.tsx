import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type Lang } from './messages';
import { applyDocumentLang, getInitialLang, persistLang } from './core';
import { I18nContext, type I18nContextValue } from './context';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getInitialLang());

  // Stable identity to avoid effects re-firing on every render.
  const setLang = useCallback((next: Lang) => setLangState(next), []);

  useEffect(() => {
    persistLang(lang);
    applyDocumentLang(lang);
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      lang,
      setLang,
      t: (key) => messages[lang][key] ?? messages.en[key] ?? String(key),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
