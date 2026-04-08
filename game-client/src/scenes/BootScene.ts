import Phaser from 'phaser'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  async create() {
    const token = localStorage.getItem('draft_token')
    if (!token) {
      this.scene.start('LoginScene')
      return
    }

    // Token exists — validate it by calling the API
    try {
      const { authService } = await import('../services')
      const user = await authService.getProfile()
      // Token is valid — sync data and go to lobby
      const { playerData } = await import('../utils/PlayerDataManager')
      playerData.syncFromServer(user)
      this.scene.start('LobbyScene')
    } catch {
      // Token expired or invalid — clear it and go to login
      localStorage.removeItem('draft_token')
      this.scene.start('LoginScene')
    }
  }
}
