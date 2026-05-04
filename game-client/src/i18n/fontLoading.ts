import { fontFamily } from '../utils/DesignTokens'

export const FONT_WARMUP_SAMPLE =
  'Ag ·íôáúçã Español Français Türkçe Русский русский 日本語 王戦 简体中文 战斗 한국어 전투'

const FONT_LOADS = [
  { family: 'Cinzel', size: '28px', sample: 'Ag ·íôáúçã Español Français Türkçe' },
  { family: 'Cormorant Garamond', size: '28px', sample: 'Ag ·íôáúçã Español Français Türkçe Русский' },
  { family: 'Manrope', size: '18px', sample: 'Ag ·íôáúçã Español Français Türkçe Русский' },
  { family: 'JetBrains Mono', size: '16px', sample: 'ATK ·íôáúçã Русский' },
  { family: 'Noto Sans JP', size: '18px', sample: '日本語 王戦' },
  { family: 'Noto Sans SC', size: '18px', sample: '简体中文 战斗' },
  { family: 'Noto Sans KR', size: '18px', sample: '한국어 전투' },
  { family: 'Noto Serif JP', size: '24px', sample: '日本語 王戦' },
  { family: 'Noto Serif SC', size: '24px', sample: '简体中文 战斗' },
  { family: 'Noto Serif KR', size: '24px', sample: '한국어 전투' },
] as const

export async function waitForDesignFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return

  const fontSet = document.fonts
  await Promise.all(
    FONT_LOADS.map(({ family, size, sample }) =>
      fontSet.load(`${size} "${family}"`, sample),
    ),
  )
  await fontSet.ready
}

export function getWarmupFontFamilies(): readonly string[] {
  return [fontFamily.display, fontFamily.serif, fontFamily.body, fontFamily.mono]
}
