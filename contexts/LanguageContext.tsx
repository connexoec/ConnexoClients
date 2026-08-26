import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { translations } from '../translations';

type Language = keyof typeof translations;
type TranslationKey = keyof typeof translations['es'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, replacements?: { [key: string]: string }) => string;
}

export const languages: { [key in Language]: string } = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
  pt: 'Português',
  zh: '中文',
  ar: 'العربية',
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getInitialLanguage = (): Language => {
    const storedLang = localStorage.getItem('connexo-lang');
    if (storedLang && translations[storedLang as Language]) {
        return storedLang as Language;
    }
    const browserLang = navigator.language.split('-')[0] as Language;
    if (translations[browserLang]) {
        return browserLang;
    }
    return 'es'; // Default to Spanish
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(getInitialLanguage);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('connexo-lang', lang);
    };

    const t = useCallback((key: TranslationKey, replacements?: { [key: string]: string }): string => {
        let translation = translations[language][key] || translations['en'][key] || key;
        if (replacements) {
            Object.keys(replacements).forEach(placeholder => {
                translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
            });
        }
        return translation;
    }, [language]);

    useEffect(() => {
        document.documentElement.lang = language;
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }, [language]);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
