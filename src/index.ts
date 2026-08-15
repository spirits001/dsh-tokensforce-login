/**
 * Node half of the tokensforce plugin. This bundle is browser-only: it
 * contributes no host-side services, only the client roster row plus the
 * patch layer that disables the official DeepSeek route. The provider engine
 * is the stock `llm-pi-ai` plugin; profiles land in its settings namespace
 * through the wire APIs the login wizard calls.
 */

export const name = 'ui-tokensforce'

export const inject: string[] = []

export function apply(): void {}
