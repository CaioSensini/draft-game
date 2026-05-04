/**
 * i18n/index.ts — Draft Game internationalization module.
 *
 * Custom, dependency-free i18n for Phaser scenes. Designed around two
 * constraints that ruled out i18next:
 *   (a) Phaser has no rendering reactivity, so any solution must percolate
 *       through scene lifecycle hooks anyway — a wrapper would be wasted.
 *   (b) Bundle size matters: i18next + browser-languagedetector ≈ 40KB gz.
 *
 * Public API:
 *   initI18n()                           — load detected language (call once on boot)
 *   t(key, params?)                       — synchronous lookup with {var} interpolation
 *   setLang(lang)                         — switch language (persists to localStorage)
 *   getCurrentLang() / getSupportedLangs()
 *   onLanguageChanged(cb) → unsubscribe
 *   bindI18nText(scene, textObj, key, params?) — auto-update Phaser.Text on switch
 *
 * Locale files live in i18n/locales/{lang}/{namespace}.json. The build picks
 * them up via Vite's static-analysis-friendly dynamic-import template.
 *
 * Lifecycle contract:
 *   Boot: initI18n() awaits in BootScene transition. Detection order:
 *     (1) localStorage['draft.lang'] → (2) navigator.language prefix → (3) PT-BR.
 *   Switch: setLang() reloads bundles, persists, then notifies subscribers.
 *   Hot-reload: bindI18nText() registers the text object and removes its
 *     listener on the owning scene's `shutdown` event. Memory-safe.
 */

export type Lang = 'pt-BR' | 'en-US' | 'es' | 'fr' | 'de' | 'it'

export const SUPPORTED_LANGS: readonly Lang[] = ['pt-BR', 'en-US', 'es', 'fr', 'de', 'it'] as const
export const DEFAULT_LANG: Lang = 'pt-BR'
const STORAGE_KEY = 'draft.lang'

export const LANG_LABELS: Record<Lang, string> = {
  'pt-BR': 'PT-BR',
  'en-US': 'EN-US',
  'es':    'ES',
  'fr':    'FR',
  'de':    'DE',
  'it':    'IT',
}

export const LANG_NATIVE_NAMES: Record<Lang, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
  'es':    'Español',
  'fr':    'Français',
  'de':    'Deutsch',
  'it':    'Italiano',
}

type Bundle = Record<string, unknown>

let currentLang: Lang = DEFAULT_LANG
let bundle: Record<string, Bundle> = {}
let fallback: Record<string, Bundle> = {}
const listeners = new Set<(lang: Lang) => void>()

const NAMESPACES = ['common', 'scenes', 'skills', 'errors'] as const

// ── Detection ────────────────────────────────────────────────────────────────

export function detectLang(): Lang {
  // (1) explicit user choice
  try {
    const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null
    if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) {
      return stored as Lang
    }
  } catch {
    // localStorage may be blocked (Safari private mode etc.) — fall through.
  }

  // (2) browser language
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
  if (nav.startsWith('pt')) return 'pt-BR'
  if (nav.startsWith('en')) return 'en-US'
  if (nav.startsWith('es')) return 'es'
  if (nav.startsWith('fr')) return 'fr'
  if (nav.startsWith('de')) return 'de'
  if (nav.startsWith('it')) return 'it'

  // (3) fallback
  return DEFAULT_LANG
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function loadBundle(lang: Lang): Promise<Record<string, Bundle>> {
  // Vite needs a static path template here — do NOT replace with a fully
  // dynamic string or HMR/build will not split locales into chunks.
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = await import(`./locales/${lang}/${ns}.json`)
      return [ns, (mod as { default: Bundle }).default] as const
    }),
  )
  const out: Record<string, Bundle> = {}
  for (const [ns, data] of entries) out[ns] = data
  return out
}

let initPromise: Promise<void> | null = null

/**
 * Idempotent initializer: subsequent calls return the same in-flight promise.
 * Awaits both the detected language and the PT-BR fallback bundle.
 */
export function initI18n(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const detected = detectLang()
    currentLang = detected
    fallback = await loadBundle(DEFAULT_LANG)
    bundle = (detected === DEFAULT_LANG) ? fallback : await loadBundle(detected)
  })()
  return initPromise
}

// ── Lookup ───────────────────────────────────────────────────────────────────

function lookupPath(obj: Bundle | undefined, path: string): string | undefined {
  if (!obj) return undefined
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

/**
 * Lookup convention: `<namespace>.<dot.path>` where namespace ∈ NAMESPACES.
 * Falls back to PT-BR, then to the raw key (so missing translations are
 * visually obvious during development).
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dot = key.indexOf('.')
  if (dot === -1) return key
  const ns = key.slice(0, dot)
  const rest = key.slice(dot + 1)
  const value = lookupPath(bundle[ns], rest) ?? lookupPath(fallback[ns], rest) ?? key

  if (!params) return value
  return value.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const v = params[name]
    return v == null ? `{${name}}` : String(v)
  })
}

// ── Language switching ───────────────────────────────────────────────────────

export function getCurrentLang(): Lang { return currentLang }
export function getSupportedLangs(): readonly Lang[] { return SUPPORTED_LANGS }

export async function setLang(lang: Lang): Promise<void> {
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) lang = DEFAULT_LANG
  if (lang === currentLang) return

  bundle = (lang === DEFAULT_LANG) ? fallback : await loadBundle(lang)
  currentLang = lang

  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // ignore storage errors
  }

  for (const cb of listeners) {
    try { cb(lang) } catch (err) { console.error('[i18n] listener threw', err) }
  }
}

// ── Subscribers ──────────────────────────────────────────────────────────────

export function onLanguageChanged(cb: (lang: Lang) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/**
 * Test-only reset. Wipes loaded bundles and listeners so that subsequent
 * `initI18n()` calls re-load from disk. Never call from production code.
 */
export function __resetI18nForTests(): void {
  currentLang = DEFAULT_LANG
  bundle = {}
  fallback = {}
  listeners.clear()
  initPromise = null
}
