import Phaser from 'phaser'
import BootScene from '../scenes/BootScene'
import LoginScene from '../scenes/LoginScene'
import MenuScene from '../scenes/MenuScene'
import LobbyScene from '../scenes/LobbyScene'
import DeckBuildScene from '../scenes/DeckBuildScene'
import PvESelectScene from '../scenes/PvESelectScene'
import ShopScene from '../scenes/ShopScene'
import ProfileScene from '../scenes/ProfileScene'
import BattleScene from '../scenes/BattleScene'
import BattleResultScene from '../scenes/BattleResultScene'
import SkillUpgradeScene from '../scenes/SkillUpgradeScene'
import SettingsScene from '../scenes/SettingsScene'
import TrainingScene from '../scenes/TrainingScene'
import TournamentScene from '../scenes/TournamentScene'
import RankedScene from '../scenes/RankedScene'
import RankingScene from '../scenes/RankingScene'
import PvPLobbyScene from '../scenes/PvPLobbyScene'
import PvELobbyScene from '../scenes/PvELobbyScene'
import CustomLobbyScene from '../scenes/CustomLobbyScene'
import BracketScene from '../scenes/BracketScene'
import BattlePassScene from '../scenes/BattlePassScene'

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
  scene: [BootScene, LoginScene, MenuScene, LobbyScene, DeckBuildScene, PvESelectScene, ShopScene, ProfileScene, BattleScene, BattleResultScene, SkillUpgradeScene, SettingsScene, TrainingScene, TournamentScene, RankedScene, RankingScene, PvPLobbyScene, PvELobbyScene, CustomLobbyScene, BracketScene, BattlePassScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: {
    createContainer: true,
  },
}
