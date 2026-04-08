import Phaser from 'phaser'

export default class LoginScene extends Phaser.Scene {
  private pendingUserId: string | null = null
  private formElement: Phaser.GameObjects.DOMElement | null = null

  constructor() {
    super('LoginScene')
  }

  create() {
    this.pendingUserId = null
    this.formElement = null

    // Draw dark fantasy background
    this.add.rectangle(640, 360, 1280, 720, 0x080a12)

    const title = this.add.text(640, 70, 'DRAFT GAME', {
      fontFamily: 'Arial',
      fontSize: '56px',
      color: '#f0c850',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    title.setShadow(2, 2, '#8b6914', 4)

    this.add.text(640, 125, 'by Codeforje VIO', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#7a7062',
    }).setOrigin(0.5)

    // Create HTML form using Phaser's DOM element support
    const formHtml = `
      <div style="background: #1a1f2e; border: 1px solid #3d2e14; border-radius: 8px; padding: 30px; width: 360px; font-family: Arial; box-shadow: 0 0 20px rgba(201,168,76,0.1), inset 0 1px 0 rgba(201,168,76,0.05);">
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <button id="tab-login" style="flex:1; padding: 10px; background: transparent; color: #f0c850; border: none; border-bottom: 2px solid #c9a84c; border-radius: 0; cursor: pointer; font-size: 14px; font-weight: bold; letter-spacing: 1px;">Login</button>
          <button id="tab-register" style="flex:1; padding: 10px; background: transparent; color: #7a7062; border: none; border-bottom: 2px solid transparent; border-radius: 0; cursor: pointer; font-size: 14px; letter-spacing: 1px;">Registrar</button>
        </div>
        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-bottom: 18px;"></div>
        <div id="login-form">
          <input id="login-user" type="text" placeholder="Username" style="width: 100%; padding: 11px; margin-bottom: 10px; background: #0a0d15; border: 1px solid #2a2418; border-radius: 4px; color: #e8e0d0; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#c9a84c'" onblur="this.style.borderColor='#2a2418'" />
          <input id="login-pass" type="password" placeholder="Senha" style="width: 100%; padding: 11px; margin-bottom: 15px; background: #0a0d15; border: 1px solid #2a2418; border-radius: 4px; color: #e8e0d0; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#c9a84c'" onblur="this.style.borderColor='#2a2418'" />
          <button id="btn-login" style="width: 100%; padding: 12px; background: #2e4a1e; color: #f0c850; border: 1px solid #5a8a3a; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; letter-spacing: 1px; transition: background 0.2s, border-color 0.2s;" onmouseover="this.style.background='#3a5c26'; this.style.borderColor='#7aaa5a'" onmouseout="this.style.background='#2e4a1e'; this.style.borderColor='#5a8a3a'">Entrar</button>
        </div>
        <div id="register-form" style="display: none;">
          <input id="reg-user" type="text" placeholder="Username" style="width: 100%; padding: 11px; margin-bottom: 10px; background: #0a0d15; border: 1px solid #2a2418; border-radius: 4px; color: #e8e0d0; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#c9a84c'" onblur="this.style.borderColor='#2a2418'" />
          <input id="reg-email" type="email" placeholder="Email" style="width: 100%; padding: 11px; margin-bottom: 10px; background: #0a0d15; border: 1px solid #2a2418; border-radius: 4px; color: #e8e0d0; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#c9a84c'" onblur="this.style.borderColor='#2a2418'" />
          <input id="reg-pass" type="password" placeholder="Senha" style="width: 100%; padding: 11px; margin-bottom: 15px; background: #0a0d15; border: 1px solid #2a2418; border-radius: 4px; color: #e8e0d0; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#c9a84c'" onblur="this.style.borderColor='#2a2418'" />
          <button id="btn-register" style="width: 100%; padding: 12px; background: #1a2a4a; color: #4fc3f7; border: 1px solid #3a6a9a; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; letter-spacing: 1px; transition: background 0.2s, border-color 0.2s;" onmouseover="this.style.background='#223a5a'; this.style.borderColor='#5a8aba'" onmouseout="this.style.background='#1a2a4a'; this.style.borderColor='#3a6a9a'">Criar Conta</button>
        </div>
        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-top: 14px;"></div>
        <p id="error-msg" style="color: #c62828; font-size: 13px; margin-top: 10px; text-align: center; min-height: 20px;"></p>
      </div>
    `

    const element = this.add.dom(640, 390).createFromHTML(formHtml)
    this.formElement = element

    // Tab switching
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
      registerTab.style.color = '#7a7062'
      registerTab.style.fontWeight = 'normal'
      registerTab.style.borderBottom = '2px solid transparent'
      errorMsg.textContent = ''
    })

    registerTab.addEventListener('click', () => {
      loginForm.style.display = 'none'
      registerForm.style.display = 'block'
      registerTab.style.color = '#4fc3f7'
      registerTab.style.fontWeight = 'bold'
      registerTab.style.borderBottom = '2px solid #4fc3f7'
      loginTab.style.color = '#7a7062'
      loginTab.style.fontWeight = 'normal'
      loginTab.style.borderBottom = '2px solid transparent'
      errorMsg.textContent = ''
    })

    // Login handler
    const btnLogin = element.getChildByID('btn-login') as HTMLButtonElement
    btnLogin.addEventListener('click', async () => {
      const username = (element.getChildByID('login-user') as HTMLInputElement).value.trim()
      const password = (element.getChildByID('login-pass') as HTMLInputElement).value
      if (!username || !password) {
        errorMsg.textContent = 'Preencha todos os campos.'
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

        // Sync player data from server response
        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.syncFromServer(result.user!)
        this.scene.start('LobbyScene')
      } catch (e: unknown) {
        errorMsg.style.color = '#c62828'
        errorMsg.textContent = (e instanceof Error ? e.message : null) || 'Erro ao conectar. Verifique se o servidor esta rodando.'
      }
    })

    // Register handler
    const btnRegister = element.getChildByID('btn-register') as HTMLButtonElement
    btnRegister.addEventListener('click', async () => {
      const username = (element.getChildByID('reg-user') as HTMLInputElement).value.trim()
      const email = (element.getChildByID('reg-email') as HTMLInputElement).value.trim()
      const password = (element.getChildByID('reg-pass') as HTMLInputElement).value
      if (!username || !email || !password) {
        errorMsg.textContent = 'Preencha todos os campos.'
        return
      }
      if (password.length < 6) {
        errorMsg.textContent = 'Senha deve ter pelo menos 6 caracteres.'
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

        // Sync player data from server response
        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.syncFromServer(result.user!)
        this.scene.start('LobbyScene')
      } catch (e: unknown) {
        errorMsg.style.color = '#c62828'
        errorMsg.textContent = (e instanceof Error ? e.message : null) || 'Erro ao registrar. Verifique se o servidor esta rodando.'
      }
    })
  }

  private showVerificationForm(userId: string) {
    this.pendingUserId = userId

    // Remove the current login/register form
    if (this.formElement) {
      this.formElement.destroy()
      this.formElement = null
    }

    const verifyHtml = `
      <div style="background: #1a1f2e; border: 1px solid #3d2e14; border-radius: 8px; padding: 30px; width: 360px; font-family: Arial; text-align: center; box-shadow: 0 0 20px rgba(201,168,76,0.1), inset 0 1px 0 rgba(201,168,76,0.05);">
        <h3 style="color: #f0c850; margin-bottom: 8px; letter-spacing: 1px;">Verificacao de Email</h3>
        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-bottom: 16px;"></div>
        <p style="color: #e8e0d0; font-size: 14px; margin-bottom: 20px;">
          Um codigo de 6 digitos foi enviado para seu email. Digite abaixo:
        </p>
        <input id="verify-code" type="text" maxlength="6" placeholder="000000"
          style="width: 200px; padding: 14px; text-align: center; font-size: 28px; letter-spacing: 8px; background: #0a0d15; border: 2px solid #2a2418; border-radius: 4px; color: #4caf50; font-weight: bold; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#c9a84c'" onblur="this.style.borderColor='#2a2418'" />
        <br/><br/>
        <button id="btn-verify" style="width: 100%; padding: 12px; background: #2e4a1e; color: #f0c850; border: 1px solid #5a8a3a; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; letter-spacing: 1px; transition: background 0.2s, border-color 0.2s;" onmouseover="this.style.background='#3a5c26'; this.style.borderColor='#7aaa5a'" onmouseout="this.style.background='#2e4a1e'; this.style.borderColor='#5a8a3a'">
          Verificar
        </button>
        <div style="width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #3d2e14, transparent); margin-top: 14px;"></div>
        <p id="verify-error" style="color: #c62828; font-size: 13px; margin-top: 10px; min-height: 20px;"></p>
        <button id="btn-resend" style="background: none; border: none; color: #4fc3f7; cursor: pointer; font-size: 13px; margin-top: 5px; transition: color 0.2s;" onmouseover="this.style.color='#81d4fa'" onmouseout="this.style.color='#4fc3f7'">
          Reenviar codigo
        </button>
      </div>
    `

    const verifyEl = this.add.dom(640, 380).createFromHTML(verifyHtml)
    this.formElement = verifyEl

    const verifyError = verifyEl.getChildByID('verify-error') as HTMLParagraphElement

    // Verify button handler
    const btnVerify = verifyEl.getChildByID('btn-verify') as HTMLButtonElement
    btnVerify.addEventListener('click', async () => {
      const code = (verifyEl.getChildByID('verify-code') as HTMLInputElement).value.trim()
      if (!code || code.length !== 6) {
        verifyError.textContent = 'Digite o codigo de 6 digitos.'
        verifyError.style.color = '#c62828'
        return
      }
      try {
        verifyError.textContent = 'Verificando...'
        verifyError.style.color = '#7a7062'
        const { authService } = await import('../services')
        const result = await authService.verifyCode(this.pendingUserId!, code)

        // Sync player data and go to lobby
        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.syncFromServer(result.user!)
        this.scene.start('LobbyScene')
      } catch (e: unknown) {
        verifyError.style.color = '#c62828'
        verifyError.textContent = (e instanceof Error ? e.message : null) || 'Codigo invalido. Tente novamente.'
      }
    })

    // Resend button handler
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
        verifyError.style.color = '#c62828'
        verifyError.textContent = (e instanceof Error ? e.message : null) || 'Erro ao reenviar. Tente novamente.'
        btnResend.textContent = 'Reenviar codigo'
        btnResend.disabled = false
      }
    })
  }
}
