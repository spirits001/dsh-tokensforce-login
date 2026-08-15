/**
 * The embedded login window. The deployment site's own login page (with its
 * captcha and its full desktop layout) renders in an iframe sized like a
 * normal browser window; on success it posts the session token back, which
 * this component validates by origin and forwards.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { SITE_ORIGIN } from './logic.ts'
import { ensureStyles } from './chrome.tsx'
import type { TokensforceKey as LoginKey } from './locales.ts'

/** Message the embedded login page sends on success. */
const LOGIN_MESSAGE = 'tokensforce:login'

/**
 * Detect the harness UI's current light/dark so the embedded login page can
 * follow it via the theme param. color-scheme first, then background
 * luminance, then the system preference.
 */
function detectTheme(): 'dark' | 'light' {
  const scheme = getComputedStyle(document.documentElement).colorScheme
  if (scheme.includes('dark')) return 'dark'
  if (scheme.includes('light')) return 'light'
  const channels = getComputedStyle(document.body).backgroundColor.match(/\d+(?:\.\d+)?/g)
  if (channels !== null && channels.length >= 3) {
    const [r = 0, g = 0, b = 0] = channels.map(Number)
    if (0.299 * r + 0.587 * g + 0.114 * b < 128) return 'dark'
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Run the site login in an iframe against the distribution's site.
 * @param props.onToken - called once with the site origin and the token.
 * @param props.t - feature copy.
 * @returns the embedded login window.
 */
export function LoginFrame({ onToken, t }: {
  onToken: (origin: string, token: string) => void
  t: (key: LoginKey) => string
}): ReactNode {
  useEffect(() => { ensureStyles() }, [])

  useEffect(() => {
    const listener = (event: MessageEvent): void => {
      if (event.origin !== SITE_ORIGIN) return
      const data = event.data as { type?: unknown; token?: unknown } | null
      if (typeof data !== 'object' || data === null) return
      if (data.type !== LOGIN_MESSAGE || typeof data.token !== 'string' || data.token.length === 0) return
      onToken(SITE_ORIGIN, data.token)
    }
    window.addEventListener('message', listener)
    return () => { window.removeEventListener('message', listener) }
  }, [onToken])

  return (
    <iframe
      className="tf-frame"
      title={t('loginFrameTitle')}
      src={`${SITE_ORIGIN}/login?embed=${encodeURIComponent(window.location.origin)}&theme=${detectTheme()}`}
    />
  )
}
