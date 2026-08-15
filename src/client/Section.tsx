/**
 * TokensForce settings card: the always-available re-entry into the wizard.
 * The Models page keeps its generic provider editor; this card offers the
 * guided path — one click walks org/group selection with the saved login (or
 * a fresh embedded login) and writes the next group as its own provider.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokensforceWizardInjected } from './Onboarding.tsx'
import { WizardBody } from './Onboarding.tsx'
import { loadSession, saveSession } from './store.ts'
import { WizardModal, ensureStyles } from './chrome.tsx'

/** Slot owner props plus the feature's injected dependencies. */
export type TokensforceSectionProps =
  PropsRuntime<'settings.section'> & InjectFace<TokensforceWizardInjected>

/**
 * Render the TokensForce section: description, launch button, and the wizard
 * modal once launched.
 * @param props - settings-shell owner state and feature dependencies.
 * @returns the section body.
 */
export function TokensforceSection(props: TokensforceSectionProps): ReactNode {
  const { useWizard, wizard, t } = props
  const state = useWizard(snapshot => snapshot)
  const [open, setOpen] = useState(false)

  useEffect(() => { ensureStyles() }, [])

  if (!open) {
    return (
      <div className="tf-card">
        <p className="tf-hint">{t('sectionDescription')}</p>
        <div className="tf-actions">
          <button
            type="button"
            className="tf-button tf-primary"
            onClick={() => {
              const session = loadSession()
              if (session !== undefined) wizard.begin(session.origin, session.token)
              else wizard.restart()
              setOpen(true)
            }}
          >
            {t('addGroup')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <WizardModal title={t('onboardingTitle')}>
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
  )
}
