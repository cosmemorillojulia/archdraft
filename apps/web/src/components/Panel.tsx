import { type ReactNode, useId } from 'react';

interface PanelProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** A titled section of a side panel, labelled by its heading for assistive technology. */
export function Panel({ title, description, children }: PanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h2 id={headingId} className="font-narrow text-base font-semibold">
          {title}
        </h2>
        {description !== undefined && <p className="text-sm text-lead">{description}</p>}
      </div>
      {children}
    </section>
  );
}
