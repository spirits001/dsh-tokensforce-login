/**
 * Browser-side tokensforce gateway client. The plugin calls the deployed
 * site's JSON API directly from the browser (the gateway answers a wildcard
 * CORS policy with bearer-token auth, no cookies), while the model traffic
 * itself goes through the host-side provider profile written at the end of
 * the wizard. Only the endpoints the login wizard needs after the embedded
 * login page hands back a token are modeled here; the login form, including
 * its captcha, lives inside the embedded site.
 */

/** One organization (企业) the logged-in user belongs to. */
export interface TokensforceOrg {
  id: number
  name: string
  /** Globally unique numeric string used for joining by org number. */
  org_no: string
  plan: string
  /** Org-level role of this user: `org_super_admin` | `org_member` | … */
  role: string
  /** Whether this org is the token's current org. */
  current: boolean
  /** Org wallet balance in CNY. */
  balance: number
}

/** One group (组) membership row of the current org; the API key is per user per group. */
export interface TokensforceGroup {
  /** User-group row id; rotate-key addresses this one. */
  id: number
  /** The group entity id; globally unique, used to name the provider route. */
  group_id: number
  group_name: string
  role: string
  /** Plaintext `sk-` key of this membership. */
  api_key: string
}

/** Gateway facts for the current org + group: relay base and visible models. */
export interface TokensforceKeyInfo {
  /** Scheme://host of the deployment as derived from the request. */
  host: string
  /** Model ids visible to the group. */
  models: string[]
  openai_endpoint: string
  anthropic_endpoint: string
}

/** Human text for a failed gateway call, whatever shape the rejection takes. */
export { messageOf } from './logic.ts'

/** Assert a gateway JSON body shape without trusting it. */
function expectObject(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error(`tokensforce: ${what} response is not an object`)
  }
  return body as Record<string, unknown>
}

function expectString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`tokensforce: ${what} is missing or not a string`)
  }
  return value
}

function orgsOf(body: unknown): TokensforceOrg[] {
  const raw = expectObject(body, 'orgs').orgs
  if (!Array.isArray(raw)) throw new Error('tokensforce: orgs response has no orgs list')
  return raw.map((entry) => {
    const org = expectObject(entry, 'org')
    return {
      id: org.id as number,
      name: expectString(org.name, 'org name'),
      org_no: String(org.org_no ?? ''),
      plan: String(org.plan ?? ''),
      role: String(org.role ?? ''),
      current: org.current === true,
      balance: typeof org.balance === 'number' ? org.balance : 0,
    }
  })
}

function groupsOf(body: unknown): TokensforceGroup[] {
  const raw = expectObject(body, 'groups').groups
  if (!Array.isArray(raw)) throw new Error('tokensforce: groups response has no groups list')
  return raw.map((entry) => {
    const group = expectObject(entry, 'group')
    return {
      id: group.id as number,
      group_id: group.group_id as number,
      group_name: expectString(group.group_name, 'group name'),
      role: String(group.role ?? ''),
      api_key: expectString(group.api_key, 'group api key'),
    }
  })
}

function keyInfoOf(body: unknown): TokensforceKeyInfo {
  const info = expectObject(body, 'key info')
  const models = info.models
  return {
    host: expectString(info.host, 'gateway host'),
    models: Array.isArray(models) ? models.filter((id): id is string => typeof id === 'string') : [],
    openai_endpoint: String(info.openai_endpoint ?? '/v1/chat/completions'),
    anthropic_endpoint: String(info.anthropic_endpoint ?? '/v1/messages'),
  }
}

/**
 * Token-authed calls against one tokensforce deployment.
 * Every method re-reads the token, so a `switch-org` token swap is visible
 * to the next call without reconstructing the client.
 */
export class TokensforceClient {
  /**
   * @param origin - deployment origin, e.g. `https://tokensforce.com` (no trailing slash, no path).
   * @param token - mutable holder for the bearer JWT; `switch-org` replaces its value.
   */
  constructor(
    private readonly origin: string,
    private readonly token: { value: string },
  ) {}

  /** Organizations the user belongs to, with the token's current org marked. */
  async listOrgs(signal?: AbortSignal): Promise<TokensforceOrg[]> {
    return orgsOf(await this.call('/api/user/orgs', { method: 'GET' }, signal))
  }

  /**
   * Switch the token's current org. The gateway re-issues a new JWT scoped to
   * the target org; the shared holder is updated so subsequent calls use it.
   * @param orgId - target org id.
   * @returns the orgs as the new token sees them (cheapest consistency check).
   */
  async switchOrg(orgId: number, signal?: AbortSignal): Promise<TokensforceOrg[]> {
    const body = await this.call('/api/user/switch-org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    }, signal)
    const swapped = expectObject(body, 'switch-org')
    this.token.value = expectString(swapped.token, 'switch-org token')
    return this.listOrgs(signal)
  }

  /** Group memberships of the current org; each row carries its own API key. */
  async listGroups(signal?: AbortSignal): Promise<TokensforceGroup[]> {
    return groupsOf(await this.call('/api/user/groups', { method: 'GET' }, signal))
  }

  /**
   * Relay base URL and visible model ids. With a group id the models are the
   * chosen group's view; without one the org-wide default.
   * @param groupId - target group id, when one is already chosen.
   */
  async keyInfo(groupId?: number, signal?: AbortSignal): Promise<TokensforceKeyInfo> {
    const query = groupId === undefined ? '' : `?group_id=${groupId}`
    return keyInfoOf(await this.call(`/api/user/key${query}`, { method: 'GET' }, signal))
  }

  private async call(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(`${this.origin}${path}`, {
      ...init,
      ...(signal !== undefined ? { signal } : {}),
      headers: { authorization: `Bearer ${this.token.value}`, ...init.headers },
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`tokensforce: ${path} failed (${response.status})${text.length > 0 ? `: ${text.slice(0, 200)}` : ''}`)
    }
    return response.json()
  }
}
