import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { en, type Strings } from './en.ts';
import { es } from './es.ts';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Where the language chosen with the switch is kept. */
export const LOCALE_KEY = 'archdraft:locale';

const DICTIONARIES: Readonly<Record<Locale, Strings>> = { en, es };

export function stringsFor(locale: Locale): Strings {
  return DICTIONARIES[locale];
}

/** The other language: the one the switch changes to. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'es' : 'en';
}

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

/** The language chosen before in this browser, or Spanish if the browser prefers it, or English. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (isLocale(saved)) return saved;
  } catch (error) {
    console.warn('Could not read the language preference', error);
  }
  const preferred = navigator.languages[0] ?? navigator.language;
  return preferred.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export interface LocaleState {
  readonly locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** Language of the interface. The page's `lang` attribute follows it. */
export function createLocaleStore(locale: Locale = 'en') {
  return createStore<LocaleState>()((set) => ({
    locale,
    setLocale: (next) => {
      try {
        localStorage.setItem(LOCALE_KEY, next);
      } catch (error) {
        // Storage can be blocked; the choice still applies for this visit.
        console.warn('Could not save the language preference', error);
      }
      document.documentElement.lang = next;
      set({ locale: next });
    },
  }));
}

export const localeStore = createLocaleStore(detectLocale());
document.documentElement.lang = localeStore.getState().locale;

export function useLocale(): Locale {
  return useStore(localeStore, (state) => state.locale);
}

/** Texts in the current language; the component re-renders when the language changes. */
export function useStrings(): Strings {
  return DICTIONARIES[useLocale()];
}

/**
 * Texts in the current language, for code outside components, such as the
 * reasons an edit was rejected. They stay as written if the language changes.
 */
export function currentStrings(): Strings {
  return DICTIONARIES[localeStore.getState().locale];
}
