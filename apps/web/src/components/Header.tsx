import { Moon, Plus, Sun } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { openBlank } from '../editor/open-document.ts';
import { useMediaQuery, WIDE_SCREEN } from '../media.ts';
import { useStrings } from '../i18n/locale.ts';
import { useTheme } from '../theme.ts';
import { Button } from './Button.tsx';
import { HistoryControls } from './HistoryControls.tsx';
import { LanguageToggle } from './LanguageToggle.tsx';
import { ShareMenu } from './ShareMenu.tsx';
import { TemplatesMenu } from './TemplatesMenu.tsx';

/**
 * Fixed application bar: the product name, what it does, the templates, undo and redo,
 * templates, sharing and files, the language and the theme. The theme state lives here,
 * so a theme change re-renders only the header while the page blends into the
 * new colours.
 */
export function Header() {
  const strings = useStrings();
  const [theme, toggleTheme] = useTheme();
  const wide = useMediaQuery(WIDE_SCREEN);
  const themeLabel = theme === 'dark' ? strings.header.themeToLight : strings.header.themeToDark;
  return (
    <header className="relative z-30 flex h-13 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4">
      <div className="flex min-w-0 items-baseline gap-4">
        {/* Wordmark: capitals by CSS, so assistive technology still reads the word. */}
        <h1 className="inline-block -skew-x-[8deg] text-lg font-bold tracking-[0.06em] uppercase">
          {strings.appName}
        </h1>
        <p className="hidden truncate text-sm text-muted md:block">{strings.tagline}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.header.newDiagram}
          title={strings.header.newDiagram}
          onClick={() => openBlank(wide ? 'LR' : 'TB')}
        >
          <Plus size={18} aria-hidden="true" />
        </Button>
        <TemplatesMenu />
        <HistoryControls />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        <ShareMenu />
        <LanguageToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={toggleTheme}
          className="overflow-hidden"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={theme}
              initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
              transition={{ duration: 0.3 }}
              className="flex"
            >
              {theme === 'dark' ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </m.span>
          </AnimatePresence>
        </Button>
      </div>
    </header>
  );
}
