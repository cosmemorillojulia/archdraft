import { AnimatePresence, m } from 'motion/react';
import { followLanguage } from '../editor/open-document.ts';
import { localeStore, otherLocale, useLocale, useStrings } from '../i18n/locale.ts';
import { Button } from './Button.tsx';

/**
 * One button that switches the interface between English and Spanish. It
 * shows the code of the language the interface is in, EN or ES, which rolls
 * to the other one when pressed. An untouched template follows the new
 * language. The accessible name starts with the visible code, so that it can
 * be said aloud to press it.
 */
export function LanguageToggle() {
  const strings = useStrings();
  const locale = useLocale();
  const { code, label, hint } = strings.header.language;

  const switchLanguage = () => {
    localeStore.getState().setLocale(otherLocale(locale));
    followLanguage(locale);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={hint}
      onClick={switchLanguage}
      className="overflow-hidden"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={locale}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          data-locale={locale}
          className="text-xs font-semibold tracking-[0.06em]"
        >
          {code}
        </m.span>
      </AnimatePresence>
    </Button>
  );
}
