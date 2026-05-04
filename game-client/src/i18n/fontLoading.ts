import { fontFamily } from '../utils/DesignTokens'

export const FONT_WARMUP_SAMPLE =
  'Ag \u00b7\u00ed\u00f4\u00e1\u00fa\u00e7\u00e3 Espa\u00f1ol Fran\u00e7ais T\u00fcrk\u00e7e \u0420\u0443\u0441\u0441\u043a\u0438\u0439 \u0440\u0443\u0441\u0441\u043a\u0438\u0439 \u65e5\u672c\u8a9e \u738b\u6226 \u7b80\u4f53\u4e2d\u6587 \u6218\u6597 \ud55c\uad6d\uc5b4 \uc804\ud22c'

const FONT_LOADS = [
  { family: 'Cinzel', size: '28px', sample: 'Ag \u00b7\u00ed\u00f4\u00e1\u00fa\u00e7\u00e3 Espa\u00f1ol Fran\u00e7ais T\u00fcrk\u00e7e' },
  { family: 'Cormorant Garamond', size: '28px', sample: 'Ag \u00b7\u00ed\u00f4\u00e1\u00fa\u00e7\u00e3 Espa\u00f1ol Fran\u00e7ais T\u00fcrk\u00e7e \u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { family: 'Manrope', size: '18px', sample: 'Ag \u00b7\u00ed\u00f4\u00e1\u00fa\u00e7\u00e3 Espa\u00f1ol Fran\u00e7ais T\u00fcrk\u00e7e \u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { family: 'JetBrains Mono', size: '16px', sample: 'ATK \u00b7\u00ed\u00f4\u00e1\u00fa\u00e7\u00e3 \u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { family: 'Noto Sans JP', size: '18px', sample: '\u65e5\u672c\u8a9e \u738b\u6226' },
  { family: 'Noto Sans SC', size: '18px', sample: '\u7b80\u4f53\u4e2d\u6587 \u6218\u6597' },
  { family: 'Noto Sans KR', size: '18px', sample: '\ud55c\uad6d\uc5b4 \uc804\ud22c' },
  { family: 'Noto Serif JP', size: '24px', sample: '\u65e5\u672c\u8a9e \u738b\u6226' },
  { family: 'Noto Serif SC', size: '24px', sample: '\u7b80\u4f53\u4e2d\u6587 \u6218\u6597' },
  { family: 'Noto Serif KR', size: '24px', sample: '\ud55c\uad6d\uc5b4 \uc804\ud22c' },
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
