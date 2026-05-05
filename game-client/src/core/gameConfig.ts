import Phaser from 'phaser'
import BootScene from '../scenes/BootScene'
import LoginScene from '../scenes/LoginScene'
import MenuScene from '../scenes/MenuScene'
import LobbyScene from '../scenes/LobbyScene'
import DeckBuildScene from '../scenes/DeckBuildScene'
import ShopScene from '../scenes/ShopScene'
import ProfileScene from '../scenes/ProfileScene'
import BattleScene from '../scenes/BattleScene'
import BattleResultScene from '../scenes/BattleResultScene'
import SkillUpgradeScene from '../scenes/SkillUpgradeScene'
import SettingsScene from '../scenes/SettingsScene'
import RankedScene from '../scenes/RankedScene'
import RankingScene from '../scenes/RankingScene'
import PvPLobbyScene from '../scenes/PvPLobbyScene'
import PvELobbyScene from '../scenes/PvELobbyScene'
import CustomLobbyScene from '../scenes/CustomLobbyScene'
import BracketScene from '../scenes/BracketScene'
import BattlePassScene from '../scenes/BattlePassScene'
import MatchmakingScene from '../scenes/MatchmakingScene'
import RaidHubScene from '../scenes/RaidHubScene'
import { SCREEN } from '../utils/DesignTokens'

/**
 * Central Phaser game configuration.
 *
 * ── Sprint 0.6 (mobile readiness) ─────────────────────────────────────────
 *   - Scale config uses FIT mode with CENTER_BOTH to preserve aspect ratio
 *     and fit the canvas inside desktop windows, iPhone/iPad landscape,
 *     and Android landscape.
 *   - parent, width, and height live INSIDE the `scale` object. Phaser's
 *     Scale Manager only picks up width/height reliably when declared there
 *     (top-level width/height are a deprecated fallback).
 *   - Base resolution stays 1280x720 (16:9) — matches SCREEN token.
 *   - Landscape is enforced at the HTML level (index.html meta tags) and
 *     via screen.orientation.lock('landscape') in main.ts on supported
 *     platforms.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#0f1117',
  scene: [
    BootScene,
    LoginScene,
    MenuScene,
    LobbyScene,
    DeckBuildScene,
    ShopScene,
    ProfileScene,
    BattleScene,
    BattleResultScene,
    SkillUpgradeScene,
    SettingsScene,
    RankedScene,
    RankingScene,
    PvPLobbyScene,
    PvELobbyScene,
    CustomLobbyScene,
    BracketScene,
    BattlePassScene,
    MatchmakingScene,
    RaidHubScene,
  ],
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent:     'game',
    width:      SCREEN.W,
    height:     SCREEN.H,
  },
  dom: {
    createContainer: true,
  },
  input: {
    // Accept both mouse and touch; no need to toggle at runtime.
    activePointers: 3,
  },
  render: {
    // Keeps pixel-art assets crisp on high-DPI mobile screens; avoids
    // blurry tile textures when the canvas is scaled up.
    pixelArt: false,
    antialias: true,
    roundPixels: true,
  },
}
