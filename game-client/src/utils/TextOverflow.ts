/**
 * utils/TextOverflow.ts — Generic helpers for fitting translated text
 * into fixed-width UI surfaces.
 *
 * Strategy is chosen by the call-site since the right behaviour depends
 * on the surface:
 *   - 'shrink'   — buttons / pills / single-line labels: lower font size
 *                 until the label fits, with a minimum legible size floor.
 *   - 'wrap'     — descriptions / info bullets / long-descriptions:
 *                 set wordWrap.width and keep the original font size.
 *   - 'truncate' — badges / column headers where wrap is undesirable:
 *                 ellipsize when the label exceeds the budget.
 *   - 'wrap-then-shrink' — titles up to 2 lines; if still too tall,
 *                 also reduce font size until it fits.
 *
 * Stat sigla (DMG / HEAL / SHLD / ATK / DEF / MOV) are intentionally
 * kept identical across locales (tokens, not translatable strings) and
 * therefore do not need overflow handling.
 */

import Phaser from 'phaser'

export type OverflowStrategy =
  | 'shrink'
  | 'wrap'
  | 'truncate'
  | 'wrap-then-shrink'

export interface OverflowOptions {
  /** Target maximum width in px. Required for shrink / wrap / truncate. */
  maxWidth: number
  /** For 'wrap-then-shrink' — maximum height after wrap before shrinking kicks in. */
  maxHeight?: number
  /**
   * Minimum font size (px) the shrink ladder can reach. Defaults to 70% of
   * the original font size or 11px, whichever is larger.
   */
  minFontSize?: number
  /** Step (px) by which the font size is reduced each iteration. Default 1. */
  shrinkStep?: number
  /** Suffix to append when truncating. Default '…'. */
  ellipsis?: string
}

/**
 * Apply an overflow strategy to a Phaser Text object that has just had its
 * content set. Mutates the text in place; returns the same instance for chaining.
 *
 * Call this AFTER the text content (and any t() resolution) has been set,
 * not on creation — the strategy depends on the rendered width which can
 * only be measured once the canvas has the string.
 */
export function applyTextOverflow(
  text: Phaser.GameObjects.Text,
  strategy: OverflowStrategy,
  options: OverflowOptions,
): Phaser.GameObjects.Text {
  switch (strategy) {
    case 'shrink':       return shrinkToFit(text, options)
    case 'wrap':         return wrapToWidth(text, options)
    case 'truncate':     return truncateToWidth(text, options)
    case 'wrap-then-shrink': return wrapThenShrink(text, options)
  }
}

/**
 * Convenience: set the text content AND apply overflow strategy in one call.
 * For new code that knows the strategy up front.
 */
export function setTextWithOverflow(
  text: Phaser.GameObjects.Text,
  content: string,
  strategy: OverflowStrategy,
  options: OverflowOptions,
): Phaser.GameObjects.Text {
  text.setText(content)
  return applyTextOverflow(text, strategy, options)
}

// ── Internals ──────────────────────────────────────────────────────────────

function getFontSizePx(text: Phaser.GameObjects.Text): number {
  const raw = text.style.fontSize
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d+(?:\.\d+)?)/)
    return m ? parseFloat(m[1]) : 16
  }
  if (typeof raw === 'number') return raw
  return 16
}

function shrinkToFit(text: Phaser.GameObjects.Text, opts: OverflowOptions): Phaser.GameObjects.Text {
  const original = getFontSizePx(text)
  const minSize = opts.minFontSize ?? Math.max(11, Math.floor(original * 0.7))
  const step = opts.shrinkStep ?? 1
  let size = original

  while (text.width > opts.maxWidth && size > minSize) {
    size -= step
    text.setFontSize(`${size}px`)
  }

  return text
}

function wrapToWidth(text: Phaser.GameObjects.Text, opts: OverflowOptions): Phaser.GameObjects.Text {
  text.setWordWrapWidth(opts.maxWidth, true)
  return text
}

function truncateToWidth(text: Phaser.GameObjects.Text, opts: OverflowOptions): Phaser.GameObjects.Text {
  if (text.width <= opts.maxWidth) return text

  const ellipsis = opts.ellipsis ?? '…'
  const original = text.text

  // Binary search for the longest prefix that fits with the ellipsis appended.
  let lo = 0
  let hi = original.length
  let best = ''
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const candidate = original.slice(0, mid) + ellipsis
    text.setText(candidate)
    if (text.width <= opts.maxWidth) {
      best = candidate
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  text.setText(best || ellipsis)
  return text
}

function wrapThenShrink(text: Phaser.GameObjects.Text, opts: OverflowOptions): Phaser.GameObjects.Text {
  text.setWordWrapWidth(opts.maxWidth, true)
  if (opts.maxHeight == null) return text

  const minSize = opts.minFontSize ?? Math.max(11, Math.floor(getFontSizePx(text) * 0.7))
  const step = opts.shrinkStep ?? 1
  let size = getFontSizePx(text)

  while (text.height > opts.maxHeight && size > minSize) {
    size -= step
    text.setFontSize(`${size}px`)
  }

  return text
}
