import React, { useEffect } from 'react';
import { ApiError } from '@/lib/api';
import { toast } from '@/ui/toast';
import { RuleLabelPicker } from './RuleLabelPicker';
import { useDialogStore } from '@/models/dialogStore';
import { rulesStore, useRulesStore } from '@/models/rulesStore';

const errorText = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Please try again.';

/**
 * The Rules page's one label picker: a row's labels, L on a row, or L on a
 * selection. With several rules a label on only some of them shows a dash,
 * and choosing it puts it on all of them, as in Linear.
 */
export const RuleLabelPickerHost: React.FC = () => {
  const picker = useDialogStore((state) => state.ruleLabelPicker);
  const rules = useRulesStore((state) => state.rules);
  const close = useDialogStore((state) => state.closeRuleLabelPicker);
  // Leaving the page closes it; coming back does not reopen it.
  useEffect(() => close, [close]);
  if (!picker) return null;

  const targets = rules.filter((rule) => picker.ruleIds.includes(rule.id));
  if (targets.length === 0) return null;
  const counts = new Map<string, number>();
  for (const rule of targets) for (const id of rule.labelIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const checked = [...counts].filter(([, count]) => count === targets.length).map(([id]) => id);
  const mixed = [...counts].filter(([, count]) => count < targets.length).map(([id]) => id);

  const apply = (labelId: string, on: boolean) => {
    if (targets.length === 1) {
      const current = rulesStore.rules.find((rule) => rule.id === targets[0].id)?.labelIds ?? [];
      void rulesStore.setRuleLabels(targets[0].id, on ? [...current, labelId] : current.filter((id) => id !== labelId));
    } else {
      void rulesStore.changeRulesLabels(targets.map((rule) => rule.id), on ? { add: [labelId] } : { remove: [labelId] });
    }
  };

  return (
    <RuleLabelPicker
      // A new set of rules starts a fresh picker.
      key={picker.ruleIds.join(',')}
      checked={checked}
      mixed={mixed}
      anchorRect={picker.anchorRect}
      onToggle={apply}
      onCreate={async (name) => {
        try {
          const label = await rulesStore.createRuleLabel(name);
          apply(label.id, true);
        } catch (error) {
          toast.error("Couldn't create the label", errorText(error));
        }
      }}
      onClose={close}
    />
  );
};
