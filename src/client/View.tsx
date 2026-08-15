/**
 * The TokensForce conversation-view tab: one more tab beside 对话/轨迹,
 * carrying the site's console dashboard. The tab is session-independent —
 * it renders the embedded login when no unexpired session exists, and the
 * dashboard iframe once the user is signed in (the site keeps its own token
 * from the login handshake, so the console arrives authenticated).
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { loadSession, saveSession } from './store.ts'
import { LoginFrame, detectTheme } from './LoginFrame.tsx'
import { ensureStyles } from './chrome.tsx'

/** Slot runtime props (session kit, unused here) plus the locale seat. */
export type TokensforceViewProps =
  PropsRuntime<'conversation.view'> & PropsLocale<'settings.tokensforce'>

/**
 * Render the dashboard panel: embedded login when signed out or expired,
 * the console dashboard iframe otherwise.
 * @param props - conversation-view runtime props and feature copy.
 * @returns the tab body.
 */
export function TokensforceView(props: TokensforceViewProps): ReactNode {
  const { t } = props
  const [session, setSession] = useState(() => loadSession())

  useEffect(() => { ensureStyles() }, [])

  // Computed once per signed-in mount: a changing src would reload the
  // dashboard mid-use; the cache-buster defeats stale cached documents.
  const consoleSrc = useMemo(() => {
    const cacheTag = Date.now().toString(36)
    return `${session?.origin ?? ''}/console?embed=1&theme=${detectTheme()}&cb=${cacheTag}`
  }, [session])

  if (session === undefined) {
    return (
      <div className="tf-view">
        <div className="tf-viewHead">
          <span className="tf-hint">{t('viewLoginHint')}</span>
        </div>
        <div className="tf-viewLogin">
          <LoginFrame
            variant="panel"
            onToken={(origin, token) => {
              saveSession(origin, token)
              setSession(loadSession())
            }}
            t={t}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="tf-view">
      <iframe className="tf-viewFrame" title={t('viewLabel')} src={consoleSrc} />
    </div>
  )
}
