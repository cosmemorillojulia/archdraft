import { type ArchitectureGraph, isContainerKind } from '@archdraft/core';
import { useId } from 'react';
import { strings } from '../strings.ts';

interface CanvasProps {
  graph: ArchitectureGraph;
}

/**
 * The drawing sheet. Until the interactive canvas exists (T08) it shows the
 * sheet frame and the title block of the current diagram.
 */
export function Canvas({ graph }: CanvasProps) {
  return (
    <section aria-label={strings.canvas.label} className="flex min-h-0 flex-1 p-3 lg:p-6">
      <div className="drafting-grid relative flex flex-1 flex-col border-2 border-graphite/80 outline outline-rule outline-offset-4">
        <p className="m-auto max-w-xs px-6 py-12 text-center text-sm text-lead">
          {strings.canvas.unavailable}
        </p>
        <TitleBlock graph={graph} />
      </div>
    </section>
  );
}

/** The cartouche of a technical drawing: what the sheet shows and its key figures. */
function TitleBlock({ graph }: CanvasProps) {
  const titleId = useId();
  const components = graph.nodes.filter((node) => !isContainerKind(node.kind)).length;
  const facts = [
    { label: strings.canvas.provider, value: strings.canvas.providers[graph.provider] },
    { label: strings.canvas.components, value: String(components) },
    { label: strings.canvas.connections, value: String(graph.edges.length) },
  ];

  return (
    <section
      aria-labelledby={titleId}
      className="border-t-2 border-graphite/80 bg-sheet sm:absolute sm:right-0 sm:bottom-0 sm:w-96 sm:border-l-2"
    >
      <div className="border-b border-graphite/40 px-3 py-2">
        <p className="font-narrow text-xs text-lead">{strings.canvas.title}</p>
        <h2 id={titleId} className="font-wide text-lg leading-snug font-semibold tracking-tight">
          {graph.title}
        </h2>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-graphite/40">
        {facts.map(({ label, value }) => (
          <div key={label} className="px-3 py-1.5">
            <dt className="font-narrow text-xs text-lead">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
