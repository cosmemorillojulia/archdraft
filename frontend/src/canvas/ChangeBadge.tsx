import { Minus, PenLine, Plus } from 'lucide-react';
import type { ChangeMark } from '../ai/assistant-store.ts';
import { useStrings } from '../i18n/locale.ts';
import { MARK_COLOR } from './appearance.ts';

const ICONS = { added: Plus, updated: PenLine, removed: Minus } as const;

/**
 * Says on a node what the change on the canvas does to it, in words and not
 * only in colour, so it reads without telling green from red.
 */
export function ChangeBadge({ mark, className = '' }: { mark: ChangeMark; className?: string }) {
  const strings = useStrings();
  const Icon = ICONS[mark];
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 text-[9.5px] leading-4 font-semibold whitespace-nowrap text-surface ${className}`}
      style={{ backgroundColor: MARK_COLOR[mark] }}
    >
      <Icon size={10} strokeWidth={2.5} aria-hidden="true" />
      {strings.assistant.marks[mark]}
    </span>
  );
}
