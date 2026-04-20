# MOBILE_NOTES.md — Notas de compatibilidade mobile

> Criado em Sprint 0.6 (2026-04-20).
> Atualizar sempre que uma nova limitação for descoberta em dispositivo real.

---

## Configuração atual

- **Resolução base:** 1280 × 720 (16:9 landscape)
- **Scale mode:** `Phaser.Scale.FIT` com `CENTER_BOTH`
- **Plataforma alvo:** Steam (desktop 1280×720+), iOS (iPhone, iPad), Android (phone, tablet) — todos em **landscape**
- **Orientação:** Forçada via:
  - Meta tags no `index.html` (`screen-orientation`, `x5-orientation`, `viewport-fit=cover`)
  - `screen.orientation.lock('landscape')` no `main.ts` (falha silenciosamente onde não é suportado)
- **Safe areas:** CSS `env(safe-area-inset-*)` aplicado no body (respeita notch iOS e gesture bar Android)
- **Toque:** `touch-action: manipulation` + `overscroll-behavior: none` (previne zoom duplo-tap e pull-to-refresh)

---

## Limitações conhecidas

### iOS Safari
- **`screen.orientation.lock()` não funciona** em Safari mobile (nem em web app, nem em PWA standalone). O usuário precisa girar o dispositivo manualmente; a viewport meta `screen-orientation` é apenas uma **sugestão** (ignorada pelo Safari).
  - **Mitigação:** UI landscape é a única montada. Se o usuário estiver em portrait, o jogo aparecerá "apertado" mas funcional. Considerar overlay "gire o dispositivo" em sprint futuro.
- **Barra de URL + barra de home não somem automaticamente** em Safari. Usuário precisa "Adicionar à tela inicial" para modo standalone. A meta `apple-mobile-web-app-capable=yes` já está setada para quando o usuário fizer isso.

### Android Chrome / WebView
- `screen.orientation.lock('landscape')` **só funciona em fullscreen**. Chrome mobile (não-PWA) rejeita a chamada. Funciona em PWAs instaladas e em wrappers Capacitor.
  - **Mitigação:** no wrapper Capacitor (quando formos para produção), configurar `orientation: landscape` no `capacitor.config.json`.

### Dispositivos com notch / dynamic island (iPhone 14 Pro+)
- CSS `env(safe-area-inset-*)` está aplicado corretamente. UI e Phaser canvas ficam dentro do "safe area". Vazamentos visuais são **bugs** — reportar.

### Touch vs mouse
- `input.activePointers: 3` permite multi-touch. A camada de UI Phaser (botões) aceita toque automaticamente via pointer events.
- **UIComponents ainda não tem hover→touch equivalence uniforme.** Auditoria pendente na Subtarefa 0.7.

### Teclado virtual (LoginScene)
- LoginScene usa `<input>` HTML via `Phaser.DOM`. O teclado virtual iOS/Android aparece normalmente, mas **não empurra a viewport pra cima** (por causa do `overflow:hidden` no body). Em telas pequenas isso pode cobrir o input.
  - **Mitigação futura:** detectar `visualViewport.resize` e ajustar a posição do form quando teclado abrir.

---

## Checklist de validação (DevTools → Device Toolbar)

- [ ] iPhone 14 Pro Max (landscape) — canvas escala, safe area respeita notch
- [ ] iPhone SE (landscape) — canvas escala em resolução baixa (375×667 → landscape)
- [ ] iPad (landscape) — canvas centrado, sem esticar
- [ ] Pixel 7 (landscape) — canvas escala, sem cortes de gesture bar
- [ ] Galaxy S21 (landscape) — canvas escala
- [ ] Desktop 1920×1080 — canvas centrado com bordas pretas (letterbox), sem esticar

---

## Arquivos relevantes

- `index.html` — meta tags, CSS safe-area, viewport config
- `src/main.ts` — `lockLandscape()` function + Phaser boot
- `src/core/gameConfig.ts` — scale config (FIT + CENTER_BOTH)

---

## TODOs para sprint futuro de mobile

1. Overlay "gire o dispositivo" quando detectar portrait em mobile
2. Detectar `visualViewport.resize` para ajustar LoginScene quando teclado abrir
3. Capacitor wrapper com `orientation: landscape` no config
4. Testar em dispositivos físicos reais (não só DevTools)
5. Adicionar touch-action específico em UIComponents (pan-x, pan-y onde apropriado)
