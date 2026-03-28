import React, {createContext, useContext, useEffect, useState} from 'react';
import {zh} from '@/i18n/zh';
import {en} from '@/i18n/en';

type Language = 'zh' | 'en';

const translations = { zh, en };

export type TranslationKey = keyof typeof zh;

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('zhipinyun-lang');
    return (saved === 'zh' || saved === 'en') ? saved : 'zh';
  });

  useEffect(() => {
    localStorage.setItem('zhipinyun-lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: TranslationKey) => {
    return translations[lang][key] || key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
};
