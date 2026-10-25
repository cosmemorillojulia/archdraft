import { AnimatePresence, m } from 'motion/react';
import { type ComponentType, useId } from 'react';
import { followLanguage } from '../editor/open-document.ts';
import { localeStore, otherLocale, useLocale, useStrings, type Locale } from '../i18n/locale.ts';
import { Button } from './Button.tsx';

/** Union flag, for English. Drawn as in its specification, with the diagonals counterchanged. */
function UnionFlag() {
  // Ids of SVG clip paths must be unique on the page and safe inside url().
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className="size-full">
      <clipPath id={`${id}-flag`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={`${id}-diagonals`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${id}-flag)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#${id}-diagonals)`}
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

/** Flag of Spain without the coat of arms, as used for the language. */
function SpanishFlag() {
  return (
    <svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" className="size-full">
      <rect width="3" height="2" fill="#AA151B" />
      <rect y="0.5" width="3" height="1" fill="#F1BF00" />
    </svg>
  );
}

const FLAGS: Record<Locale, ComponentType> = { en: UnionFlag, es: SpanishFlag };

/**
 * One button that switches the interface between English and Spanish. Like
 * the theme button, it shows where it takes you: the flag of the other
 * language, which turns over when pressed. An untouched template follows the
 * new language.
 */
export function LanguageToggle() {
  const strings = useStrings();
  const locale = useLocale();
  const target = otherLocale(locale);
  const Flag = FLAGS[target];
  const { label, lang } = strings.header.language;

  const switchLanguage = () => {
    localeStore.getState().setLocale(target);
    followLanguage(locale);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      lang={lang}
      aria-label={label}
      title={label}
      onClick={switchLanguage}
      className="[perspective:240px]"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={target}
          initial={{ opacity: 0, rotateY: -90 }}
          animate={{ opacity: 1, rotateY: 0 }}
          exit={{ opacity: 0, rotateY: 90 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          data-flag={target}
          className="relative flex h-3.5 w-5 overflow-hidden rounded-[3px] after:absolute after:inset-0 after:rounded-[3px] after:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_18%,transparent)]"
        >
          <Flag />
        </m.span>
      </AnimatePresence>
    </Button>
  );
}
