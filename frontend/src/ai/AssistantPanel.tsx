import type { Proposal } from '@archdraft/shared';
import { Check, WandSparkles, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
import { Button } from '../components/Button.tsx';
import { FloatingPanel, type PanelPlacement } from '../components/FloatingPanel.tsx';
import { PanelHeader } from '../components/Inspector.tsx';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';
import { useAssistant } from './assistant-store.ts';
import { applyOffered, closeOffer, discardOffered, previewProposal } from './run-assistant.ts';

/** A key per proposal that does not change when the ones before it leave the list. */
const keys = new WeakMap<Proposal, number>();
let nextKey = 0;
function keyOf(proposal: Proposal): number {
  let key = keys.get(proposal);
  if (key === undefined) keys.set(proposal, (key = nextKey++));
  return key;
}

/**
 * Proposals of the assistant (T20): improvements, or a simpler or a more
 * complete design, each with why and what it changes. Pointing at one shows
 * on the canvas what it touches; applying it is one step that undo takes back.
 * It takes the place of the design review and of the inspector while it is open.
 */
export function AssistantPanel({ placement }: { placement: PanelPlacement }) {
  const strings = useStrings();
  const offer = useAssistant((state) => state.offer);
  const headingId = useId();
  if (!offer) return null;
  const { task } = offer;

  return (
    <FloatingPanel placement={placement} labelledBy={headingId}>
      <PanelHeader
        headingId={headingId}
        title={strings.assistant.titles[task]}
        subtitle={strings.assistant.actionHints[task]}
        closeLabel={strings.assistant.close}
        onClose={closeOffer}
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
            <WandSparkles size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
      />
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
        <AnimatePresence initial={false}>
          {offer.proposals.map((proposal, index) => (
            <ProposalRow key={keyOf(proposal)} proposal={proposal} index={index} />
          ))}
        </AnimatePresence>
      </ul>
    </FloatingPanel>
  );
}

function ProposalRow({ proposal, index }: { proposal: Proposal; index: number }) {
  const strings = useStrings();
  const [applying, setApplying] = useState(false);
  const { nodes, edges } = proposal.changes;
  const changes = strings.assistant.changes({
    added: nodes.added.length + edges.added.length,
    updated: nodes.updated.length + edges.updated.length,
    removed: nodes.removed.length + edges.removed.length,
  });

  return (
    <m.li
      layout
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
      onPointerEnter={() => previewProposal(proposal)}
      onPointerLeave={() => previewProposal(null)}
      onFocus={() => previewProposal(proposal)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) previewProposal(null);
      }}
      className="rounded-xl px-2.5 py-2 transition-colors hover:bg-ink/4 focus-within:bg-ink/4"
    >
      <h3 className="text-sm font-semibold">{proposal.title}</h3>
      {proposal.rationale !== '' && (
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{proposal.rationale}</p>
      )}
      <p className="mt-1 text-xs text-muted tabular-nums">{changes}</p>
      <div className="mt-2 flex items-center gap-1">
        <Button
          variant="primary"
          aria-label={strings.assistant.applyLabel(proposal.title)}
          disabled={applying}
          onClick={() => {
            setApplying(true);
            void applyOffered(index).finally(() => setApplying(false));
          }}
          className="h-8 gap-1.5 px-3 text-[13px]"
        >
          <Check size={15} aria-hidden="true" />
          {strings.assistant.apply}
        </Button>
        <Button
          variant="ghost"
          aria-label={strings.assistant.discardLabel(proposal.title)}
          onClick={() => {
            previewProposal(null);
            discardOffered(proposal);
          }}
          className="h-8 gap-1.5 px-2.5 text-[13px]"
        >
          <X size={15} aria-hidden="true" />
          {strings.assistant.discard}
        </Button>
      </div>
    </m.li>
  );
}
