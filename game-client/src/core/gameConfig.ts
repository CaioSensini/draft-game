import Phaser from 'phaser'
import BootScene from '../scenes/BootScene'
import MenuScene from '../scenes/MenuScene'
import DeckBuildScene from '../scenes/DeckBuildScene'
import ArenaScene from '../scenes/ArenaScene'

/**
 * Central Phaser game configuration.
 * All scene registration and engine settings live here so that main.ts
 * stays a one-liner and tests can import the config independently.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game',
  backgroundColor: '#0f1117',
  scene: [BootScene, MenuScene, DeckBuildScene, ArenaScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}
