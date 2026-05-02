import type { Lang } from './messages';

export const I18N_STORAGE_KEY = 'fayafolio.language';

export function getInitialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(I18N_STORAGE_KEY);
    if (stored === 'en' || stored === 'ar') return stored;
  } catch {
    // ignore
  }

  // Default to Arabic when no persisted preference exists.
  return 'ar';
}

export function persistLang(lang: Lang) {
  try {
    window.localStorage.setItem(I18N_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
