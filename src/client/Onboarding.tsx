/**
 * Tokensforce first-run step. Readiness derives from the provider/settings/
 * credential join like the official DeepSeek step: any usable provider ends
 * the step, a load failure cannot be helped by prompting, and only a loaded
 * join with no usable route renders the login wizard. The wizard lands the
 * chosen group as one `llm-pi-ai` provider profile plus its credential, so
 * the provider's existence is the persisted completion fact.
 */

import { useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokensforceKey } from './locales.ts'
import type { ReadinessState, WizardState } from './store.ts'
import { ReadinessStore, WizardController, decideOnboarding } from './store.ts'
import { loadSession, saveSession } from './store.ts'
import { Busy, ErrorBox, OptionRow, WizardModal, ensureStyles } from './chrome.tsx'
import { LoginFrame } from './LoginFrame.tsx'

/** Registration-side dependencies of the step and the settings card's wizard. */
export interface TokensforceWizardInjected {
  hooks: {
    /** Readiness join snapshot, bound by the slot renderer. */
    readiness: SnapshotStore<ReadinessState>
    /** Wizard snapshot. */
    wizard: SnapshotStore<WizardState>
  }
  /** Readiness join loader. */
  readiness: ReadinessStore
  /** Login wizard flow controller. */
  wizard: WizardController
  /** Wire face reused by both controllers. */
  api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
  /** Feature copy. */
  t: (key: TokensforceKey) => string
}

/** Slot owner props plus the feature's injected dependencies. */
export type TokensforceOnboardingProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<TokensforceWizardInjected>

/**
 * Prompt a first-run user to connect tokensforce while no provider can serve
 * requests.
 * @param props - settings-shell owner state and feature dependencies.
 * @returns the wizard modal or null when the step needs no intervention.
 */
export function TokensforceOnboarding(props: TokensforceOnboardingProps): ReactNode {
  const { complete, useReadiness, useWizard, readiness, wizard, t } = props
  const readinessState = useReadiness(snapshot => snapshot)
  const state = useWizard(snapshot => snapshot)
  const decision = decideOnboarding(readinessState)

  useEffect(() => { ensureStyles() }, [])

  useEffect(() => {
    if (readinessState.status === 'idle') void readiness.load()
  }, [readiness, readinessState.status])

  useEffect(() => {
    if (decision === 'skip') complete()
  }, [complete, decision])

  // Hooks must precede the decision early-return: the step mounts while the
  // join loads (decision 'wait') and re-renders into the wizard afterwards.
  const onToken = useCallback((origin: string, token: string): void => {
    saveSession(origin, token)
    wizard.begin(origin, token)
  }, [wizard])

  if (decision !== 'prompt') return null

  return (
    <WizardModal title={t('onboardingTitle')} bare={state.phase === 'login'}>
      <WizardBody state={state} wizard={wizard} t={t} onToken={onToken} complete={complete} />
    </WizardModal>
  )
}

/** Wizard phases shared by the onboarding step and the settings card. */
export function WizardBody({ state, wizard, t, onToken, complete, doneLabel }: {
  state: WizardState
  wizard: WizardController
  t: (key: TokensforceKey) => string
  onToken: (origin: string, token: string) => void
  complete?: () => void
  doneLabel?: string
}): ReactNode {
  if (state.phase === 'login') {
    return (
      <>
        {complete !== undefined && (
          <button type="button" className="tf-skipChip" onClick={complete}>{t('skip')}</button>
        )}
        <LoginFrame onToken={onToken} t={t} />
      </>
    )
  }
  if (state.error === 'no-org' || state.error === 'no-group') {
    return (
      <div>
        <ErrorBox text={t(state.error === 'no-org' ? 'noOrg' : 'noGroup')} />
        <div className="tf-actions">
          <button type="button" className="tf-button" onClick={() => wizard.restart()}>
            {t('anotherOrg')}
          </button>
          {complete !== undefined && (
            <button type="button" className="tf-button" onClick={complete}>{t('skip')}</button>
          )}
        </div>
      </div>
    )
  }
  if (state.error !== null) {
    return (
      <div>
        <ErrorBox text={state.error} onRetry={() => wizard.retry()} retryLabel={t('retry')} />
        {complete !== undefined && (
          <div className="tf-actions">
            <button type="button" className="tf-button" onClick={complete}>{t('skip')}</button>
          </div>
        )}
      </div>
    )
  }
  if (state.phase === 'linking') {
    return <div><Busy text={t('loadingOrgs')} /></div>
  }
  if (state.phase === 'orgs') {
    if (state.busy) return <div><Busy text={t('loadingOrgs')} /></div>
    return (
      <div>
        <p className="tf-hint">{t('chooseOrgHint')}</p>
        <div className="tf-list">
          {state.orgs.map(org => (
            <OptionRow
              key={org.id}
              name={org.name}
              {...(org.current ? { badge: t('currentOrg') } : {})}
              meta={`#${org.org_no} · ${t('balance')} ¥${org.balance.toFixed(2)}`}
              onPick={() => { void wizard.pickOrg(org.id) }}
            />
          ))}
        </div>
      </div>
    )
  }
  if (state.phase === 'groups') {
    if (state.busy) return <div><Busy text={t('loadingOrgs')} /></div>
    return (
      <div>
        <p className="tf-hint">{t('chooseGroupHint')}</p>
        <div className="tf-list">
          {state.groups.map(group => (
            <OptionRow
              key={group.id}
              name={group.group_name}
              meta={group.role}
              onPick={() => { void wizard.pickGroup(group.id) }}
            />
          ))}
        </div>
      </div>
    )
  }
  if (state.phase === 'saving') {
    return <div><Busy text={t('saving')} /></div>
  }
  return (
    <div className="tf-doneBody">
      <div className="tf-doneMark" aria-hidden>✓</div>
      <p className="tf-hint">{t('savedDescription')}</p>
      {complete !== undefined && (
        <div className="tf-actions">
          <button type="button" className="tf-button tf-primary" onClick={complete}>
            {doneLabel ?? t('startChat')}
          </button>
        </div>
      )}
    </div>
  )
}
