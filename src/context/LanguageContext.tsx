import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { Language, Translations } from '@/types/i18n';
import { en, zh } from '@/data/translations';

export interface LanguageContextValue {
  language: Language;
  t: Translations;
  toggleLanguage: () => void;
}

const translationMap: Record<Language, Translations> = { en, zh };

export const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  t: en,
  toggleLanguage: () => {},
});

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem('cct-language');
    if (stored === 'en' || stored === 'zh') return stored;
  } catch { /* SSR / private browsing */ }
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'zh' : 'en';
      try { localStorage.setItem('cct-language', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const t = translationMap[language];

  return (
    <LanguageContext.Provider value={{ language, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
