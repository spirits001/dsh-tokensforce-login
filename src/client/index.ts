/**
 * Tokensforce plugin, browser half. It registers the login onboarding step
 * (the first-run way to obtain a gateway credential) and a settings-header
 * action (the repeatable add-a-group path, without a dedicated nav cell).
 * Provider profiles land in the stock `llm-pi-ai` namespace through the
 * settings and credentials wire APIs; no host-side services are contributed.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the settings shell's SlotMap merge (the
// 'settings.onboarding' and 'settings.action' entries).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the conversation package's SlotMap merge (the
// 'conversation.view' tab entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TokensforceOnboarding } from './Onboarding.tsx'
import { TokensforceAction } from './Action.tsx'
import { TokensforceView } from './View.tsx'
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
 * Register the onboarding step and the settings-header action once their slot
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
  ctx.slots.inject('settings.action', () => ctx.slots.register({
    name: 'settings.action',
    id: 'tokensforce',
    inject: injected,
  }, TokensforceAction))
  // One more tab beside 对话/轨迹: the console dashboard, session-independent.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'tokensforce',
    order: 20,
    locale: NS,
    label: () => t('viewLabel'),
  }, TokensforceView))
}
