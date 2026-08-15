/**
 * Wizard controllers: the readiness join loader and the login-flow state
 * machine. Pure decisions, mappings, and session storage live in `logic.ts`
 * (re-exported here as the one import path for components); this file owns
 * orchestration — wire calls, tokensforce calls, and phase transitions.
 */

import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { TokensforceClient } from './api.ts'
import type { TokensforceGroup, TokensforceOrg } from './api.ts'
import {
  SITE_ORIGIN, buildProviderDraft, clearSession, messageOf, planGroupStep, planOrgStep, tokenExpiry,
} from './logic.ts'
import type { ReadinessState, WizardState } from './logic.ts'

export * from './logic.ts'

/** Read out one settings path from a namespace value (plain nested records). */
function getPath(value: unknown, path: readonly string[]): unknown {
  let node: unknown = value
  for (const key of path) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** The credential reference a resolved profile names, when it names one. */
function keyRefOf(namespaces: ReadonlyMap<string, { value: unknown }>, ns: string, path: readonly string[]): string | undefined {
  const namespace = namespaces.get(ns)
  const profile = namespace === undefined ? undefined : getPath(namespace.value, path)
  const ref = typeof profile === 'object' && profile !== null
    ? (profile as { apiKeyEnv?: unknown }).apiKeyEnv
    : undefined
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

/**
 * Readiness controller: loads the provider/settings/credential join once per
 * call, latest-wins, and reduces it to `anyUsable`.
 */
export class ReadinessStore {
  /** Snapshot the step shell renders from. */
  readonly store: SnapshotStore<ReadinessState> = createSnapshotStore<ReadinessState>({
    status: 'idle', error: null, anyUsable: false,
  })

  private generation = 0

  /**
   * @param api - the wire face (settings/credentials/llm domains).
   */
  constructor(private readonly api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>) {}

  /**
   * Refetch the join and reduce it to `anyUsable`. A route is usable when it
   * is active and its named credential reference (if any) is stored; a route
   * naming no reference authenticates through the provider's own path.
   */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'loading'; s.error = null })
    try {
      const [providersResponse, settingsResponse] = await Promise.all([
        this.api.llm.providers({}),
        this.api.settings.describe({}),
      ])
      if (!providersResponse.result.ok) throw new Error(providersResponse.result.error.message)
      if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
      const namespaces = new Map(settingsResponse.result.value.namespaces.map(view => [view.ns, view]))
      const routes = providersResponse.result.value.providers.map((entry) => ({
        active: entry.active,
        keyRef: keyRefOf(namespaces, entry.settingsNs, entry.settingsPath),
      }))
      const refs = [...new Set(routes.flatMap(route => route.keyRef === undefined ? [] : [route.keyRef]))]
      let configuredRefs = new Set<string>()
      if (refs.length > 0) {
        const response = await this.api.credentials.describe({ refs })
        if (response.result.ok) {
          configuredRefs = new Set(
            Object.entries(response.result.value.credentials)
              .filter(([, view]) => view.configured)
              .map(([ref]) => ref),
          )
        }
      }
      const anyUsable = routes.some(route =>
        !route.active ? false : route.keyRef === undefined ? true : configuredRefs.has(route.keyRef))
      if (generation !== this.generation) return
      this.store.update((s) => { s.status = 'ready'; s.anyUsable = anyUsable })
    } catch (error) {
      if (generation !== this.generation) return
      this.store.update((s) => { s.status = 'error'; s.error = messageOf(error) })
    }
  }
}

/**
 * The login wizard controller. The shell owns the server-address and iframe
 * steps' UI; everything from the token onward flows through here and lands
 * the provider profile plus its credential through the wire APIs.
 */
export class WizardController {
  /** Snapshot the wizard renders from. */
  readonly store: SnapshotStore<WizardState> = createSnapshotStore<WizardState>({
    phase: 'login', error: null, busy: false, origin: SITE_ORIGIN, token: undefined,
    orgs: [], groups: [], selected: undefined, savedRoute: undefined,
  })

  private readonly token = { value: '' }
  private client: TokensforceClient | undefined

  /**
   * @param api - the wire face (settings/credentials domains).
   */
  constructor(private readonly api: Pick<IApiClient, 'settings' | 'credentials'>) {}

  /** Continue after the embedded login produced a token. */
  begin(origin: string, token: string): void {
    this.token.value = token
    this.client = new TokensforceClient(origin, this.token)
    this.store.set({
      phase: 'linking', error: null, busy: true, origin, token,
      orgs: [], groups: [], selected: undefined, savedRoute: undefined,
    })
    void this.enterOrgs()
  }

  /** Reset to the embedded login step, keeping the saved login. */
  reset(): void {
    this.client = undefined
    this.store.set({
      phase: 'login', error: null, busy: false, origin: SITE_ORIGIN, token: undefined,
      orgs: [], groups: [], selected: undefined, savedRoute: undefined,
    })
  }

  /** Reset to the embedded login step and drop the saved login. */
  restart(): void {
    clearSession()
    this.reset()
  }

  /** Resume past login with a stored token when it is still unexpired. */
  resume(origin: string, token: string): boolean {
    const expiry = tokenExpiry(token)
    if (expiry !== undefined && expiry <= Date.now()) return false
    this.begin(origin, token)
    return true
  }

  /** Retry the failed phase from its natural restart point. */
  retry(): void {
    const { phase, origin, token } = this.store.getSnapshot()
    if (phase !== 'orgs' && phase !== 'groups') return
    if (origin === undefined || token === undefined) return
    if (phase === 'orgs') this.begin(origin, token)
    else void this.enterGroups()
  }

  /** Fail the current phase with text; the shell offers skip/retry. */
  private fail(error: unknown): void {
    this.store.update((s) => { s.busy = false; s.error = messageOf(error) })
  }

  private async enterOrgs(): Promise<void> {
    const client = this.client
    if (client === undefined) return
    try {
      const orgs = await client.listOrgs()
      const step = planOrgStep(orgs)
      if (step.kind === 'none') {
        this.store.update((s) => { s.busy = false; s.error = 'no-org' })
        return
      }
      if (step.kind === 'single') {
        await this.enterGroups()
        return
      }
      this.store.update((s) => { s.busy = false; s.orgs = step.orgs; s.phase = 'orgs'; s.error = null })
    } catch (error) {
      this.fail(error)
    }
  }

  /** Pick an org (multi-org case): switch the token scope, then load groups. */
  async pickOrg(orgId: number): Promise<void> {
    const client = this.client
    if (client === undefined) return
    this.store.update((s) => { s.busy = true; s.error = null })
    try {
      const orgs = await client.switchOrg(orgId)
      const target = orgs.find(org => org.id === orgId)
      if (target === undefined) throw new Error('tokensforce: switch-org did not land on the chosen org')
      await this.enterGroups()
    } catch (error) {
      this.fail(error)
    }
  }

  private async enterGroups(): Promise<void> {
    const client = this.client
    if (client === undefined) return
    this.store.update((s) => { s.busy = true; s.error = null })
    try {
      const groups = await client.listGroups()
      const step = planGroupStep(groups)
      if (step.kind === 'none') {
        this.store.update((s) => { s.busy = false; s.error = 'no-group' })
        return
      }
      if (step.kind === 'single') {
        await this.resolveGroup(step.group)
        return
      }
      this.store.update((s) => { s.busy = false; s.groups = step.groups; s.phase = 'groups'; s.error = null })
    } catch (error) {
      this.fail(error)
    }
  }

  /** Pick a membership (multi-group case): key info, then the writes. */
  async pickGroup(rowId: number): Promise<void> {
    const group = this.store.getSnapshot().groups.find(candidate => candidate.id === rowId)
    if (group === undefined) return
    this.store.update((s) => { s.busy = true; s.error = null })
    try {
      await this.resolveGroup(group)
    } catch (error) {
      this.fail(error)
    }
  }

  private async resolveGroup(group: TokensforceGroup): Promise<void> {
    const client = this.client
    if (client === undefined) return
    this.store.update((s) => { s.selected = group; s.busy = true })
    const info = await client.keyInfo(group.group_id)
    // The session origin, not the gateway-reported host, names the relay:
    // the report derives its scheme from forwarded headers a deployment may
    // not set, so an https login could otherwise mint an http baseURL.
    const relayOrigin = this.store.getSnapshot().origin ?? info.host
    const draft = buildProviderDraft(relayOrigin, group, info.models)
    this.store.update((s) => { s.phase = 'saving'; s.busy = true })
    const described = await this.api.settings.describe({})
    if (!described.result.ok) throw new Error(described.result.error.message)
    const namespace = described.result.value.namespaces.find(view => view.ns === 'llm-pi-ai')
    if (namespace === undefined) throw new Error('llm-pi-ai settings namespace not found')
    const mutated = await this.api.settings.mutate({
      ns: 'llm-pi-ai',
      ops: [{ op: 'set', path: ['providers', draft.route], value: draft.profile }],
      expectedRevision: namespace.revision,
    })
    if (!mutated.result.ok) throw new Error(mutated.result.error.message)
    const stored = await this.api.credentials.set({ ref: draft.keyRef, value: draft.apiKey })
    if (!stored.result.ok) throw new Error(stored.result.error.message)
    this.store.update((s) => { s.busy = false; s.phase = 'done'; s.savedRoute = draft.route; s.error = null })
  }
}

export type { TokensforceGroup, TokensforceOrg }
