import { NODE_CATALOG, NODE_CATEGORIES } from '@archdraft/core';
import { Button } from '../components/Button.tsx';
import { Panel } from '../components/Panel.tsx';
import { TextAreaField } from '../components/TextAreaField.tsx';
import { strings } from '../strings.ts';

const PALETTE_GROUPS = NODE_CATEGORIES.map((category) => ({
  category,
  definitions: Object.values(NODE_CATALOG).filter((definition) => definition.category === category),
}));

/** Left panel: describe the system in words and browse the components to place. */
export function BuildPanel() {
  return (
    <div className="flex flex-col gap-8">
      <Panel title={strings.prompt.title}>
        <TextAreaField
          label={strings.prompt.label}
          placeholder={strings.prompt.placeholder}
          hint={strings.prompt.hint}
        />
        <Button variant="primary" disabled>
          {strings.prompt.generate}
        </Button>
      </Panel>

      <Panel title={strings.palette.title} description={strings.palette.hint}>
        <div className="flex flex-col gap-4">
          {PALETTE_GROUPS.map(({ category, definitions }) => (
            <div key={category}>
              <h3 className="font-narrow text-sm font-medium text-lead">
                {strings.palette.categories[category]}
              </h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {definitions.map((definition) => (
                  <li
                    key={definition.kind}
                    title={definition.description}
                    className="rounded-control border border-rule bg-sheet px-2 py-1 text-xs"
                  >
                    {definition.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
