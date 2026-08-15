/**
 * Shared chrome for the tokensforce wizard surfaces: one injected stylesheet
 * (class prefix `tf-`) and the small building blocks the wizard and the
 * settings card compose. Kept dependency-free besides the Modal primitive so
 * the surfaces stay restyleable without touching flow code.
 */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'

const STYLE_ID = 'dsh-tokensforce-styles'

const CSS = `
.tf-dialog { width: min(66rem, calc(100vw - 3rem)); }
.tf-lightbox { width: min(80rem, calc(100vw - 2.5rem)); }
.tf-body { display: flex; flex-direction: column; gap: 0.75rem; }
.tf-narrow { width: 100%; max-width: 30rem; margin: 0 auto; }
.tf-title { margin: 0; font-size: 1.1rem; font-weight: 600; }
.tf-hint { margin: 0; color: var(--dsh-dim, #888); font-size: 0.85rem; line-height: 1.4; }
.tf-frame { width: 100%; height: calc(100vh - 7rem); min-height: 30rem; display: block; border: none; border-radius: 24px 24px 0 0; background: transparent; }
.tf-skipChip { position: absolute; top: 10px; left: 12px; z-index: 2; padding: 0.15rem 0.6rem; border-radius: 999px; border: 1px solid var(--dsh-border, #555); background: var(--dsh-bg, rgba(127,127,127,0.35)); color: inherit; font-size: 0.78rem; cursor: pointer; opacity: 0.75; }
.tf-skipChip:hover { opacity: 1; }
.tf-list { display: flex; flex-direction: column; gap: 0.4rem; }
.tf-option { display: flex; align-items: baseline; gap: 0.5rem; text-align: left; padding: 0.5rem 0.7rem; border-radius: 6px; border: 1px solid var(--dsh-border, #555); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.tf-option:hover { border-color: var(--dsh-accent, #4a9eff); }
.tf-optionName { font-weight: 600; }
.tf-optionMeta { color: var(--dsh-dim, #888); font-size: 0.8rem; }
.tf-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
.tf-button { padding: 0.4rem 0.9rem; border-radius: 6px; border: 1px solid var(--dsh-border, #555); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.tf-button:disabled { opacity: 0.5; cursor: default; }
.tf-primary { border-color: var(--dsh-accent, #4a9eff); background: var(--dsh-accent, #4a9eff); color: #fff; }
.tf-error { margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px; border: 1px solid #b33; color: #d66; font-size: 0.85rem; }
.tf-busy { display: flex; align-items: center; gap: 0.5rem; color: var(--dsh-dim, #888); font-size: 0.9rem; }
.tf-spinner { width: 0.9rem; height: 0.9rem; border-radius: 50%; border: 2px solid var(--dsh-border, #555); border-top-color: var(--dsh-accent, #4a9eff); animation: tf-spin 0.8s linear infinite; }
@keyframes tf-spin { to { transform: rotate(360deg); } }
.tf-card { display: flex; flex-direction: column; gap: 0.5rem; }
`

/** Insert the stylesheet once per document. */
export function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}

const ignoreImplicitDismiss = (): void => {}

/**
 * Blocking dialog with the application root kept inert, matching the
 * onboarding chrome contract the settings shell expects from steps. The bare
 * variant carries no wizard chrome of its own — the embedded login page IS
 * the dialog face.
 */
export function WizardModal({ title, children, bare = false }: {
  title: string
  children: ReactNode
  bare?: boolean
}): ReactNode {
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    const appRoot = document.getElementById('root')
    if (appRoot === null) return
    const previous = appRoot.inert
    appRoot.inert = true
    return () => { appRoot.inert = previous }
  }, [])
  useEffect(() => { if (!bare) titleRef.current?.focus() }, [bare])
  if (bare) {
    return (
      <Modal open title={title} onClose={ignoreImplicitDismiss} headless className="tf-lightbox">
        {children}
      </Modal>
    )
  }
  return (
    <Modal open title={title} onClose={ignoreImplicitDismiss} headless className="tf-dialog">
      <div className="tf-body">
        <h2 ref={titleRef} className="tf-title" tabIndex={-1}>{title}</h2>
        {children}
      </div>
    </Modal>
  )
}

/** One selectable row of an org/group picker. */
export function OptionRow({
  name, meta, badge, onPick, disabled,
}: {
  name: string
  meta?: string
  badge?: string
  onPick: () => void
  disabled?: boolean
}): ReactNode {
  return (
    <button type="button" className="tf-option" onClick={onPick} disabled={disabled}>
      <span className="tf-optionName">{name}</span>
      {badge !== undefined && <span className="tf-optionMeta">{badge}</span>}
      {meta !== undefined && <span className="tf-optionMeta">{meta}</span>}
    </button>
  )
}

/** Inline busy indicator with text. */
export function Busy({ text }: { text: string }): ReactNode {
  return (
    <div className="tf-busy"><span className="tf-spinner" aria-hidden />{text}</div>
  )
}

/** Failure text with optional retry. */
export function ErrorBox({ text, onRetry, retryLabel }: {
  text: string
  onRetry?: () => void
  retryLabel?: string
}): ReactNode {
  return (
    <>
      <p className="tf-error">{text}</p>
      {onRetry !== undefined && (
        <div className="tf-actions">
          <button type="button" className="tf-button" onClick={onRetry}>{retryLabel}</button>
        </div>
      )}
    </>
  )
}
