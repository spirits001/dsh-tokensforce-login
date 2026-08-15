/**
 * Pure wizard logic: decisions, mappings, and browser-local session storage,
 * free of harness runtime imports so the flows are unit-testable and the
 * client bundle stays minimal. Controllers in `store.ts` orchestrate these.
 */

import type { TokensforceGroup, TokensforceOrg } from './api.ts'

/**
 * The tokensforce deployment this distribution logs into. The wizard goes
 * straight to the embedded login against this origin; an OEM or self-hosted
 * build changes this one constant.
 */
export const SITE_ORIGIN = 'https://tokensforce.com'

/** Human text for a rejected call, whatever shape the rejection takes. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The conventional credential reference for a provider route, matching the
 * Models page's derivation so a key stored here is indistinguishable from one
 * typed there.
 */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/* ------------------------------------------------------------------ readiness */

/** Readiness snapshot: the reduced provider/settings/credential join. */
export interface ReadinessState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Load failure text. */
  error: string | null
  /** Whether the user already has at least one usable provider route. */
  anyUsable: boolean
}

/** The onboarding decision derived from {@link ReadinessState}. */
export type OnboardingDecision = 'wait' | 'skip' | 'prompt'

/**
 * Decide whether the login wizard should appear. Any usable provider ends
 * the step exactly like the official DeepSeek step; a load failure cannot be
 * helped by prompting; only a loaded join with none leaves the wizard as the
 * way forward.
 * @param state - the readiness snapshot.
 * @returns the decision for the step shell.
 */
export function decideOnboarding(state: ReadinessState): OnboardingDecision {
  if (state.status !== 'ready' && state.status !== 'error') return 'wait'
  if (state.status === 'error') return 'skip'
  return state.anyUsable ? 'skip' : 'prompt'
}

/* ------------------------------------------------------------------ step planning */

/** What to do about the org step once orgs are loaded. */
export type OrgStep =
  | { kind: 'none' }
  | { kind: 'single'; org: TokensforceOrg }
  | { kind: 'pick'; orgs: readonly TokensforceOrg[] }

/**
 * Resolve the org step. A single membership needs no switch: the login token
 * already scopes to it. More than one asks the user.
 * @param orgs - organizations the user belongs to.
 */
export function planOrgStep(orgs: readonly TokensforceOrg[]): OrgStep {
  const only = orgs[0]
  if (only === undefined) return { kind: 'none' }
  if (orgs.length === 1) return { kind: 'single', org: only }
  return { kind: 'pick', orgs }
}

/** What to do about the group step once groups are loaded. */
export type GroupStep =
  | { kind: 'none' }
  | { kind: 'single'; group: TokensforceGroup }
  | { kind: 'pick'; groups: readonly TokensforceGroup[] }

/**
 * Resolve the group step. Memberships carry their own key, so a single one is
 * chosen outright; more than one asks the user.
 * @param groups - group memberships of the current org.
 */
export function planGroupStep(groups: readonly TokensforceGroup[]): GroupStep {
  const only = groups[0]
  if (only === undefined) return { kind: 'none' }
  if (groups.length === 1) return { kind: 'single', group: only }
  return { kind: 'pick', groups }
}

/* ------------------------------------------------------------------ draft */

/** One provider profile about to land in the `llm-pi-ai` namespace. */
export interface ProviderDraft {
  /** Provider route: the `providers` dict key. */
  route: string
  /** Credential reference the profile names and the key stores under. */
  keyRef: string
  /** The profile value to set. */
  profile: {
    displayName: string
    api: 'openai-completions'
    baseURL: string
    apiKeyEnv: string
    models: { id: string; name: string }[]
  }
  /** The plaintext key to store at {@link ProviderDraft.keyRef}. */
  apiKey: string
}

/**
 * Map a chosen group into the writes the wizard performs: one route named
 * after the (globally unique) group id, the conventional credential
 * reference, an OpenAI-completions profile against the relay, and the group's
 * own key.
 * @param host - relay scheme://host from the gateway's key info.
 * @param group - the chosen membership row.
 * @param models - model ids visible to the group.
 */
export function buildProviderDraft(
  host: string,
  group: TokensforceGroup,
  models: readonly string[],
): ProviderDraft {
  const route = `tokensforce-${group.group_id}`
  return {
    route,
    keyRef: deriveKeyRef(route),
    profile: {
      displayName: `TokensForce · ${group.group_name}`,
      api: 'openai-completions',
      baseURL: `${host.replace(/\/+$/, '')}/v1`,
      apiKeyEnv: deriveKeyRef(route),
      models: models.map(id => ({ id, name: id })),
    },
    apiKey: group.api_key,
  }
}

/* ------------------------------------------------------------------ token */

/**
 * Decode a JWT's `exp` claim without validating it (the gateway validates;
 * this only avoids starting calls that are already doomed).
 * @param token - the JWT.
 * @returns the expiry in epoch milliseconds, or undefined when unreadable.
 */
export function tokenExpiry(token: string): number | undefined {
  const payload = token.split('.')[1]
  if (payload === undefined) return undefined
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    const exp = (decoded as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : undefined
  } catch {
    return undefined
  }
}

/** localStorage key holding the last successful login for resume. */
const SESSION_KEY = 'dsh-tokensforce.session'

/** Persist a login so later add-group flows can skip the embedded login. */
export function saveSession(origin: string, token: string): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ origin, token }))
  } catch {
    // Storage unavailable (privacy mode): every flow logs in afresh.
  }
}

/** The last saved login, when one exists and its token is unexpired. */
export function loadSession(): { origin: string; token: string } | undefined {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as { origin?: unknown; token?: unknown }
    if (typeof parsed.origin !== 'string' || typeof parsed.token !== 'string') return undefined
    const expiry = tokenExpiry(parsed.token)
    if (expiry !== undefined && expiry <= Date.now()) return undefined
    return { origin: parsed.origin, token: parsed.token }
  } catch {
    return undefined
  }
}

/** Drop the saved login. */
export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to drop when storage is unavailable.
  }
}

/* ------------------------------------------------------------------ wizard state */

/** Wizard snapshot phase; every transition is owned by the wizard controller. */
export type WizardPhase =
  | 'login'
  | 'linking'
  | 'orgs'
  | 'groups'
  | 'saving'
  | 'done'

/** Wizard snapshot. */
export interface WizardState {
  phase: WizardPhase
  /** Failure text for the current phase; null while nothing failed. */
  error: string | null
  /** Whether a background call is running. */
  busy: boolean
  /** Deployment origin (the distribution's site). */
  origin: string | undefined
  /** Bearer JWT once the embedded login hands one over. */
  token: string | undefined
  /** Orgs as the current token sees them. */
  orgs: readonly TokensforceOrg[]
  /** Groups of the resolved org. */
  groups: readonly TokensforceGroup[]
  /** The membership whose key becomes the provider credential. */
  selected: TokensforceGroup | undefined
  /** Provider route the last save wrote, for retry decisions. */
  savedRoute: string | undefined
}
