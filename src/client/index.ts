/**
 * Tokensforce plugin, browser half. It registers the login onboarding step
 * (the first-run way to obtain a gateway credential) and the TokensForce
 * settings card (the repeatable add-a-group path). Provider profiles land in
 * the stock `llm-pi-ai` namespace through the settings and credentials wire
 * APIs; no host-side services are contributed.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the settings shell's SlotMap merge (the
// 'settings.onboarding' and 'settings.section' entries).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TokensforceOnboarding } from './Onboarding.tsx'
import { TokensforceSection } from './Section.tsx'
import type { TokensforceWizardInjected } from './Onboarding.tsx'
import { ReadinessStore, WizardController } from './store.ts'
import { en, zh, type TokensforceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The tokensforce onboarding + settings card copy. */
    'settings.tokensforce': TokensforceKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.tokensforce'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on each slot through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Register the onboarding step and the settings section once their slot
 * declarations are on the ledger, sharing one readiness join, one wizard
 * controller, and one wire face.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-tokensforce: copy dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const readiness = new ReadinessStore(connection.api)
  const wizard = new WizardController(connection.api)
  const t = ctx.locale.bind(NS) as (key: TokensforceKey) => string
  const injected = (): TokensforceWizardInjected => ({
    readiness,
    wizard,
    api: connection.api,
    t,
    hooks: { readiness: readiness.store, wizard: wizard.store },
  })

  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'tokensforce',
    order: 10,
    inject: injected,
  }, TokensforceOnboarding))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'tokensforce',
    order: 12,
    label: () => t('nav'),
    inject: injected,
  }, TokensforceSection))
}
