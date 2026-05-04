/**
 * i18n/__tests__/i18n.test.ts — sanity tests for the i18n core.
 *
 * Exercises the parts that don't depend on Phaser:
 *   - language detection priority (localStorage → navigator → fallback)
 *   - bundle loading + dot-path lookup
 *   - language switching + listener notification
 *   - {var} interpolation
 *   - missing-key behavior (fallback to PT-BR, then to raw key)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetI18nForTests,
  detectLang,
  DEFAULT_LANG,
  getCurrentLang,
  getSupportedLangs,
  initI18n,
  onLanguageChanged,
  setLang,
  SUPPORTED_LANGS,
  t,
} from '../index'

// ── Test doubles for browser globals (vitest runs in node) ───────────────────

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string): string | null { return this.data.get(k) ?? null }
  setItem(k: string, v: string): void { this.data.set(k, v) }
  removeItem(k: string): void { this.data.delete(k) }
  clear(): void { this.data.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('navigator', { language: 'en-US' })
  __resetI18nForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── detectLang ───────────────────────────────────────────────────────────────

describe('detectLang', () => {
  it('returns the stored language when present and supported', () => {
    localStorage.setItem('draft.lang', 'fr')
    expect(detectLang()).toBe('fr')
  })

  it('ignores invalid stored values and falls through to navigator', () => {
    localStorage.setItem('draft.lang', 'klingon')
    vi.stubGlobal('navigator', { language: 'de-AT' })
    expect(detectLang()).toBe('de')
  })

  it('maps navigator.language by prefix', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['pt-BR', 'pt-BR'],
      ['pt-PT', 'pt-BR'],
      ['en-GB', 'en-US'],
      ['es-AR', 'es'],
      ['fr-CA', 'fr'],
      ['de-CH', 'de'],
      ['it-IT', 'it'],
      ['tr-TR', 'tr'],
      ['ru-RU', 'ru'],
    ]
    for (const [input, expected] of cases) {
      vi.stubGlobal('navigator', { language: input })
      expect(detectLang()).toBe(expected)
    }
  })

  it('falls back to PT-BR for unsupported navigator languages', () => {
    vi.stubGlobal('navigator', { language: 'ja-JP' })
    expect(detectLang()).toBe(DEFAULT_LANG)
  })
})

// ── initI18n + lookup ────────────────────────────────────────────────────────

describe('initI18n + t()', () => {
  it('loads PT-BR bundle when no preference is stored and navigator is unsupported', async () => {
    vi.stubGlobal('navigator', { language: 'xx' })
    await initI18n()
    expect(getCurrentLang()).toBe('pt-BR')
    expect(t('common._meta.lang')).toBe('pt-BR')
  })

  it('loads detected language and exposes it via getCurrentLang', async () => {
    localStorage.setItem('draft.lang', 'fr')
    await initI18n()
    expect(getCurrentLang()).toBe('fr')
    expect(t('common._meta.lang')).toBe('fr')
  })

  it('returns the raw key when neither current nor fallback bundle has it', async () => {
    await initI18n()
    expect(t('common.does.not.exist')).toBe('common.does.not.exist')
  })

  it('returns the raw key for malformed (no namespace) lookups', () => {
    expect(t('foo')).toBe('foo')
  })

  it('is idempotent: calling initI18n() twice does not double-load', async () => {
    const first = initI18n()
    const second = initI18n()
    expect(first).toBe(second)
    await first
  })
})

// ── setLang + listeners ──────────────────────────────────────────────────────

describe('setLang', () => {
  it('switches the current language and notifies subscribers', async () => {
    vi.stubGlobal('navigator', { language: 'pt-BR' })
    await initI18n()
    expect(getCurrentLang()).toBe('pt-BR')

    const seen: string[] = []
    onLanguageChanged((l) => seen.push(l))

    await setLang('de')
    expect(getCurrentLang()).toBe('de')
    expect(t('common._meta.lang')).toBe('de')
    expect(seen).toEqual(['de'])
  })

  it('persists the choice to localStorage', async () => {
    await initI18n()
    await setLang('it')
    expect(localStorage.getItem('draft.lang')).toBe('it')
  })

  it('is a no-op when switching to the already-active language', async () => {
    await initI18n()
    const seen: string[] = []
    onLanguageChanged((l) => seen.push(l))
    await setLang(getCurrentLang())
    expect(seen).toEqual([])
  })

  it('coerces unsupported languages back to PT-BR fallback', async () => {
    await initI18n()
    // @ts-expect-error — purposely passing an unsupported value
    await setLang('klingon')
    expect(getCurrentLang()).toBe(DEFAULT_LANG)
  })

  it('unsubscribe stops further notifications', async () => {
    await initI18n()
    const seen: string[] = []
    const off = onLanguageChanged((l) => seen.push(l))
    await setLang('fr')
    off()
    await setLang('es')
    expect(seen).toEqual(['fr'])
  })
})

// ── interpolation ────────────────────────────────────────────────────────────

describe('t() interpolation', () => {
  it('substitutes {var} placeholders in the looked-up value', async () => {
    await initI18n()
    // Bundle has no template strings yet (i18n.2 will add them), so we use
    // the missing-key path to assert substitution mechanics: t() returns the
    // raw key, then runs interpolation against it. A key containing {var}
    // proves substitution fires.
    expect(t('errors.missing.template.{var}', { var: 'x' })).toBe('errors.missing.template.x')
  })

  it('leaves placeholders intact when params are not provided', async () => {
    await initI18n()
    expect(t('errors.missing.{var}')).toBe('errors.missing.{var}')
  })

  it('leaves unknown {var} placeholders intact', async () => {
    await initI18n()
    expect(t('errors.missing.{a}.{b}', { a: '1' })).toBe('errors.missing.1.{b}')
  })
})

// ── module exports ───────────────────────────────────────────────────────────

describe('module surface', () => {
  it('exports the canonical 8-language list', () => {
    expect(getSupportedLangs()).toEqual(SUPPORTED_LANGS)
    expect(SUPPORTED_LANGS).toEqual(['pt-BR', 'en-US', 'es', 'fr', 'de', 'it', 'tr', 'ru'])
  })
})
