import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhTranslation from './locales/zh.json';
import enTranslation from './locales/en.json';

const resources = {
  zh: {
    translation: zhTranslation
  },
  en: {
    translation: enTranslation
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'zh', // Use stored language or default to zh
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
