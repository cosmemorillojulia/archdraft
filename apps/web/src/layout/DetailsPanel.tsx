import { Tabs } from '../components/Tabs.tsx';
import { strings } from '../strings.ts';

const TABS = [
  {
    id: 'inspector',
    label: strings.details.inspector,
    content: <p className="text-sm text-lead">{strings.details.inspectorEmpty}</p>,
  },
  {
    id: 'review',
    label: strings.details.review,
    content: <p className="text-sm text-lead">{strings.details.reviewEmpty}</p>,
  },
];

/** Right panel: details of the selection and the design review. */
export function DetailsPanel() {
  return <Tabs label={strings.details.label} tabs={TABS} />;
}
