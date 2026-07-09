import { supabase } from '../lib/supabase'
import { getAiModelConfig } from '../lib/aiModelConfig'

const MODEL_CONFIG = getAiModelConfig()

// Single client source-of-truth for requested model and fallback chain.
export const REQUESTED_MODEL = MODEL_CONFIG.requestedModel
export const FREE_MODEL_FALLBACKS = MODEL_CONFIG.modelFallbacks
export const MODEL_DEFAULTS = {
  requestedModel: REQUESTED_MODEL,
  fallbacks: FREE_MODEL_FALLBACKS
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const AI_PROXY_PATH = '/functions/v1/ai-proxy'
const AI_REQUEST_TIMEOUT_MS = 120000
const AI_CLIENT_DEBUG = import.meta.env.DEV && import.meta.env.VITE_AI_DEBUG === 'true'
// Single-path forensic trace for Tagline "no content" investigations (DEV only).
const TAGLINE_TRACE = import.meta.env.DEV && import.meta.env.VITE_TAGLINE_TRACE === 'true'

const traceTagline = (phase, payload) => {
  if (!TAGLINE_TRACE) return
  console.debug('[aiClient:tagline-trace]', phase, payload)
}

/** Thrown when there is no signed-in user to authenticate the AI request. */
export class AiAuthError extends Error {
  constructor(message = 'You must be signed in to use AI features.') {
    super(message)
    this.name = 'AiAuthError'
    this.isAuthError = true
  }
}

export class AiResponseFormatError extends Error {
  constructor(kind, message, meta = {}) {
    super(message)
    this.name = 'AiResponseFormatError'
    this.kind = kind
    // Non-secret token accounting carried through so callers can log usage even
    // when the response failed to parse. Never contains prompt text.
    this.usage = meta.usage ?? null
    this.modelUsed = meta.modelUsed ?? null
  }
}

const debugLog = (...args) => {
  if (!AI_CLIENT_DEBUG) return
  console.debug('[aiClient]', ...args)
}

// Tolerant JSON extraction. Models in JSON mode occasionally wrap output in
// ```json fences or add leading/trailing prose; rather than burn another credit
// on a retry, we strip wrappers and isolate the outermost JSON span before
// parsing. Truncated/genuinely broken JSON still throws (categorized upstream).
const stripJsonWrapper = (raw) => {
  let text = String(raw).trim()
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()
  }
  return text
}

const extractJsonSpan = (text) => {
  const firstObj = text.indexOf('{')
  const firstArr = text.indexOf('[')
  if (firstObj === -1 && firstArr === -1) return text

  const useArray = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)
  const start = useArray ? firstArr : firstObj
  const closeCh = useArray ? ']' : '}'
  const end = text.lastIndexOf(closeCh)
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1)
  return text
}

// Remove trailing commas before } or ] - a frequent model output quirk that
// strict JSON.parse rejects.
const stripTrailingCommas = (text) => text.replace(/,(\s*[}\]])/g, '$1')

// Best-effort repair for TRUNCATED JSON (the response hit max_tokens mid-object,
// the single biggest cause of "malformed JSON"). Walks the text tracking string
// state and the open {/[ stack, closes a dangling string, drops any partial
// trailing token after the last complete element, then appends the missing
// closers. Recovers a valid object with the incomplete tail dropped.
const repairTruncatedJson = (text) => {
  const stack = []
  let inStr = false
  let esc = false
  let lastStructural = -1 // index of last char at depth that completed an element
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']')
    else if (c === '}' || c === ']') { stack.pop(); lastStructural = i }
    else if (c === ',') lastStructural = i
  }

  let repaired = text
  // If truncation left us inside a string, drop the partial string entirely back
  // to the last completed element (safer than guessing where it should close).
  if (inStr && lastStructural >= 0) {
    repaired = repaired.slice(0, lastStructural + 1)
  }
  // Drop a dangling partial token after the last complete element / comma / colon.
  repaired = repaired.replace(/[:,]\s*("[^"]*)?$/g, '')
  repaired = repaired.replace(/,\s*$/g, '')
  repaired = stripTrailingCommas(repaired)
  // Recompute the closer stack on the trimmed text, then append the closers.
  const closers = []
  let s = false
  let e = false
  for (let i = 0; i < repaired.length; i++) {
    const c = repaired[i]
    if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue }
    if (c === '"') s = true
    else if (c === '{') closers.push('}')
    else if (c === '[') closers.push(']')
    else if (c === '}' || c === ']') closers.pop()
  }
  while (closers.length) repaired += closers.pop()
  return repaired
}

const parseJsonLenient = (content) => {
  const cleaned = stripJsonWrapper(content)
  try {
    return JSON.parse(cleaned)
  } catch { /* fall through to progressively more aggressive recovery */ }

  const span = extractJsonSpan(cleaned)
  try {
    return JSON.parse(stripTrailingCommas(span))
  } catch { /* fall through to truncation repair */ }

  // Last resort: repair a truncated span (drops the incomplete trailing element).
  return JSON.parse(repairTruncatedJson(span))
}

// Appended on the single automatic retry when the first JSON response failed to
// parse or was truncated. Centralized here so no caller re-implements it.
const STRICT_JSON_SUFFIX =
  '\n\nReturn MINIFIED, COMPLETE, valid JSON only - a single line, double-quoted keys and string values, no markdown, no code fences, no commentary, no trailing commas. Ensure every brace and bracket is closed.'

/**
 * One strict re-request used to recover a JSON call that failed to parse or was
 * truncated (finish_reason MAX_TOKENS). Doubles the token budget and asks for
 * minified complete JSON. Returns { parsed } (undefined parsed on any failure)
 * plus usage/model meta.
 */
const retryStrictJson = async ({ endpoint, headers, baseBody, candidateModel, systemPrompt, prompt, maxTokens }) => {
  const retryMaxTokens = Math.min(Math.max(maxTokens * 2, 4096), 8192)
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt + STRICT_JSON_SUFFIX })

  let res
  try {
    res = await postToProxy(endpoint, headers, { ...baseBody, model: candidateModel, messages, max_tokens: retryMaxTokens })
  } catch {
    return { parsed: undefined }
  }
  if (!res.ok) return { parsed: undefined }

  let d
  try {
    d = await res.json()
  } catch {
    return { parsed: undefined }
  }
  const c = d?.choices?.[0]?.message?.content
  if (typeof c !== 'string' || !c.trim()) return { parsed: undefined }
  try {
    return { parsed: parseJsonLenient(c), usage: d.usage ?? null, model: d.model ?? candidateModel }
  } catch {
    return { parsed: undefined }
  }
}

/**
 * Resolve the AI proxy endpoint + the (browser-safe) anon key used to reach the
 * Supabase Functions gateway. The OpenRouter key lives only as a server-side
 * Edge Function secret - never in this bundle.
 */
const getProxyConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is not set')
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY is not set')
  return {
    endpoint: `${supabaseUrl.replace(/\/$/, '')}${AI_PROXY_PATH}`,
    anonKey
  }
}

/**
 * Build the headers for an authenticated proxy request.
 * The Edge Function verifies the user from the Authorization bearer token, so it
 * MUST be the active session's access token (not the anon key). The anon key is
 * still sent separately via `apikey` for the Functions gateway.
 */
const buildProxyHeaders = async (anonKey) => {
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  if (error || !accessToken) {
    throw new AiAuthError()
  }
  return {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': anonKey,
    'Content-Type': 'application/json'
  }
}

const postToProxy = async (endpoint, headers, body, timeoutMs = AI_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const isRetryableModelFailure = (status, message) => {
  const normalized = String(message ?? '').toLowerCase()
  // 403 covers the proxy's "model not allowed" response; 400/404 cover free-router style rejections.
  if (status !== 400 && status !== 403 && status !== 404) return false
  return (
    normalized.includes('unavailable for free') ||
    normalized.includes('model not allowed') ||
    normalized.includes('unsupported free-router') ||
    normalized.includes('unsupported free router') ||
    normalized.includes('invalid free-router') ||
    normalized.includes('free router')
  )
}

export async function callAI(prompt, config = {}) {
  const {
    model = REQUESTED_MODEL,
    modelFallbacks = null,
    maxTokens = 4000,
    temperature = 0.7,
    json = false,
    systemPrompt = null,
    includeModelMeta = false,
    traceSection = null,
  } = config

  const tracing = TAGLINE_TRACE && traceSection === 'tagline'

  const { endpoint, anonKey } = getProxyConfig()
  const headers = await buildProxyHeaders(anonKey)

  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const body = {
    messages,
    max_tokens: maxTokens,
    temperature,
    ...(json ? { response_format: { type: 'json_object' } } : {})
  }

  const candidates = Array.from(new Set(
    (Array.isArray(modelFallbacks) && modelFallbacks.length > 0 ? modelFallbacks : [model])
      .filter(Boolean)
  ))

  if (tracing) {
    traceTagline('request', {
      section: 'tagline',
      model: candidates[0] ?? model,
      bodyShape: {
        keys: [...Object.keys(body), 'model'],
        messageCount: messages.length,
        roles: messages.map((m) => m.role),
        systemPromptChars: systemPrompt ? systemPrompt.length : 0,
        userPromptChars: prompt.length,
        maxTokens,
        json,
        responseFormat: json ? 'json_object' : null,
      },
    })
  }

  const fallbackErrors = []

  for (const candidateModel of candidates) {
    let res = await postToProxy(endpoint, headers, { ...body, model: candidateModel })

    // Single retry on 429 (free-tier rate limit). Any other non-OK status throws immediately.
    if (res.status === 429) {
      await wait(3000)
      res = await postToProxy(endpoint, headers, { ...body, model: candidateModel })

      if (res.status === 429) {
        throw new Error('Rate limit hit - free tier allows 20 requests/minute')
      }
    }

    // Auth failures must surface clearly, not as a generic AI failure.
    if (res.status === 401) {
      throw new AiAuthError('Your session has expired or you are signed out. Please sign in again to use AI features.')
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const errorMessage = err?.error?.message || res.statusText
      if (tracing) {
        traceTagline('failure', {
          section: 'tagline',
          failureCategory: 'upstream',
          decidedAt: 'aiClient',
          httpStatus: res.status,
          errorMessage,
        })
      }
      if (isRetryableModelFailure(res.status, errorMessage) && candidates.length > 1) {
        fallbackErrors.push(`${candidateModel}: ${errorMessage}`)
        continue
      }
      throw new Error(`AI proxy error ${res.status}: ${errorMessage}`)
    }

    const data = await res.json()

    if (tracing) {
      const rawContent = data.choices?.[0]?.message?.content
      traceTagline('response', {
        section: 'tagline',
        httpStatus: res.status,
        topLevelKeys: Object.keys(data ?? {}),
        hasChoices: Array.isArray(data.choices) && data.choices.length > 0,
        contentPresent: typeof rawContent === 'string',
        contentLength: typeof rawContent === 'string' ? rawContent.length : 0,
        contentTrimmedLength: typeof rawContent === 'string' ? rawContent.trim().length : 0,
        usage: data.usage ?? null,
        model: data.model ?? candidateModel,
      })
    }

    const content = data.choices?.[0]?.message?.content

    if (typeof content !== 'string' || !content.trim()) {
      if (tracing) {
        traceTagline('failure', {
          section: 'tagline',
          failureCategory: 'no_content',
          decidedAt: 'aiClient',
          reason: typeof content !== 'string' ? 'content_not_string' : 'content_empty_after_trim',
        })
      }
      throw new AiResponseFormatError(
        'no_content',
        'AI returned no content for this generation step. Please retry.',
        { usage: data.usage ?? null, modelUsed: data.model ?? candidateModel }
      )
    }

    let parsed = content
    if (json) {
      const finishReason = data.choices?.[0]?.finish_reason
      let parsedJson
      try {
        parsedJson = parseJsonLenient(content)
      } catch {
        parsedJson = undefined
      }

      // One automatic recovery attempt when the response failed to parse OR was
      // truncated (we want the complete object, not just a repaired partial).
      // The JSON block returns or throws within this iteration, so this runs at
      // most once per call. Centralized so every module gets it for free.
      if (parsedJson === undefined || finishReason === 'MAX_TOKENS') {
        debugLog('JSON recovery retry', {
          model: candidateModel,
          reason: parsedJson === undefined ? 'parse_failed' : 'truncated',
          finishReason,
        })
        const retry = await retryStrictJson({
          endpoint, headers, baseBody: body, candidateModel, systemPrompt, prompt, maxTokens,
        })
        if (retry.parsed !== undefined) {
          parsedJson = retry.parsed
          data.usage = retry.usage ?? data.usage
          data.model = retry.model ?? data.model
        }
      }

      if (parsedJson === undefined) {
        debugLog('Malformed JSON response (after retry)', {
          model: candidateModel,
          preview: content.slice(0, 500),
          finishReason,
        })
        throw new AiResponseFormatError(
          finishReason === 'MAX_TOKENS' ? 'truncated' : 'malformed_json',
          finishReason === 'MAX_TOKENS'
            ? 'AI response was too long and got cut off. Please retry or narrow the request.'
            : 'AI returned malformed JSON for this generation step. Please retry.',
          { usage: data.usage ?? null, modelUsed: data.model ?? candidateModel }
        )
      }
      parsed = parsedJson
    }

    if (includeModelMeta) {
      if (tracing) {
        traceTagline('success', {
          section: 'tagline',
          failureCategory: 'success',
          decidedAt: 'aiClient',
          parsedContentKeys: json && parsed && typeof parsed === 'object' ? Object.keys(parsed) : null,
          usage: data.usage ?? null,
          model: data.model ?? candidateModel,
        })
      }
      return {
        content: parsed,
        modelUsed: data.model ?? candidateModel,
        usage: data.usage ?? null
      }
    }

    return parsed
  }

  const reason = fallbackErrors.length > 0
    ? ` All fallback models failed: ${fallbackErrors.join(' | ')}`
    : ''
  throw new Error(`AI proxy error 400: No usable free-tier model succeeded.${reason}`)
}
