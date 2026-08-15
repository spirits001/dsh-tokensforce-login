/**
 * Server-address step plus the embedded login window. The deployed site's own
 * login page (with its captcha) renders in an iframe; on success it posts the
 * session token back, which this component validates by origin and forwards.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { normalizeOrigin } from './api.ts'
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
 * Ask for the deployment address, then run the site login in an iframe.
 * @param props.onToken - called once with the chosen origin and the token.
 * @param props.t - feature copy.
 * @returns the address form or the embedded login window.
 */
export function LoginFrame({ onToken, t }: {
  onToken: (origin: string, token: string) => void
  t: (key: LoginKey) => string
}): ReactNode {
  const [input, setInput] = useState('')
  const [origin, setOrigin] = useState<string | undefined>(undefined)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => { ensureStyles() }, [])

  useEffect(() => {
    if (origin === undefined) return
    const listener = (event: MessageEvent): void => {
      if (event.origin !== origin) return
      const data = event.data as { type?: unknown; token?: unknown } | null
      if (typeof data !== 'object' || data === null) return
      if (data.type !== LOGIN_MESSAGE || typeof data.token !== 'string' || data.token.length === 0) return
      onToken(origin, data.token)
    }
    window.addEventListener('message', listener)
    return () => { window.removeEventListener('message', listener) }
  }, [origin, onToken])

  if (origin === undefined) {
    return (
      <>
        <div>
          <label className="tf-label" htmlFor="tf-address">{t('addressLabel')}</label>
          <input
            id="tf-address"
            className="tf-input"
            type="text"
            value={input}
            placeholder={t('addressPlaceholder')}
            spellCheck={false}
            autoComplete="url"
            onChange={(event) => { setInput(event.target.value); setInvalid(false) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              const parsed = normalizeOrigin(input)
              if (parsed === undefined) setInvalid(true)
              else setOrigin(parsed)
            }}
          />
        </div>
        <p className="tf-hint">{invalid ? t('addressInvalid') : t('addressHint')}</p>
        <div className="tf-actions">
          <button
            type="button"
            className="tf-button tf-primary"
            disabled={input.trim().length === 0}
            onClick={() => {
              const parsed = normalizeOrigin(input)
              if (parsed === undefined) setInvalid(true)
              else setOrigin(parsed)
            }}
          >
            {t('continueToLogin')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="tf-hint">{t('loginHint')}</p>
      <iframe
        className="tf-frame"
        title={t('loginFrameTitle')}
        src={`${origin}/login?embed=${encodeURIComponent(window.location.origin)}&theme=${detectTheme()}`}
      />
    </>
  )
}
