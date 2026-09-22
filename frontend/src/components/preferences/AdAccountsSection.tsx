import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api';
import type { MetaAccount } from '@/lib/types';
import { eligibleMetaAccounts, metaAccountLabel } from '@/components/campaigns/liveCampaigns';
import { RESULT_DEFINITIONS, type ResultKind } from '@/components/statistics/statisticsModel';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { LinearCheckIcon } from '@/icons/LinearIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { useAppStore } from '@/store/useAppStore';

type LoadState = 'loading' | 'ready' | 'error';
type DeclaredResult = '' | ResultKind;

const RESULT_CHOICES: Array<{ value: DeclaredResult; label: string }> = [
  { value: '', label: 'Not declared' },
  { value: 'leads', label: RESULT_DEFINITIONS.leads.label },
  { value: 'registrations', label: RESULT_DEFINITIONS.registrations.label },
  { value: 'purchases', label: RESULT_DEFINITIONS.purchases.label },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Could not save the cost target. Please try again.';
}

function declaredResultOf(account: MetaAccount): DeclaredResult {
  const stored = account.primary_result;
  return stored === 'leads' || stored === 'registrations' || stored === 'purchases' ? stored : '';
}

/** The stored target as editable text; an undeclared target is an empty field. */
function targetTextOf(account: MetaAccount): string {
  const stored = account.target_cost_per_result;
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? String(stored) : '';
}

interface AccountRowProps {
  account: MetaAccount;
  onSaved: (updated: { primary_result: DeclaredResult; target_cost_per_result: number | null }) => void;
  onError: (message: string) => void;
}

const AdAccountRow: React.FC<AccountRowProps> = ({ account, onSaved, onError }) => {
  const [result, setResult] = useState<DeclaredResult>(declaredResultOf(account));
  const [targetText, setTargetText] = useState(targetTextOf(account));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setResult(declaredResultOf(account));
    setTargetText(targetTextOf(account));
  }, [account]);

  const save = useCallback(async (nextResult: DeclaredResult, nextTargetText: string) => {
    const trimmed = nextTargetText.trim().replace(',', '.');
    const parsed = trimmed ? Number(trimmed) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      onError('A cost target must be a number above zero.');
      setTargetText(targetTextOf(account));
      return;
    }
    // Clearing the primary result clears the target with it: a cost target
    // without the event it applies to cannot be interpreted.
    const target = nextResult ? parsed : null;
    if (nextResult === declaredResultOf(account) && target === (account.target_cost_per_result ?? null)) {
      return;
    }

    setSaving(true);
    onError('');
    try {
      await apiRequest(`/api/accounts/${encodeURIComponent(account.account_id)}/cost-target`, {
        method: 'PATCH',
        body: JSON.stringify({ primary_result: nextResult, target_cost_per_result: target }),
      });
      onSaved({ primary_result: nextResult, target_cost_per_result: target });
    } catch (saveError) {
      onError(errorMessage(saveError));
      setResult(declaredResultOf(account));
      setTargetText(targetTextOf(account));
    } finally {
      setSaving(false);
    }
  }, [account, onError, onSaved]);

  const selectedLabel = RESULT_CHOICES.find((choice) => choice.value === result)?.label ?? 'Not declared';

  return (
    <div className="preferences-row-item">
      <div className="preferences-row-copy">
        <span className="preferences-row-title">{metaAccountLabel(account)}</span>
        <span className="preferences-row-desc">
          {result
            ? `Target cost per ${RESULT_DEFINITIONS[result].noun.replace(/s$/, '')}${account.currency ? `, in ${account.currency}` : ''}`
            : 'No primary result declared'}
        </span>
      </div>

      <div className="preferences-row-control">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="compact"
              disabled={saving}
              aria-label={`Primary result for ${metaAccountLabel(account)}`}
            >
              {selectedLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Primary result</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={result}
              onValueChange={(value) => {
                const next = value as DeclaredResult;
                setResult(next);
                void save(next, targetText);
              }}
            >
              {RESULT_CHOICES.map((choice) => (
                <DropdownMenuRadioItem key={choice.value || 'none'} value={choice.value}>
                  <span>{choice.label}</span>
                  {result === choice.value && <LinearCheckIcon size={13} aria-hidden="true" />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          className="preferences-row-input preferences-row-input--narrow"
          aria-label={`Target cost per result for ${metaAccountLabel(account)}`}
          inputMode="decimal"
          placeholder={result ? 'Not set' : '—'}
          value={targetText}
          disabled={saving || !result}
          maxLength={12}
          onChange={(event) => setTargetText(event.target.value)}
          onBlur={() => void save(result, targetText)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setTargetText(targetTextOf(account));
          }}
        />
      </div>
    </div>
  );
};

/**
 * Where an ad account declares what it is buying and the cost it is worth
 * buying at. Statistics judges a row only against a target stored here.
 */
export const AdAccountsSection: React.FC = () => {
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const refresh = useCallback(async () => {
    setState('loading');
    setLoadError('');
    try {
      const response = await apiRequest<MetaAccount[]>('/api/accounts');
      setAccounts(eligibleMetaAccounts(response));
      setState('ready');
    } catch (error) {
      setLoadError(errorMessage(error));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applySaved = (accountId: string, saved: {
    primary_result: DeclaredResult;
    target_cost_per_result: number | null;
  }) => {
    setAccounts((current) => current.map((account) => (
      account.account_id === accountId ? { ...account, ...saved } : account
    )));
  };

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Ad accounts</h1>
      </div>

      <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Cost target</h3>
        </div>
        <p className="preferences-section-note">
          Declare the conversion event each ad account is buying and the cost it is worth buying
          at. Statistics compares a campaign against this target; without one it reports cost per
          result without a verdict. The target is read in the ad account's own currency.
        </p>

        {state === 'loading' && (
          <DataState title="Loading ad accounts…" detail="Reading imported Meta accounts from this workspace." />
        )}
        {state === 'error' && (
          <DataState
            title="Couldn't load ad accounts"
            detail={loadError}
            role="alert"
            actionLabel="Retry"
            onAction={() => void refresh()}
          />
        )}
        {state === 'ready' && accounts.length === 0 && (
          <DataState
            title="Connect an ad account"
            detail="Import a Meta ad account in Ads Manager before declaring a cost target."
            actionLabel="Open Ads Manager"
            onAction={() => setActiveTab('campaigns')}
          />
        )}
        {state === 'ready' && accounts.length > 0 && (
          <section className="preferences-card-container preferences-card-container--divided">
            {accounts.map((account) => (
              <AdAccountRow
                key={account.account_id}
                account={account}
                onSaved={(saved) => applySaved(account.account_id, saved)}
                onError={setSaveError}
              />
            ))}
          </section>
        )}

        {saveError && (
          <p role="alert" className="preferences-row-error">
            {saveError}
          </p>
        )}
      </div>
    </>
  );
};
