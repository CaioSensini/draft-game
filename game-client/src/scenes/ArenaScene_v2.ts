import Phaser from 'phaser'
import ArenaScene from './ArenaScene'

// Versão incremental focada em visual polish sem quebrar a lógica existente
export default class ArenaSceneV2 extends ArenaScene {
  constructor() {
    super()
  }

  create() {
    super.create()

    // Overlay visual leve para dar sensação de profundidade
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.05)

    // Indicador visual de build V1
    this.add.text(20, 20, 'BUILD V1 - UI POLISH', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#facc15'
    })
  }
}
