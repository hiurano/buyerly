import { LinearTabs } from './LinearTabs';
import type { FilterOption } from '@/components/filters/filterModel';

interface Props {
  facets: { id: string; label: string; options: FilterOption[] }[];
  activeTab: string;
  selection: { fieldId: string; value: string } | null;
  onTabChange: (id: string) => void;
  onSelect: (selection: { fieldId: string; value: string } | null) => void;
}

export function LinearFacetSidebar({ facets, activeTab, selection, onTabChange, onSelect }: Props) {
  const field = facets.find(facet => facet.id === activeTab) ?? facets[0];
  return <aside className="linear-facet-sidebar" aria-label="Quick filters">
    <LinearTabs tabs={facets.map(facet => ({ id: facet.id, label: facet.label }))}
      activeTabId={field?.id ?? ''} onChange={onTabChange} aria-label="Quick filter categories" />
    <div className="linear-facet-options" aria-label={field?.label}>
      {field?.options.length ? field.options.map(option => {
        const active = selection?.fieldId === field.id && selection.value === option.value;
        return <button key={option.value} type="button" className="linear-facet-row" aria-pressed={active}
          onClick={() => onSelect(active ? null : { fieldId: field.id, value: option.value })}>
          <span className="linear-facet-name">{option.label}</span>
          <span className="linear-facet-action">{active ? 'Clear filter' : 'View'}</span>
          <span className="linear-facet-count">{option.count}</span>
        </button>;
      }) : <p className="linear-facet-empty">No matching items</p>}
    </div>
  </aside>;
}
