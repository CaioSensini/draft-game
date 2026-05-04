import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import {
  SCREEN,
  accent, border, fg, fontFamily,
  motion, radii, state as dsState, surface, typeScale,
} from '../utils/DesignTokens'

type TabKey = 'login' | 'register'

type InputFieldHandle = ReturnType<typeof UI.inputField>

/**
 * LoginScene — ETAPA 2 Sub 2.2.
 *
 * DOM-hybrid: Phaser renders the logo, panel, title, tabs, labels, error strip
 * and buttons; native <input> elements (delivered by UI.inputField) keep the
 * real typing/validation flow. Preserves 100% of the auth+verification flow
 * against services/authService + utils/PlayerDataManager.
 *
 * Layout follows INTEGRATION_SPEC §S1 (Login) — centered 400×auto panel,
 * wordmark 240×80 above, submit full-width, secondary "Criar conta" below
 * panel. Tabs sit INSIDE the panel so we can host both login and register
 * variants from a single surface.
 */
export default class LoginScene extends Phaser.Scene {
  private pendingUserId:     string | null = null
  private panelContainer:    Phaser.GameObjects.Container | null = null
  private fields:            InputFieldHandle[] = []
  private errorBanner:       Phaser.GameObjects.Container | null = null
  // "Lembrar de mim" preference — persists auth token across sessions when
  // true. Defaults to true so returning players stay logged in; cleared on
  // successful login if the user unchecked the box.
  private _rememberMe:       boolean = true

  constructor() {
    super('LoginScene')
  }

  create() {
    this.pendingUserId  = null
    this.panelContainer = null
    this.fields         = []
    this._rememberMe    = localStorage.getItem('draft_remember_me') !== 'false'

    const { W, H } = SCREEN

    // ── Backdrop: surface.deepest with subtle ambient particles ──
    this.add.rectangle(W / 2, H / 2, W, H, surface.deepest, 1)
    UI.particles(this, 18)

    // ── Logo wordmark (SVG preloaded) ──
    // ETAPA 6.7 addendum: SVG is rasterized at 1200×400 natively (see
    // AssetPaths DESIGN_SVG_ASSETS) so displaying it at 600×200 is a
    // clean 0.5 downscale — no stretching, crisp edges, and the logo
    // reads impactful on the entry screen (3× the original 240×80).
    const wordmark = this.add.image(W / 2, 120, 'logo-wordmark')
      .setDisplaySize(600, 200)
      .setAlpha(0)
    wordmark.setY(96)
    this.tweens.add({
      targets: wordmark,
      alpha: 1, y: 120,
      duration: 500, delay: 120, ease: motion.easeOut,
    })

    // ── Entrance overlay ──
    UI.fadeIn(this, 400)

    // ── Panel + form ──
    this._showMainForm('login')

    // ── Footer meta ──
    this.add.text(W - 20, H - 16, 'v1.0', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.disabledHex,
      fontStyle:  '700',
    }).setOrigin(1, 1)
    this.add.text(20, H - 16, 'Codeforje VIO', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.disabledHex,
      fontStyle:  '700',
    }).setOrigin(0, 1)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN FORM — login + register tabs in a shared panel
  // ══════════════════════════════════════════════════════════════════════════

  private _showMainForm(initial: TabKey) {
    const { W } = SCREEN
    const panelW = 400
    // ETAPA 6.7: panel taller so the register tab's 3-field layout has
    // breathing room between the last field and the submit button.
    // Bumped again in the 6.7 addendum (2026-04-23) so register can match
    // login's 76px field stride without crowding the submit button.
    const panelH = 448
    const panelX = W / 2
    const panelY = 224 + panelH / 2

    const container = this.add.container(panelX, panelY).setAlpha(0)
    this.panelContainer = container

    // Panel background (surface.panel + border.default + radii.xl + shadow)
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(-panelW / 2 + 2, -panelH / 2 + 8, panelW, panelH, radii.xl)
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, radii.xl)
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRoundedRect(-panelW / 2 + 2, -panelH / 2 + 2, panelW - 4, 1,
      { tl: radii.xl - 2, tr: radii.xl - 2, bl: 0, br: 0 })
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, radii.xl)
    container.add(bg)

    // Title "ENTRAR" / "CRIAR CONTA" (swaps per tab)
    const titleText = this.add.text(0, -panelH / 2 + 34, 'ENTRAR', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    const anyTitle = titleText as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyTitle.setLetterSpacing === 'function') anyTitle.setLetterSpacing(2)
    container.add(titleText)

    // Tabs row — sits clearly below the title so both LOGIN and REGISTRAR
    // are always discoverable (ETAPA 6.7: before, login fields overlapped
    // this row and hid the "registrar" entry point entirely).
    const tabY = -panelH / 2 + 80
    const loginTab    = this._buildTab('LOGIN',    0 - 56, tabY, initial === 'login')
    const registerTab = this._buildTab('REGISTRAR', 0 + 56, tabY, initial === 'register')
    container.add(loginTab.container)
    container.add(registerTab.container)

    // Separator under tabs
    const sep = this.add.graphics()
    sep.fillStyle(border.subtle, 0.8)
    sep.fillRect(-panelW / 2 + 20, tabY + 16, panelW - 40, 1)
    container.add(sep)

    // Active tab state holder
    let active: TabKey = initial

    // ── Build field sets for each tab ──
    // panelTopToTab = (panelH / 2 + tabY) = distance from panel top to tab center.
    // Fields start ~34px below the separator; register uses tighter stride
    // to squeeze 3 rows into the available vertical space.
    const loginFields    = this._buildLoginFields(panelX, panelY, panelW)
    const registerFields = this._buildRegisterFields(panelX, panelY, panelW)

    const toggle = (next: TabKey) => {
      if (next === active) return
      active = next
      const isLogin = next === 'login'
      titleText.setText(isLogin ? 'ENTRAR' : 'CRIAR CONTA')
      loginTab.setActive(isLogin)
      registerTab.setActive(!isLogin)
      for (const f of loginFields)   f.handle.container.setVisible(isLogin)
      for (const f of registerFields) f.handle.container.setVisible(!isLogin)
      btnLogin.container.setVisible(isLogin)
      btnRegister.container.setVisible(!isLogin)
      forgotLink.setVisible(isLogin)
      rememberRow.setVisible(isLogin)
      this._clearError()
    }

    loginTab.hit.on('pointerdown',    () => toggle('login'))
    registerTab.hit.on('pointerdown', () => toggle('register'))

    // Initial visibility
    for (const f of registerFields) f.handle.container.setVisible(initial === 'register')
    for (const f of loginFields)    f.handle.container.setVisible(initial === 'login')

    // ── "Lembrar de mim" checkbox (login only) ──
    // Sits in the gap between the SENHA field and the submit button.
    // Preference persists to localStorage so the toggle state survives
    // scene restarts; the actual auto-login behavior lives in BootScene,
    // which reads draft_token on boot. Unchecking removes draft_token
    // right after login so the next launch returns to this form.
    const rememberRow = this.add.container(panelX, panelY + 76)
    rememberRow.setVisible(initial === 'login')

    const boxSize = 18
    const boxX = -84
    const rememberBg = this.add.graphics()
    const drawRememberBox = () => {
      rememberBg.clear()
      rememberBg.fillStyle(this._rememberMe ? accent.primary : surface.raised, 1)
      rememberBg.fillRoundedRect(boxX - boxSize / 2, -boxSize / 2, boxSize, boxSize, radii.sm)
      rememberBg.lineStyle(1,
        this._rememberMe ? accent.primary : border.default,
        this._rememberMe ? 1 : 0.9)
      rememberBg.strokeRoundedRect(boxX - boxSize / 2, -boxSize / 2, boxSize, boxSize, radii.sm)
      if (this._rememberMe) {
        // Checkmark: two lines forming a ✓
        rememberBg.lineStyle(2, fg.inverse, 1)
        rememberBg.beginPath()
        rememberBg.moveTo(boxX - 4, 0)
        rememberBg.lineTo(boxX - 1, 3)
        rememberBg.lineTo(boxX + 5, -4)
        rememberBg.strokePath()
      }
    }
    drawRememberBox()
    rememberRow.add(rememberBg)

    const rememberLabel = this.add.text(boxX + boxSize / 2 + 8, 0, 'Lembrar de mim', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      fg.secondaryHex,
      fontStyle:  '500',
    }).setOrigin(0, 0.5)
    rememberRow.add(rememberLabel)

    const rememberHit = this.add.rectangle(
      boxX + 60, 0,
      140 + boxSize, 32,
      0x000000, 0.001,
    ).setInteractive({ useHandCursor: true })
    rememberHit.on('pointerover', () => rememberLabel.setColor(fg.primaryHex))
    rememberHit.on('pointerout',  () => rememberLabel.setColor(fg.secondaryHex))
    rememberHit.on('pointerdown', () => {
      this._rememberMe = !this._rememberMe
      drawRememberBox()
    })
    rememberRow.add(rememberHit)

    // ── Submit buttons ──
    const btnCy = panelY + panelH / 2 - 84
    const btnLogin = UI.buttonPrimary(this, panelX, btnCy, 'ENTRAR', {
      w: panelW - 48, h: 48, depth: 1,
      onPress: () => this._submitLogin(loginFields),
    })
    const btnRegister = UI.buttonPrimary(this, panelX, btnCy, 'CRIAR CONTA', {
      w: panelW - 48, h: 48, depth: 1,
      onPress: () => this._submitRegister(registerFields),
    })
    btnRegister.container.setVisible(initial === 'register')
    btnLogin.container.setVisible(initial === 'login')

    // ── Forgot link (ghost, below submit) ──
    const forgotLink = this.add.text(panelX, btnCy + 42, 'Esqueceu a senha?', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      fg.tertiaryHex,
      fontStyle:  '500',
    }).setOrigin(0.5).setVisible(initial === 'login')
      .setInteractive({ useHandCursor: true })
    forgotLink.on('pointerover', () => forgotLink.setColor(fg.primaryHex))
    forgotLink.on('pointerout',  () => forgotLink.setColor(fg.tertiaryHex))

    // Error banner container (hidden until needed)
    const errorBanner = this.add.container(panelX, panelY + panelH / 2 + 18).setVisible(false)
    const errBg = this.add.graphics()
    errBg.fillStyle(dsState.error, 0.12)
    errBg.fillRoundedRect(-panelW / 2, -16, panelW, 32, radii.md)
    errBg.lineStyle(1, dsState.error, 1)
    errBg.strokeRoundedRect(-panelW / 2, -16, panelW, 32, radii.md)
    errorBanner.add(errBg)
    const errText = this.add.text(0, 0, '', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      dsState.errorHex,
      fontStyle:  '500',
    }).setOrigin(0.5)
    errorBanner.add(errText)
    this.errorBanner = errorBanner
    // Store text reference for easy update
    ;(errorBanner as unknown as { _errText: Phaser.GameObjects.Text })._errText = errText

    // Panel entrance animation
    this.tweens.add({
      targets: container, alpha: 1,
      duration: motion.durBase, delay: 180, ease: motion.easeOut,
    })
  }

  // ── Tab button helper ──────────────────────────────────────────────────────

  private _buildTab(label: string, x: number, y: number, active: boolean): {
    container: Phaser.GameObjects.Container
    hit:       Phaser.GameObjects.Rectangle
    setActive: (v: boolean) => void
  } {
    const container = this.add.container(x, y)

    const text = this.add.text(0, 0, label, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      active ? fg.primaryHex : fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    const anyTxt = text as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyTxt.setLetterSpacing === 'function') anyTxt.setLetterSpacing(1.6)
    container.add(text)

    const underline = this.add.rectangle(0, 12, 56, 2, accent.primary, active ? 1 : 0)
    container.add(underline)

    const hit = this.add.rectangle(0, 0, 96, 28, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)

    hit.on('pointerover', () => text.setColor(fg.primaryHex))
    hit.on('pointerout',  () => { /* handled by setActive */
      text.setColor((underline.alpha > 0) ? fg.primaryHex : fg.tertiaryHex)
    })

    return {
      container,
      hit,
      setActive: (v: boolean) => {
        text.setColor(v ? fg.primaryHex : fg.tertiaryHex)
        this.tweens.add({
          targets: underline,
          alpha: v ? 1 : 0,
          duration: motion.durFast, ease: motion.easeOut,
        })
      },
    }
  }

  // ── Field builders (absolute-positioned since DOM needs world coords) ─────

  private _buildLoginFields(panelX: number, panelY: number, panelW: number): Array<{
    key: 'user' | 'pass'
    handle: InputFieldHandle
  }> {
    const fieldW = panelW - 48
    // ETAPA 6.7: positions are world coords anchored to panelY. Sits
    // clearly below the separator so the tabs above remain visible.
    // panelH=432 → panelY offset −88 = world ~(panelY−88) is just below
    // the separator line (tabY+16 ≈ panel top + 96 ≈ world −120).
    const userY = panelY - 52
    const passY = panelY + 24
    const userField = UI.inputField(this, panelX, userY, {
      label:       'USUÁRIO',
      placeholder: 'Nick',
      type:        'text',
      width:       fieldW,
      name:        'login-user',
      maxLength:   32,
      onEnter:     () => this._submitLogin(this.fields as never),
    })
    const passField = UI.inputField(this, panelX, passY, {
      label:       'SENHA',
      placeholder: '••••••••',
      type:        'password',
      width:       fieldW,
      name:        'login-pass',
      maxLength:   64,
      onEnter:     () => this._submitLogin(this.fields as never),
    })
    const fields = [
      { key: 'user' as const, handle: userField },
      { key: 'pass' as const, handle: passField },
    ]
    this.fields.push(userField, passField)
    return fields
  }

  private _buildRegisterFields(panelX: number, panelY: number, panelW: number): Array<{
    key: 'user' | 'email' | 'pass'
    handle: InputFieldHandle
  }> {
    const fieldW = panelW - 48
    // ETAPA 6.7 addendum (2026-04-23): 76px stride matches the login
    // form exactly so the register fields have the same breathing room
    // between them that the user already liked on login.
    const userY  = panelY - 76
    const emailY = panelY
    const passY  = panelY + 76
    const userField = UI.inputField(this, panelX, userY, {
      label:       'USUÁRIO',
      placeholder: 'Nick',
      type:        'text',
      width:       fieldW,
      name:        'reg-user',
      maxLength:   32,
      onEnter:     () => this._submitRegister(this.fields as never),
    })
    const emailField = UI.inputField(this, panelX, emailY, {
      label:       'EMAIL',
      placeholder: 'voce@exemplo.com',
      type:        'email',
      width:       fieldW,
      name:        'reg-email',
      maxLength:   120,
      onEnter:     () => this._submitRegister(this.fields as never),
    })
    const passField = UI.inputField(this, panelX, passY, {
      label:       'SENHA',
      placeholder: 'Mínimo 6 caracteres',
      type:        'password',
      width:       fieldW,
      name:        'reg-pass',
      maxLength:   64,
      onEnter:     () => this._submitRegister(this.fields as never),
    })
    const fields = [
      { key: 'user' as const,  handle: userField },
      { key: 'email' as const, handle: emailField },
      { key: 'pass' as const,  handle: passField },
    ]
    this.fields.push(userField, emailField, passField)
    return fields
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ERROR BANNER HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private _showError(msg: string) {
    if (!this.errorBanner) return
    const t = (this.errorBanner as unknown as { _errText: Phaser.GameObjects.Text })._errText
    t.setText(msg)
    this.errorBanner.setVisible(true)
  }

  private _clearError() {
    if (this.errorBanner) this.errorBanner.setVisible(false)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH SUBMIT HANDLERS — preserve original flow verbatim
  // ══════════════════════════════════════════════════════════════════════════

  private async _submitLogin(_unused: Array<{ key: 'user' | 'pass'; handle: InputFieldHandle }>) {
    const userField = this.fields.find(f => f.input.name === 'login-user')
    const passField = this.fields.find(f => f.input.name === 'login-pass')
    if (!userField || !passField) return
    const username = userField.input.value.trim()
    const password = passField.input.value
    if (!username || !password) {
      this._showError('Preencha todos os campos.')
      return
    }
    try {
      this._clearError()
      const { authService } = await import('../services')
      const result = await authService.login(username, password)

      if (result.pendingVerification && result.userId) {
        this._showVerificationForm(result.userId)
        return
      }
      // Persist the "Lembrar de mim" choice so the checkbox opens in the
      // same state next visit. When unchecked, drop draft_token so
      // BootScene falls back to LoginScene on the next launch — the
      // in-memory token survives this session.
      this._applyRememberPreference()
      const { playerData } = await import('../utils/PlayerDataManager')
      playerData.syncFromServer(result.user!)
      this._transitionOut('LobbyScene')
    } catch (e: unknown) {
      this._showError(
        (e instanceof Error ? e.message : null) ||
        'Erro ao conectar. Verifique se o servidor está rodando.',
      )
    }
  }

  private _applyRememberPreference() {
    localStorage.setItem('draft_remember_me', this._rememberMe ? 'true' : 'false')
    if (!this._rememberMe) {
      localStorage.removeItem('draft_token')
    }
  }

  private async _submitRegister(_unused: Array<{ key: 'user' | 'email' | 'pass'; handle: InputFieldHandle }>) {
    const userField  = this.fields.find(f => f.input.name === 'reg-user')
    const emailField = this.fields.find(f => f.input.name === 'reg-email')
    const passField  = this.fields.find(f => f.input.name === 'reg-pass')
    if (!userField || !emailField || !passField) return
    const username = userField.input.value.trim()
    const email    = emailField.input.value.trim()
    const password = passField.input.value
    if (!username || !email || !password) {
      this._showError('Preencha todos os campos.')
      return
    }
    if (password.length < 6) {
      this._showError('Senha deve ter pelo menos 6 caracteres.')
      return
    }
    try {
      this._clearError()
      const { authService } = await import('../services')
      const result = await authService.register(username, email, password)
      if (result.pendingVerification && result.userId) {
        this._showVerificationForm(result.userId)
        return
      }
      const { playerData } = await import('../utils/PlayerDataManager')
      playerData.syncFromServer(result.user!)
      this._transitionOut('LobbyScene')
    } catch (e: unknown) {
      this._showError(
        (e instanceof Error ? e.message : null) ||
        'Erro ao registrar. Verifique se o servidor está rodando.',
      )
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VERIFICATION FORM — 6-digit code
  // ══════════════════════════════════════════════════════════════════════════

  private _showVerificationForm(userId: string) {
    this.pendingUserId = userId
    const { W } = SCREEN
    // Dismiss main form (fields + panel)
    for (const f of this.fields) f.destroy()
    this.fields = []
    this.panelContainer?.destroy()
    this.panelContainer = null
    this.errorBanner?.destroy()
    this.errorBanner = null

    const panelW = 400
    const panelH = 320
    const panelX = W / 2
    const panelY = 224 + panelH / 2

    const container = this.add.container(panelX, panelY).setAlpha(0)

    // Background
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(-panelW / 2 + 2, -panelH / 2 + 8, panelW, panelH, radii.xl)
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, radii.xl)
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRoundedRect(-panelW / 2 + 2, -panelH / 2 + 2, panelW - 4, 1,
      { tl: radii.xl - 2, tr: radii.xl - 2, bl: 0, br: 0 })
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, radii.xl)
    container.add(bg)

    // Eyebrow meta
    const eyebrow = this.add.text(0, -panelH / 2 + 28, 'VERIFICAÇÃO', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    const anyEb = eyebrow as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyEb.setLetterSpacing === 'function') anyEb.setLetterSpacing(2)
    container.add(eyebrow)

    // Title
    const title = this.add.text(0, -panelH / 2 + 56, 'CÓDIGO DE EMAIL', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    const anyTitle = title as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyTitle.setLetterSpacing === 'function') anyTitle.setLetterSpacing(2)
    container.add(title)

    // Body text
    const body = this.add.text(0, -panelH / 2 + 100, 'Um código de 6 dígitos foi enviado\npara seu email. Digite-o abaixo.', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      fg.secondaryHex,
      align:      'center',
    }).setOrigin(0.5)
    container.add(body)

    // Input field (6-digit code)
    const codeField = UI.inputField(this, panelX, panelY - 16, {
      label:       'CÓDIGO',
      placeholder: '000000',
      type:        'text',
      width:       panelW - 48,
      name:        'verify-code',
      maxLength:   6,
      onEnter:     () => void this._submitVerify(codeField.input.value.trim()),
    })

    // Submit button
    const btnVerify = UI.buttonPrimary(this, panelX, panelY + panelH / 2 - 78, 'VERIFICAR', {
      w: panelW - 48, h: 48, depth: 1,
      onPress: () => void this._submitVerify(codeField.input.value.trim()),
    })
    void btnVerify

    // Resend link (ghost)
    const resendLink = this.add.text(panelX, panelY + panelH / 2 - 32, 'Reenviar código', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      fg.tertiaryHex,
      fontStyle:  '500',
    }).setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    resendLink.on('pointerover', () => resendLink.setColor(fg.primaryHex))
    resendLink.on('pointerout',  () => resendLink.setColor(fg.tertiaryHex))
    resendLink.on('pointerdown', () => void this._resendCode(codeField, resendLink))

    // Error banner for verify
    const errorBanner = this.add.container(panelX, panelY + panelH / 2 + 18).setVisible(false)
    const errBg = this.add.graphics()
    errBg.fillStyle(dsState.error, 0.12)
    errBg.fillRoundedRect(-panelW / 2, -16, panelW, 32, radii.md)
    errBg.lineStyle(1, dsState.error, 1)
    errBg.strokeRoundedRect(-panelW / 2, -16, panelW, 32, radii.md)
    errorBanner.add(errBg)
    const errText = this.add.text(0, 0, '', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      dsState.errorHex,
      fontStyle:  '500',
    }).setOrigin(0.5)
    errorBanner.add(errText)
    this.errorBanner = errorBanner
    ;(errorBanner as unknown as { _errText: Phaser.GameObjects.Text })._errText = errText

    this.fields = [codeField]

    // Entrance animation
    this.tweens.add({
      targets: container, alpha: 1,
      duration: motion.durBase, ease: motion.easeOut,
    })
  }

  private async _submitVerify(code: string) {
    if (!code || code.length !== 6) {
      this._showError('Digite o código de 6 dígitos.')
      return
    }
    try {
      this._clearError()
      const { authService } = await import('../services')
      const result = await authService.verifyCode(this.pendingUserId!, code)
      this._applyRememberPreference()
      const { playerData } = await import('../utils/PlayerDataManager')
      playerData.syncFromServer(result.user!)
      this._transitionOut('LobbyScene')
    } catch (e: unknown) {
      this._showError(
        (e instanceof Error ? e.message : null) ||
        'Código inválido. Tente novamente.',
      )
    }
  }

  private async _resendCode(_codeField: InputFieldHandle, linkText: Phaser.GameObjects.Text) {
    try {
      linkText.setText('Enviando…').setColor(fg.tertiaryHex)
      const { authService } = await import('../services')
      await authService.resendCode(this.pendingUserId!)
      linkText.setText('Reenviar código').setColor(fg.primaryHex)
      this._clearError()
    } catch (e: unknown) {
      this._showError(
        (e instanceof Error ? e.message : null) ||
        'Erro ao reenviar. Tente novamente.',
      )
      linkText.setText('Reenviar código').setColor(fg.tertiaryHex)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRANSITION
  // ══════════════════════════════════════════════════════════════════════════

  private _transitionOut(targetScene: string) {
    const { W, H } = SCREEN
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setDepth(999)
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 400,
      onComplete: () => this.scene.start(targetScene),
    })
  }

  shutdown() {
    this.tweens.killAll()
    for (const f of this.fields) f.destroy()
    this.fields = []
  }
}
