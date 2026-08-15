import { describe, expect, it } from 'vitest'
import {
  buildProviderDraft, decideOnboarding, deriveKeyRef,
  planGroupStep, planOrgStep, tokenExpiry,
} from '../src/client/logic.ts'
import type { ReadinessState } from '../src/client/logic.ts'

const org = (id: number, current = false) => ({
  id, name: `org-${id}`, org_no: String(1000 + id), plan: 'basic',
  role: 'org_member', current, balance: 10,
})

const group = (groupId: number) => ({
  id: groupId * 10, group_id: groupId, group_name: `组-${groupId}`,
  role: 'user', api_key: `sk-${groupId}`,
})

describe('planOrgStep', () => {
  it('reports none when the account has no org', () => {
    expect(planOrgStep([])).toEqual({ kind: 'none' })
  })
  it('takes a single org outright, current or not', () => {
    expect(planOrgStep([org(1)])).toEqual({ kind: 'single', org: org(1) })
    expect(planOrgStep([org(2, true)])).toEqual({ kind: 'single', org: org(2, true) })
  })
  it('asks when the account belongs to several orgs', () => {
    const orgs = [org(1, true), org(2)]
    expect(planOrgStep(orgs)).toEqual({ kind: 'pick', orgs })
  })
})

describe('planGroupStep', () => {
  it('reports none when the org has no group', () => {
    expect(planGroupStep([])).toEqual({ kind: 'none' })
  })
  it('takes a single group outright (it carries its own key)', () => {
    expect(planGroupStep([group(3)])).toEqual({ kind: 'single', group: group(3) })
  })
  it('asks when the org has several groups', () => {
    const groups = [group(3), group(4)]
    expect(planGroupStep(groups)).toEqual({ kind: 'pick', groups })
  })
})

describe('buildProviderDraft', () => {
  it('names the route after the group id and derives the conventional key ref', () => {
    const draft = buildProviderDraft('https://gw.example.com', group(7), ['deepseek-chat', 'gpt-4o'])
    expect(draft.route).toBe('tokensforce-7')
    expect(draft.keyRef).toBe('TOKENSFORCE_7_API_KEY')
    expect(draft.profile.apiKeyEnv).toBe('TOKENSFORCE_7_API_KEY')
  })
  it('points the profile at the relay OpenAI endpoint with the visible models', () => {
    const draft = buildProviderDraft('https://gw.example.com/', group(7), ['deepseek-chat'])
    expect(draft.profile.api).toBe('openai-completions')
    expect(draft.profile.baseURL).toBe('https://gw.example.com/v1')
    expect(draft.profile.models).toEqual([{ id: 'deepseek-chat', name: 'deepseek-chat' }])
    expect(draft.profile.displayName).toBe('TokensForce · 组-7')
    expect(draft.apiKey).toBe('sk-7')
  })
})

describe('decideOnboarding', () => {
  const state = (over: Partial<ReadinessState>): ReadinessState => ({
    status: 'ready', error: null, anyUsable: false, ...over,
  })
  it('waits while the join loads', () => {
    expect(decideOnboarding(state({ status: 'idle' }))).toBe('wait')
    expect(decideOnboarding(state({ status: 'loading' }))).toBe('wait')
  })
  it('skips when any provider is already usable', () => {
    expect(decideOnboarding(state({ anyUsable: true }))).toBe('skip')
  })
  it('skips when the join cannot be read (matching the official step)', () => {
    expect(decideOnboarding(state({ status: 'error', error: 'boom' }))).toBe('skip')
  })
  it('prompts only on a loaded join with no usable route', () => {
    expect(decideOnboarding(state({}))).toBe('prompt')
  })
})

describe('deriveKeyRef', () => {
  it('follows the Models page convention', () => {
    expect(deriveKeyRef('tokensforce-12')).toBe('TOKENSFORCE_12_API_KEY')
    expect(deriveKeyRef('anthropic')).toBe('ANTHROPIC_API_KEY')
  })
})

describe('tokenExpiry', () => {
  it('decodes the exp claim', () => {
    const payload = { exp: 2000000000 }
    const jwt = `x.${btoa(JSON.stringify(payload))}.y`
    expect(tokenExpiry(jwt)).toBe(2000000000 * 1000)
  })
  it('returns undefined for unreadable tokens', () => {
    expect(tokenExpiry('not-a-jwt')).toBeUndefined()
    expect(tokenExpiry('x.###.y')).toBeUndefined()
  })
})
