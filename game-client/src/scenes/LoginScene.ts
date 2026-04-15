import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'

export default class LoginScene extends Phaser.Scene {
  private pendingUserId: string | null = null
  private formElement: Phaser.GameObjects.DOMElement | null = null

  constructor() {
    super('LoginScene')
  }

  create() {
    this.pendingUserId = null
    this.formElement = null

    const { width } = this.scale

    UI.background(this)
    UI.particles(this, 22)

    // =========================================================================
    // TITLE AREA: "DRAFT GAME" logo (smaller than menu, 48px)
    // =========================================================================
    const titleText = this.add
      .text(width / 2, 55, 'DRAFT', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '48px',
        color: '#f0c850',
        fontStyle: 'bold',
        shadow: {
          offsetX: 0,
          offsetY: 3,
          color: '#8b6914',
          blur: 8,
          fill: true,
        },
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, 98, 'GAME', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '22px',
        color: '#c9a84c',
        fontStyle: 'bold',
        shadow: {
          offsetX: 0,
          offsetY: 2,
          color: '#5a3a00',
          blur: 4,
          fill: true,
        },
      })
      .setOrigin(0.5)

    // Decorative lines under title
    this.add.rectangle(width / 2 - 120, 118, 80, 1, 0xc9a84c, 0.35)
    this.add.rectangle(width / 2 + 120, 118, 80, 1, 0xc9a84c, 0.35)
    // Small diamond center
    const diamondGfx = this.add.graphics()
    diamondGfx.fillStyle(0xc9a84c, 0.5)
    diamondGfx.fillPoints(
      [
        new Phaser.Geom.Point(width / 2, 118 - 3),
        new Phaser.Geom.Point(width / 2 + 3, 118),
        new Phaser.Geom.Point(width / 2, 118 + 3),
        new Phaser.Geom.Point(width / 2 - 3, 118),
      ],
      true,
    )

    this.add
      .text(width / 2, 135, 'by Codeforje VIO', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#5a4a30',
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: '#000000',
          blur: 2,
          fill: true,
        },
      })
      .setOrigin(0.5)

    // =========================================================================
    // ENTRANCE: Fade from black
    // =========================================================================
    UI.fadeIn(this)

    // Title entrance
    titleText.setAlpha(0).setY(40)
    this.tweens.add({
      targets: titleText,
      alpha: 1,
      y: 55,
      duration: 600,
      delay: 100,
      ease: 'Back.Out',
    })

    // =========================================================================
    // HTML FORM: Premium dark fantasy login/register form
    // =========================================================================
    this.showMainForm()
  }

  // ===========================================================================
  // Main login/register form
  // ===========================================================================
  private showMainForm() {
    const { width } = this.scale

    const formHtml = `
      <div id="login-panel" style="
        background: linear-gradient(180deg, #141a2a 0%, #0e1320 100%);
        border: 1.5px solid #3d2e14;
        border-radius: 12px;
        padding: 28px 32px;
        width: 370px;
        font-family: Arial, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
        position: relative;
      ">
        <!-- Inner top gold highlight -->
        <div style="
          position: absolute; top: 0; left: 12px; right: 12px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent);
        "></div>

        <!-- TAB BUTTONS -->
        <div style="display: flex; gap: 0; margin-bottom: 20px;">
          <button id="tab-login" style="
            flex: 1; padding: 10px 0; background: transparent; color: #f0c850;
            border: none; border-bottom: 2px solid #c9a84c; cursor: pointer;
            font-size: 14px; font-weight: bold; letter-spacing: 1.5px;
            font-family: Arial, sans-serif;
            transition: color 0.2s, border-color 0.2s;
          ">LOGIN</button>
          <button id="tab-register" style="
            flex: 1; padding: 10px 0; background: transparent; color: #5a4a38;
            border: none; border-bottom: 2px solid transparent; cursor: pointer;
            font-size: 14px; letter-spacing: 1.5px;
            font-family: Arial, sans-serif;
            transition: color 0.2s, border-color 0.2s;
          ">REGISTRAR</button>
        </div>

        <!-- Separator -->
        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-bottom: 18px;"></div>

        <!-- LOGIN FORM -->
        <div id="login-form">
          <input id="login-user" type="text" placeholder="Username"
            style="
              width: 100%; padding: 12px 14px; margin-bottom: 12px;
              background: #080c16; border: 1.5px solid #1e1a14; border-radius: 6px;
              color: #e8e0d0; font-size: 14px; box-sizing: border-box;
              outline: none; transition: border-color 0.2s, box-shadow 0.2s;
              font-family: Arial, sans-serif;
            "
            onfocus="this.style.borderColor='#c9a84c'; this.style.boxShadow='0 0 8px rgba(201,168,76,0.3)'"
            onblur="this.style.borderColor='#1e1a14'; this.style.boxShadow='none'"
          />
          <input id="login-pass" type="password" placeholder="Senha"
            style="
              width: 100%; padding: 12px 14px; margin-bottom: 16px;
              background: #080c16; border: 1.5px solid #1e1a14; border-radius: 6px;
              color: #e8e0d0; font-size: 14px; box-sizing: border-box;
              outline: none; transition: border-color 0.2s, box-shadow 0.2s;
              font-family: Arial, sans-serif;
            "
            onfocus="this.style.borderColor='#c9a84c'; this.style.boxShadow='0 0 8px rgba(201,168,76,0.3)'"
            onblur="this.style.borderColor='#1e1a14'; this.style.boxShadow='none'"
          />
          <button id="btn-login" style="
            width: 100%; padding: 13px; background: linear-gradient(180deg, #2a4e1e 0%, #1e3a16 100%);
            color: #b8e8a0; border: 1.5px solid #4a8a3a; border-radius: 6px;
            cursor: pointer; font-size: 16px; font-weight: bold; letter-spacing: 1.5px;
            font-family: Arial, sans-serif;
            transition: filter 0.15s, transform 0.15s, border-color 0.2s;
            text-shadow: 0 1px 3px rgba(0,0,0,0.4);
          "
            onmouseover="this.style.filter='brightness(1.15)'; this.style.transform='translateY(-1px)'; this.style.borderColor='#6aaa5a'"
            onmouseout="this.style.filter='none'; this.style.transform='none'; this.style.borderColor='#4a8a3a'"
          >ENTRAR</button>
        </div>

        <!-- REGISTER FORM -->
        <div id="register-form" style="display: none;">
          <input id="reg-user" type="text" placeholder="Username"
            style="
              width: 100%; padding: 12px 14px; margin-bottom: 12px;
              background: #080c16; border: 1.5px solid #1e1a14; border-radius: 6px;
              color: #e8e0d0; font-size: 14px; box-sizing: border-box;
              outline: none; transition: border-color 0.2s, box-shadow 0.2s;
              font-family: Arial, sans-serif;
            "
            onfocus="this.style.borderColor='#c9a84c'; this.style.boxShadow='0 0 8px rgba(201,168,76,0.3)'"
            onblur="this.style.borderColor='#1e1a14'; this.style.boxShadow='none'"
          />
          <input id="reg-email" type="email" placeholder="Email"
            style="
              width: 100%; padding: 12px 14px; margin-bottom: 12px;
              background: #080c16; border: 1.5px solid #1e1a14; border-radius: 6px;
              color: #e8e0d0; font-size: 14px; box-sizing: border-box;
              outline: none; transition: border-color 0.2s, box-shadow 0.2s;
              font-family: Arial, sans-serif;
            "
            onfocus="this.style.borderColor='#c9a84c'; this.style.boxShadow='0 0 8px rgba(201,168,76,0.3)'"
            onblur="this.style.borderColor='#1e1a14'; this.style.boxShadow='none'"
          />
          <input id="reg-pass" type="password" placeholder="Senha (min. 6 caracteres)"
            style="
              width: 100%; padding: 12px 14px; margin-bottom: 16px;
              background: #080c16; border: 1.5px solid #1e1a14; border-radius: 6px;
              color: #e8e0d0; font-size: 14px; box-sizing: border-box;
              outline: none; transition: border-color 0.2s, box-shadow 0.2s;
              font-family: Arial, sans-serif;
            "
            onfocus="this.style.borderColor='#c9a84c'; this.style.boxShadow='0 0 8px rgba(201,168,76,0.3)'"
            onblur="this.style.borderColor='#1e1a14'; this.style.boxShadow='none'"
          />
          <button id="btn-register" style="
            width: 100%; padding: 13px; background: linear-gradient(180deg, #1e3a5a 0%, #162a4a 100%);
            color: #80c8f7; border: 1.5px solid #3a6a9a; border-radius: 6px;
            cursor: pointer; font-size: 16px; font-weight: bold; letter-spacing: 1.5px;
            font-family: Arial, sans-serif;
            transition: filter 0.15s, transform 0.15s, border-color 0.2s;
            text-shadow: 0 1px 3px rgba(0,0,0,0.4);
          "
            onmouseover="this.style.filter='brightness(1.15)'; this.style.transform='translateY(-1px)'; this.style.borderColor='#5a8aba'"
            onmouseout="this.style.filter='none'; this.style.transform='none'; this.style.borderColor='#3a6a9a'"
          >CRIAR CONTA</button>
        </div>

        <!-- Separator -->
        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-top: 14px;"></div>

        <!-- Error message -->
        <p id="error-msg" style="
          color: #e05555; font-size: 13px; margin-top: 10px; text-align: center;
          min-height: 20px; text-shadow: 0 1px 3px rgba(0,0,0,0.4);
          font-family: Arial, sans-serif; transition: color 0.2s;
        "></p>
      </div>
    `

    const element = this.add.dom(width / 2, 395).createFromHTML(formHtml)
    this.formElement = element

    // --- Tab switching ---
    const loginTab = element.getChildByID('tab-login') as HTMLButtonElement
    const registerTab = element.getChildByID('tab-register') as HTMLButtonElement
    const loginForm = element.getChildByID('login-form') as HTMLDivElement
    const registerForm = element.getChildByID('register-form') as HTMLDivElement
    const errorMsg = element.getChildByID('error-msg') as HTMLParagraphElement

    loginTab.addEventListener('click', () => {
      loginForm.style.display = 'block'
      registerForm.style.display = 'none'
      loginTab.style.color = '#f0c850'
      loginTab.style.fontWeight = 'bold'
      loginTab.style.borderBottom = '2px solid #c9a84c'
      registerTab.style.color = '#5a4a38'
      registerTab.style.fontWeight = 'normal'
      registerTab.style.borderBottom = '2px solid transparent'
      errorMsg.textContent = ''
    })

    registerTab.addEventListener('click', () => {
      loginForm.style.display = 'none'
      registerForm.style.display = 'block'
      registerTab.style.color = '#80c8f7'
      registerTab.style.fontWeight = 'bold'
      registerTab.style.borderBottom = '2px solid #4fc3f7'
      loginTab.style.color = '#5a4a38'
      loginTab.style.fontWeight = 'normal'
      loginTab.style.borderBottom = '2px solid transparent'
      errorMsg.textContent = ''
    })

    // --- Login handler ---
    const btnLogin = element.getChildByID('btn-login') as HTMLButtonElement
    btnLogin.addEventListener('click', async () => {
      const username = (element.getChildByID('login-user') as HTMLInputElement).value.trim()
      const password = (element.getChildByID('login-pass') as HTMLInputElement).value
      if (!username || !password) {
        errorMsg.textContent = 'Preencha todos os campos.'
        errorMsg.style.color = '#e05555'
        return
      }
      try {
        errorMsg.textContent = 'Conectando...'
        errorMsg.style.color = '#7a7062'
        const { authService } = await import('../services')
        const result = await authService.login(username, password)

        if (result.pendingVerification && result.userId) {
          this.showVerificationForm(result.userId)
          return
        }

        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.syncFromServer(result.user!)
        this.transitionOut('LobbyScene')
      } catch (e: unknown) {
        errorMsg.style.color = '#e05555'
        errorMsg.textContent =
          (e instanceof Error ? e.message : null) || 'Erro ao conectar. Verifique se o servidor esta rodando.'
      }
    })

    // --- Register handler ---
    const btnRegister = element.getChildByID('btn-register') as HTMLButtonElement
    btnRegister.addEventListener('click', async () => {
      const username = (element.getChildByID('reg-user') as HTMLInputElement).value.trim()
      const email = (element.getChildByID('reg-email') as HTMLInputElement).value.trim()
      const password = (element.getChildByID('reg-pass') as HTMLInputElement).value
      if (!username || !email || !password) {
        errorMsg.textContent = 'Preencha todos os campos.'
        errorMsg.style.color = '#e05555'
        return
      }
      if (password.length < 6) {
        errorMsg.textContent = 'Senha deve ter pelo menos 6 caracteres.'
        errorMsg.style.color = '#e05555'
        return
      }
      try {
        errorMsg.textContent = 'Criando conta...'
        errorMsg.style.color = '#7a7062'
        const { authService } = await import('../services')
        const result = await authService.register(username, email, password)

        if (result.pendingVerification && result.userId) {
          this.showVerificationForm(result.userId)
          return
        }

        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.syncFromServer(result.user!)
        this.transitionOut('LobbyScene')
      } catch (e: unknown) {
        errorMsg.style.color = '#e05555'
        errorMsg.textContent =
          (e instanceof Error ? e.message : null) || 'Erro ao registrar. Verifique se o servidor esta rodando.'
      }
    })
  }

  // ===========================================================================
  // Verification form (premium treatment)
  // ===========================================================================
  private showVerificationForm(userId: string) {
    this.pendingUserId = userId
    const { width } = this.scale

    if (this.formElement) {
      this.formElement.destroy()
      this.formElement = null
    }

    const verifyHtml = `
      <div style="
        background: linear-gradient(180deg, #141a2a 0%, #0e1320 100%);
        border: 1.5px solid #3d2e14;
        border-radius: 12px;
        padding: 28px 32px;
        width: 370px;
        font-family: Arial, sans-serif;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
        position: relative;
      ">
        <!-- Inner top gold highlight -->
        <div style="
          position: absolute; top: 0; left: 12px; right: 12px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent);
        "></div>

        <h3 style="
          color: #f0c850; margin: 0 0 8px 0; letter-spacing: 1.5px; font-size: 18px;
          text-shadow: 0 2px 4px rgba(139,105,20,0.4);
          font-family: Arial, sans-serif;
        ">VERIFICACAO DE EMAIL</h3>

        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-bottom: 16px;"></div>

        <p style="color: #c0b8a8; font-size: 14px; margin: 0 0 20px 0; line-height: 1.5; font-family: Arial, sans-serif;">
          Um codigo de 6 digitos foi enviado para seu email.<br/>Digite abaixo:
        </p>

        <input id="verify-code" type="text" maxlength="6" placeholder="000000"
          style="
            width: 200px; padding: 14px; text-align: center; font-size: 28px;
            letter-spacing: 8px; background: #080c16; border: 2px solid #1e1a14;
            border-radius: 8px; color: #4caf50; font-weight: bold;
            box-sizing: border-box; outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            font-family: 'Courier New', monospace;
            text-shadow: 0 0 6px rgba(76,175,80,0.3);
          "
          onfocus="this.style.borderColor='#c9a84c'; this.style.boxShadow='0 0 10px rgba(201,168,76,0.3)'"
          onblur="this.style.borderColor='#1e1a14'; this.style.boxShadow='none'"
        />
        <br/><br/>

        <button id="btn-verify" style="
          width: 100%; padding: 13px; background: linear-gradient(180deg, #2a4e1e 0%, #1e3a16 100%);
          color: #b8e8a0; border: 1.5px solid #4a8a3a; border-radius: 6px;
          cursor: pointer; font-size: 16px; font-weight: bold; letter-spacing: 1.5px;
          font-family: Arial, sans-serif;
          transition: filter 0.15s, transform 0.15s, border-color 0.2s;
          text-shadow: 0 1px 3px rgba(0,0,0,0.4);
        "
          onmouseover="this.style.filter='brightness(1.15)'; this.style.transform='translateY(-1px)'; this.style.borderColor='#6aaa5a'"
          onmouseout="this.style.filter='none'; this.style.transform='none'; this.style.borderColor='#4a8a3a'"
        >VERIFICAR</button>

        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-top: 14px;"></div>

        <p id="verify-error" style="
          color: #e05555; font-size: 13px; margin-top: 10px; min-height: 20px;
          text-shadow: 0 1px 3px rgba(0,0,0,0.4);
          font-family: Arial, sans-serif; transition: color 0.2s;
        "></p>

        <button id="btn-resend" style="
          background: none; border: none; color: #4fc3f7; cursor: pointer;
          font-size: 13px; margin-top: 2px; padding: 4px 8px;
          font-family: Arial, sans-serif;
          transition: color 0.15s, filter 0.15s;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        "
          onmouseover="this.style.color='#81d4fa'; this.style.filter='brightness(1.2)'"
          onmouseout="this.style.color='#4fc3f7'; this.style.filter='none'"
        >Reenviar codigo</button>
      </div>
    `

    const verifyEl = this.add.dom(width / 2, 395).createFromHTML(verifyHtml)
    this.formElement = verifyEl

    const verifyError = verifyEl.getChildByID('verify-error') as HTMLParagraphElement

    // Verify button
    const btnVerify = verifyEl.getChildByID('btn-verify') as HTMLButtonElement
    btnVerify.addEventListener('click', async () => {
      const code = (verifyEl.getChildByID('verify-code') as HTMLInputElement).value.trim()
      if (!code || code.length !== 6) {
        verifyError.textContent = 'Digite o codigo de 6 digitos.'
        verifyError.style.color = '#e05555'
        return
      }
      try {
        verifyError.textContent = 'Verificando...'
        verifyError.style.color = '#7a7062'
        const { authService } = await import('../services')
        const result = await authService.verifyCode(this.pendingUserId!, code)

        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.syncFromServer(result.user!)
        this.transitionOut('LobbyScene')
      } catch (e: unknown) {
        verifyError.style.color = '#e05555'
        verifyError.textContent =
          (e instanceof Error ? e.message : null) || 'Codigo invalido. Tente novamente.'
      }
    })

    // Resend button
    const btnResend = verifyEl.getChildByID('btn-resend') as HTMLButtonElement
    btnResend.addEventListener('click', async () => {
      try {
        btnResend.disabled = true
        btnResend.textContent = 'Enviando...'
        const { authService } = await import('../services')
        await authService.resendCode(this.pendingUserId!)
        verifyError.style.color = '#4caf50'
        verifyError.textContent = 'Codigo reenviado!'
        btnResend.textContent = 'Reenviar codigo'
        btnResend.disabled = false
      } catch (e: unknown) {
        verifyError.style.color = '#e05555'
        verifyError.textContent =
          (e instanceof Error ? e.message : null) || 'Erro ao reenviar. Tente novamente.'
        btnResend.textContent = 'Reenviar codigo'
        btnResend.disabled = false
      }
    })
  }

  // ===========================================================================
  // Fade-to-black transition helper
  // ===========================================================================
  private transitionOut(targetScene: string) {
    const { width, height } = this.scale
    const overlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0)
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
  }
}
