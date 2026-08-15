/**
 * TokensForce settings-header action: the repeatable re-entry into the
 * wizard without occupying a settings nav cell. The Models page owns the
 * per-provider editing of profiles the wizard writes; this action owns the
 * guided add-a-group path.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokensforceWizardInjected } from './Onboarding.tsx'
import { WizardBody } from './Onboarding.tsx'
import { loadSession, saveSession } from './store.ts'
import { WizardModal, ensureStyles } from './chrome.tsx'

/** Slot owner props plus the feature's injected dependencies. */
export type TokensforceActionProps =
  PropsRuntime<'settings.action'> & InjectFace<TokensforceWizardInjected>

/**
 * Render the header action button, and the wizard lightbox once launched.
 * @param props - settings-shell owner state and feature dependencies.
 * @returns the action button (and the modal while open).
 */
export function TokensforceAction(props: TokensforceActionProps): ReactNode {
  const { useWizard, wizard, t } = props
  const state = useWizard(snapshot => snapshot)
  const [open, setOpen] = useState(false)

  useEffect(() => { ensureStyles() }, [])

  if (open) {
    return (
      <>
        <button type="button" className="tf-button tf-actionButton" onClick={() => setOpen(false)}>
          {t('onboardingTitle')}
        </button>
        <WizardModal title={t('onboardingTitle')} bare={state.phase === 'login'}>
          <WizardBody
            state={state}
            wizard={wizard}
            t={t}
            onToken={(origin, token) => {
              saveSession(origin, token)
              wizard.begin(origin, token)
            }}
            complete={() => {
              setOpen(false)
              wizard.reset()
            }}
            doneLabel={t('close')}
          />
        </WizardModal>
      </>
    )
  }

  return (
    <button
      type="button"
      className="tf-button tf-actionButton"
      onClick={() => {
        const session = loadSession()
        if (session !== undefined) wizard.begin(session.origin, session.token)
        else wizard.reset()
        setOpen(true)
      }}
    >
      {t('onboardingTitle')}
    </button>
  )
}
