/**
 * scenes/RaidHubScene.ts — the "Offline Raid" command room.
 *
 * Reached from the lobby's offline-attack tile via the explainer popup's
 * PARTICIPAR button. The hub is the player's home for everything related
 * to offline raids (defense + attack). It hosts:
 *
 *   ┌─ TOP BAR ─────────────────────────────────────────────────────┐
 *   │  [back]  HUB DE RAIDS                       [gold] [DG]       │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │           [hero emblem · sword inside shield]                 │
 *   │           "Configure sua participação..."                     │
 *   │  [⚔ ATAQUES HOJE x/10]    [🛡 DEFESAS HOJE x/10]              │
 *   │  ┌─ MAESTRIAS ────────────────────────────────────────────┐   │
 *   │  │   ⚔ Ataque  N disp / N ganhos     🛡 Defesa  …          │   │
 *   │  └────────────────────────────────────────────────────────┘   │
 *   │  [PARTICIPAR DO MODO OFFLINE                       [toggle]]  │
 *   │  ┌─ DEFESAS EQUIPADAS · n/4 ──────────── [VER LOJA] ────┐    │
 *   │  │  [slot1]  [slot2]  [slot3]  [slot4]                   │    │
 *   │  └───────────────────────────────────────────────────────┘    │
 *   │                  [ATACAR AGORA]                                │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Slot interactions:
 *   - Tapping an empty slot opens a modal listing the player's owned-but-
 *     unequipped fortifications. Picking one fills that slot.
 *   - Tapping a filled slot opens a confirmation modal with an option to
 *     remove the fortification (it stays in inventory with its remaining-
 *     defense count preserved).
 *   - The "VER LOJA" CTA on the equip-panel header routes to the
 *     ShopScene with the fortifications tab pre-selected.
 *
 * Combat hookup: only fortifications with `equipped=true` tick down when
 * `playerData.recordRaidDefense()` runs — see PlayerDataManager.
 *
 * Action button "ATACAR AGORA" is enabled only when participation is on
 * AND today's raid quota isn't exhausted; it consumes one attack and
 * launches BattleScene with a raid payload built from the offline-raid
 * matchmaker.
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import {
  SCREEN, surface, border, accent, fg, state,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { soundManager } from '../utils/SoundManager'
import {
  playerData,
  RAID_DAILY_LIMIT,
  RAID_EQUIP_SLOTS,
} from '../utils/PlayerDataManager'
import { drawSwordIcon, drawShieldIcon } from '../utils/CombatIcons'
import {
  RAID_FORTIFICATIONS,
  findFortification,
  type FortificationType,
} from '../data/raidFortifications'
import { findOfflineRaidTargets, buildRaidBattlePayload } from '../utils/OfflineRaidMatchmaking'
import { t } from '../i18n'

const W = SCREEN.W
const H = SCREEN.H

const TOP_BAR_H = 60

// Theme constants — same red/blue/gold vocabulary the lobby tile + popup
// use, so the hub reads as a continuation of the same feature.
const ATTACK_C    = 0xef4444
const DEFENSE_C   = 0x3b82f6
const ATTACK_HEX  = '#ef4444'
const DEFENSE_HEX = '#3b82f6'
const NEUTRAL_BASE = 0x101729

// Vertical layout — every band's centerY in absolute screen pixels.
// Centralising these keeps the hub readable and prevents the historical
// "elements piled on top of each other" bug.
const HERO_CY     = 110
const COUNTERS_CY = 188
const MASTERY_CY  = 262
const TOGGLE_CY   = 332
const EQUIP_HEAD_Y = 380
const EQUIP_SLOTS_CY = 460
const ATTACK_BTN_CY = 600

export default class RaidHubScene extends Phaser.Scene {
  private _equipLayer: Phaser.GameObjects.Container | null = null
  private _attackButtonRedraw: ((enabled: boolean) => void) | null = null
  private _attackButtonHint: Phaser.GameObjects.Text | null = null
  private _modalContainer: Phaser.GameObjects.Container | null = null

  constructor() {
    super('RaidHubScene')
  }

  create() {
    UI.background(this)
    UI.particles(this, 14)

    this._drawTopBar()
    this._drawHero()
    this._drawCounters()
    this._drawMasteryPanel()
    this._drawParticipationToggle()
    this._drawEquipPanel()
    this._drawActionButton()

    UI.fadeIn(this)
  }

  // ── Top bar ────────────────────────────────────────────────────────────────

  private _drawTopBar() {
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.97)
    bg.fillRect(0, 0, W, TOP_BAR_H)
    bg.fillStyle(border.subtle, 1)
    bg.fillRect(0, TOP_BAR_H - 1, W, 1)

    UI.backArrow(this, () => {
      soundManager.playClick()
      transitionTo(this, 'LobbyScene')
    })

    this.add.text(70, TOP_BAR_H / 2, t('scenes.raid-hub.title'), {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(3)

    UI.currencyPill(this, W - 220, TOP_BAR_H / 2, {
      kind: 'gold', amount: playerData.getGold(),
    })
    UI.currencyPill(this, W - 90, TOP_BAR_H / 2, {
      kind: 'dg', amount: playerData.getDG(),
    })
  }

  // ── Hero band — compact emblem + subtitle ─────────────────────────────────

  private _drawHero() {
    const heroY = HERO_CY

    // Twin halos behind the emblem
    this.tweens.add({
      targets: this.add.circle(W / 2 - 18, heroY, 38, ATTACK_C, 0.15),
      alpha: { from: 0.10, to: 0.25 }, scale: { from: 0.95, to: 1.10 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
    this.tweens.add({
      targets: this.add.circle(W / 2 + 18, heroY, 38, DEFENSE_C, 0.15),
      alpha: { from: 0.10, to: 0.25 }, scale: { from: 0.95, to: 1.10 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: 800,
    })

    const shieldGfx = this.add.graphics()
    drawShieldIcon(shieldGfx, W / 2, heroY, DEFENSE_C, 1.0)
    const swordGfx = this.add.graphics()
    drawSwordIcon(swordGfx, W / 2, heroY - 3, ATTACK_C, 0.7)

    this.add.text(W / 2, heroY + 38, t('scenes.raid-hub.subtitle'), {
      fontFamily: fontFamily.serif, fontSize: '14px',
      color: fg.secondaryHex, fontStyle: 'italic',
    }).setOrigin(0.5)
  }

  // ── Daily counters ────────────────────────────────────────────────────────

  private _drawCounters() {
    const cy = COUNTERS_CY
    const cardW = 220
    const cardH = 60
    const gap = 24

    const raid = playerData.getRaid()
    const attacksUsed = raid.attacksUsedToday
    const defensesReceived = raid.defensesReceivedToday

    const drawCounter = (
      cx: number,
      label: string,
      used: number,
      color: number,
      colorHex: string,
      icon: 'sword' | 'shield',
    ) => {
      const g = this.add.graphics()
      g.fillStyle(0x000000, 0.45)
      g.fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 4, cardW, cardH, radii.lg)
      g.fillStyle(surface.panel, 0.98)
      g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.lg)
      g.fillStyle(color, 0.85)
      g.fillRoundedRect(cx - cardW / 2 + 6, cy - cardH / 2, cardW - 12, 3,
        { tl: 1.5, tr: 1.5, bl: 0, br: 0 })
      g.lineStyle(1, color, 0.55)
      g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.lg)

      const iconCx = cx - cardW / 2 + 28
      g.fillStyle(color, 0.18)
      g.fillCircle(iconCx, cy, 18)
      g.lineStyle(1, color, 0.7)
      g.strokeCircle(iconCx, cy, 18)
      const iconGfx = this.add.graphics()
      if (icon === 'sword') drawSwordIcon(iconGfx, iconCx, cy, color, 0.5)
      else                  drawShieldIcon(iconGfx, iconCx, cy, color, 0.55)

      this.add.text(iconCx + 28, cy - 11, label, {
        fontFamily: fontFamily.body, fontSize: '12px',
        color: colorHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.5)

      this.add.text(iconCx + 28, cy + 11, `${used} / ${RAID_DAILY_LIMIT}`, {
        fontFamily: fontFamily.mono, fontSize: '20px',
        color: '#ffffff', fontStyle: '700',
      }).setOrigin(0, 0.5)
    }

    drawCounter(
      W / 2 - cardW / 2 - gap / 2,
      t('scenes.raid-hub.counters.attacks').toUpperCase(),
      attacksUsed, ATTACK_C, ATTACK_HEX, 'sword',
    )
    drawCounter(
      W / 2 + cardW / 2 + gap / 2,
      t('scenes.raid-hub.counters.defenses').toUpperCase(),
      defensesReceived, DEFENSE_C, DEFENSE_HEX, 'shield',
    )
  }

  // ── Mastery panel ─────────────────────────────────────────────────────────

  private _drawMasteryPanel() {
    const py = MASTERY_CY
    const panelW = 464
    const panelH = 60
    const px = W / 2

    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(px - panelW / 2 + 2, py - panelH / 2 + 4, panelW, panelH, radii.md)
    g.fillStyle(NEUTRAL_BASE, 0.96)
    g.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, radii.md)
    g.lineStyle(1, accent.primary, 0.55)
    g.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, radii.md)

    // Header label centered above the two stats — sits inside a small
    // notch in the top border so the panel reads as a single unit.
    this.add.text(px, py - panelH / 2 - 10, t('scenes.raid-hub.mastery.title').toUpperCase(), {
      fontFamily: fontFamily.body, fontSize: '11px',
      color: accent.primaryHex, fontStyle: '700',
      backgroundColor: '#0a0f1d', padding: { x: 10, y: 2 },
    }).setOrigin(0.5).setLetterSpacing(2)

    const drawSide = (cx: number, type: 'attack' | 'defense') => {
      const label = t(type === 'attack'
        ? 'scenes.raid-hub.mastery.attack-label'
        : 'scenes.raid-hub.mastery.defense-label').toUpperCase()
      const color = type === 'attack' ? ATTACK_C : DEFENSE_C
      const colorHex = type === 'attack' ? ATTACK_HEX : DEFENSE_HEX
      const available = playerData.getMasteryAvailable(type)
      const earned    = playerData.getMasteryEarned(type)

      const iconCx = cx - 78
      g.fillStyle(color, 0.18)
      g.fillCircle(iconCx, py, 14)
      g.lineStyle(1, color, 0.7)
      g.strokeCircle(iconCx, py, 14)
      const iconGfx = this.add.graphics()
      if (type === 'attack') drawSwordIcon(iconGfx, iconCx, py, color, 0.4)
      else                   drawShieldIcon(iconGfx, iconCx, py, color, 0.45)

      this.add.text(iconCx + 22, py - 10, label, {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: colorHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.4)

      this.add.text(iconCx + 22, py + 10,
        t('scenes.raid-hub.mastery.value', { available, earned }), {
          fontFamily: fontFamily.mono, fontSize: '13px',
          color: '#ffffff', fontStyle: '700',
        }).setOrigin(0, 0.5)
    }

    drawSide(px - panelW / 4, 'attack')
    drawSide(px + panelW / 4, 'defense')

    g.fillStyle(border.default, 0.5)
    g.fillRect(px - 1, py - panelH / 2 + 14, 2, panelH - 28)
  }

  // ── Participation toggle ──────────────────────────────────────────────────

  private _drawParticipationToggle() {
    const cy = TOGGLE_CY
    const cardW = 720
    const cardH = 56
    const cx = W / 2

    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 4, cardW, cardH, radii.md)
    g.fillStyle(surface.panel, 0.98)
    g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.md)
    g.lineStyle(1, border.default, 1)
    g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.md)

    this.add.text(cx - cardW / 2 + 22, cy - 10,
      t('scenes.raid-hub.participating.title').toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '13px',
        color: fg.primaryHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.6)

    this.add.text(cx - cardW / 2 + 22, cy + 10,
      t('scenes.raid-hub.participating.body'), {
        fontFamily: fontFamily.body, fontSize: '12px',
        color: fg.tertiaryHex, fontStyle: '500',
      }).setOrigin(0, 0.5)

    // Custom binary toggle on the right
    const togW = 64
    const togH = 28
    const togCx = cx + cardW / 2 - togW / 2 - 22
    const togCy = cy

    const togBg = this.add.graphics()
    const togKnob = this.add.graphics()
    const drawToggle = (on: boolean) => {
      togBg.clear()
      togBg.fillStyle(on ? state.success : surface.deepest, 1)
      togBg.fillRoundedRect(togCx - togW / 2, togCy - togH / 2, togW, togH, togH / 2)
      togBg.lineStyle(1, on ? state.success : border.default, on ? 0.85 : 1)
      togBg.strokeRoundedRect(togCx - togW / 2, togCy - togH / 2, togW, togH, togH / 2)

      togKnob.clear()
      togKnob.fillStyle(0xffffff, 0.95)
      const knobX = togCx + (on ? togW / 2 - togH / 2 : -togW / 2 + togH / 2)
      togKnob.fillCircle(knobX, togCy, togH / 2 - 4)
    }
    drawToggle(playerData.getRaid().participating)

    const togHit = this.add.rectangle(togCx, togCy, togW + 8, togH + 8, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    togHit.on('pointerdown', () => {
      soundManager.playClick()
      const next = !playerData.getRaid().participating
      playerData.setRaidParticipating(next)
      drawToggle(next)
      this._refreshActionButton()
    })
  }

  // ── Equip panel — header + 4 horizontal slots ─────────────────────────────

  private _drawEquipPanel() {
    const headerY = EQUIP_HEAD_Y
    const headerLeftX = (W - 920) / 2

    // Section header — title on the left + slot count + "Ver loja" CTA right
    const equipped = playerData.getEquippedFortifications()
    const headerTitle = this.add.text(headerLeftX, headerY,
      t('scenes.raid-hub.equip.title').toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '13px',
        color: accent.primaryHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(2)

    this.add.text(
      headerLeftX + headerTitle.width + 10, headerY,
      t('scenes.raid-hub.equip.slot-count', { used: equipped.length, max: RAID_EQUIP_SLOTS }),
      {
        fontFamily: fontFamily.mono, fontSize: '12px',
        color: fg.tertiaryHex, fontStyle: '700',
      },
    ).setOrigin(0, 0.5)

    // "Ver Loja" CTA — small gold pill on the right of the header
    this._drawShopCta(headerLeftX + 920, headerY)

    // 4 slots
    const slotW = 220
    const slotH = 100
    const slotGap = 14
    const slotsTotalW = RAID_EQUIP_SLOTS * slotW + (RAID_EQUIP_SLOTS - 1) * slotGap
    const slotsStartCx = (W - slotsTotalW) / 2 + slotW / 2
    const slotsCy = EQUIP_SLOTS_CY

    const layer = this.add.container(0, 0)
    this._equipLayer = layer

    for (let i = 0; i < RAID_EQUIP_SLOTS; i++) {
      const cx = slotsStartCx + i * (slotW + slotGap)
      const cy = slotsCy
      const owned = equipped[i] ?? null
      this._drawEquipSlot(layer, cx, cy, slotW, slotH, owned)
    }
  }

  private _drawShopCta(rightEdgeX: number, cy: number) {
    const label = t('scenes.raid-hub.equip.shop-cta').toUpperCase()
    const labelObj = this.add.text(0, 0, label, {
      fontFamily: fontFamily.body, fontSize: '12px',
      color: '#1a1408', fontStyle: '900',
    }).setOrigin(0.5).setLetterSpacing(1.6)

    const padX = 14
    const padY = 7
    const btnW = labelObj.width + padX * 2
    const btnH = labelObj.height + padY * 2
    const cx = rightEdgeX - btnW / 2

    const bg = this.add.graphics()
    const drawBg = (hover: boolean) => {
      bg.clear()
      bg.fillStyle(hover ? 0xfcd34d : accent.primary, 1)
      bg.fillRoundedRect(cx - btnW / 2, cy - btnH / 2, btnW, btnH, btnH / 2)
      bg.lineStyle(1, 0x000000, 0.4)
      bg.strokeRoundedRect(cx - btnW / 2, cy - btnH / 2, btnW, btnH, btnH / 2)
    }
    drawBg(false)
    labelObj.setPosition(cx, cy)

    const hit = this.add.rectangle(cx, cy, btnW, btnH, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => drawBg(true))
    hit.on('pointerout',  () => drawBg(false))
    hit.on('pointerdown', () => {
      soundManager.playClick()
      transitionTo(this, 'ShopScene', { tab: 'fortifications' })
    })
  }

  private _drawEquipSlot(
    container: Phaser.GameObjects.Container,
    cx: number, cy: number, w: number, h: number,
    owned: { itemId: string; remainingDefenses: number; equipped: boolean } | null,
  ) {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 4, w, h, radii.md)
    g.fillStyle(surface.panel, owned ? 0.98 : 0.6)
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radii.md)
    container.add(g)

    if (!owned) {
      // Empty slot — dashed border + "+" + hint text
      const dash = this.add.graphics()
      dash.lineStyle(1, border.default, 0.85)
      const dashStep = 6
      const x0 = cx - w / 2, y0 = cy - h / 2
      // Manual dashed rect (top, right, bottom, left)
      const drawDashedLine = (sx: number, sy: number, ex: number, ey: number) => {
        const dx = ex - sx, dy = ey - sy
        const len = Math.hypot(dx, dy)
        const segs = Math.floor(len / dashStep)
        for (let i = 0; i < segs; i += 2) {
          const t1 = i / segs, t2 = (i + 1) / segs
          dash.lineBetween(sx + dx * t1, sy + dy * t1, sx + dx * t2, sy + dy * t2)
        }
      }
      drawDashedLine(x0 + 4, y0, x0 + w - 4, y0)
      drawDashedLine(x0 + w, y0 + 4, x0 + w, y0 + h - 4)
      drawDashedLine(x0 + w - 4, y0 + h, x0 + 4, y0 + h)
      drawDashedLine(x0, y0 + h - 4, x0, y0 + 4)
      container.add(dash)

      // Plus glyph
      const plus = this.add.graphics()
      plus.lineStyle(2, fg.tertiary, 0.85)
      plus.lineBetween(cx - 9, cy - 8, cx + 9, cy - 8)
      plus.lineBetween(cx, cy - 17, cx, cy + 1)
      container.add(plus)

      const hint = this.add.text(cx, cy + 18,
        t('scenes.raid-hub.equip.empty-hint').toUpperCase(), {
          fontFamily: fontFamily.body, fontSize: '11px',
          color: fg.tertiaryHex, fontStyle: '700',
        }).setOrigin(0.5).setLetterSpacing(1.4)
      container.add(hint)

      const hit = this.add.rectangle(cx, cy, w, h, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => {
        this.tweens.add({ targets: g, alpha: 1, duration: 100 })
      })
      hit.on('pointerdown', () => {
        soundManager.playClick()
        this._openInventoryPicker()
      })
      container.add(hit)
      return
    }

    // Filled slot — type icon, name, description, remaining defenses, "×"
    const item = findFortification(owned.itemId)
    if (!item) return

    const accentColor = colorForType(item.type)
    const accentHex = hexForType(item.type)

    g.fillStyle(accentColor, 0.7)
    g.fillRoundedRect(cx - w / 2 + 4, cy - h / 2, w - 8, 3,
      { tl: 1.5, tr: 1.5, bl: 0, br: 0 })
    g.lineStyle(1, accentColor, 0.85)
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, radii.md)

    // Icon disc top-left
    const iconCx = cx - w / 2 + 22
    const iconCy = cy - h / 2 + 22
    const iconG = this.add.graphics()
    iconG.fillStyle(accentColor, 0.18)
    iconG.fillCircle(iconCx, iconCy, 14)
    iconG.lineStyle(1, accentColor, 0.7)
    iconG.strokeCircle(iconCx, iconCy, 14)
    drawTypeIcon(iconG, iconCx, iconCy, item.type, accentColor)
    container.add(iconG)

    // Title
    container.add(this.add.text(iconCx + 22, cy - h / 2 + 16,
      t(item.nameKey).toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: accentHex, fontStyle: '700',
        wordWrap: { width: w - 80 },
      }).setOrigin(0, 0).setLetterSpacing(1.2))

    // Description (truncated to 2 lines via wordWrap height)
    container.add(this.add.text(cx - w / 2 + 12, cy - 4,
      t(item.descKey), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: fg.tertiaryHex, fontStyle: '500',
        wordWrap: { width: w - 24 },
      }).setOrigin(0, 0))

    // Remaining defenses badge bottom-left
    const badgeY = cy + h / 2 - 16
    const badgeText = t('scenes.raid-hub.equip.remaining', { remaining: owned.remainingDefenses })
    const badge = this.add.text(cx - w / 2 + 12, badgeY, badgeText, {
      fontFamily: fontFamily.body, fontSize: '10px',
      color: state.successHex, fontStyle: '700',
      backgroundColor: '#0a0f1d', padding: { x: 6, y: 2 },
    }).setOrigin(0, 0.5).setLetterSpacing(1)
    container.add(badge)

    // "×" unequip button top-right
    const xCx = cx + w / 2 - 14
    const xCy = cy - h / 2 + 14
    const xBg = this.add.graphics()
    xBg.fillStyle(0x000000, 0.5)
    xBg.fillCircle(xCx, xCy, 9)
    xBg.lineStyle(1, fg.tertiary, 0.6)
    xBg.strokeCircle(xCx, xCy, 9)
    container.add(xBg)
    const xGlyph = this.add.graphics()
    xGlyph.lineStyle(1.5, fg.secondary, 0.95)
    xGlyph.lineBetween(xCx - 4, xCy - 4, xCx + 4, xCy + 4)
    xGlyph.lineBetween(xCx + 4, xCy - 4, xCx - 4, xCy + 4)
    container.add(xGlyph)
    const xHit = this.add.rectangle(xCx, xCy, 22, 22, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    xHit.on('pointerdown', () => {
      soundManager.playClick()
      playerData.unequipFortification(item.id)
      this._refreshEquipPanel()
    })
    container.add(xHit)
  }

  // ── Inventory picker modal ────────────────────────────────────────────────

  private _openInventoryPicker() {
    if (this._modalContainer) return
    const inventory = playerData.getInventoryFortifications()

    // Backdrop
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setDepth(200).setInteractive()
    this.tweens.add({ targets: dim, fillAlpha: 0.7, duration: 180 })

    const modalW = 560
    const itemH = 58
    const headerH = 54
    const footerH = 16
    const maxRows = 5
    const visibleRows = Math.min(Math.max(inventory.length, 1), maxRows)
    const modalH = headerH + visibleRows * itemH + footerH + 8

    const container = this.add.container(W / 2, H / 2).setDepth(201).setAlpha(0).setScale(0.92)
    this._modalContainer = container

    const close = () => {
      if (!this._modalContainer) return
      this.tweens.add({ targets: dim, fillAlpha: 0, duration: 140, onComplete: () => dim.destroy() })
      this.tweens.add({
        targets: container, alpha: 0, scaleX: 0.92, scaleY: 0.92, duration: 140,
        onComplete: () => { container.destroy(); this._modalContainer = null },
      })
    }
    dim.on('pointerdown', close)

    // Body
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(-modalW / 2 + 4, -modalH / 2 + 8, modalW, modalH, radii.lg)
    bg.fillStyle(NEUTRAL_BASE, 0.985)
    bg.fillRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(-modalW / 2, -modalH / 2, modalW, modalH, radii.lg)
    container.add(bg)

    // Header
    container.add(this.add.text(-modalW / 2 + 22, -modalH / 2 + 18,
      t('scenes.raid-hub.equip.picker-title').toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '13px',
        color: accent.primaryHex, fontStyle: '700',
      }).setOrigin(0, 0).setLetterSpacing(2))
    container.add(this.add.text(-modalW / 2 + 22, -modalH / 2 + 36,
      t('scenes.raid-hub.equip.picker-subtitle'), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: fg.tertiaryHex, fontStyle: '500',
      }).setOrigin(0, 0))

    // Close X top-right
    const xCx = modalW / 2 - 22
    const xCy = -modalH / 2 + 22
    const xBg = this.add.graphics()
    xBg.fillStyle(0x000000, 0.55)
    xBg.fillCircle(xCx, xCy, 12)
    xBg.lineStyle(1, fg.tertiary, 0.55)
    xBg.strokeCircle(xCx, xCy, 12)
    container.add(xBg)
    const xGlyph = this.add.graphics()
    xGlyph.lineStyle(1.5, fg.secondary, 0.95)
    xGlyph.lineBetween(xCx - 5, xCy - 5, xCx + 5, xCy + 5)
    xGlyph.lineBetween(xCx + 5, xCy - 5, xCx - 5, xCy + 5)
    container.add(xGlyph)
    const xHit = this.add.rectangle(xCx, xCy, 28, 28, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    xHit.on('pointerdown', close)
    container.add(xHit)

    // Body items OR empty state
    if (inventory.length === 0) {
      const emptyY = -modalH / 2 + headerH + 26
      container.add(this.add.text(0, emptyY,
        t('scenes.raid-hub.equip.empty-inventory'), {
          fontFamily: fontFamily.body, fontSize: '13px',
          color: fg.tertiaryHex, fontStyle: '500',
        }).setOrigin(0.5))

      // CTA → Shop
      const ctaY = emptyY + 36
      const ctaLabel = t('scenes.raid-hub.equip.shop-cta').toUpperCase()
      const labelObj = this.add.text(0, ctaY, ctaLabel, {
        fontFamily: fontFamily.body, fontSize: '13px',
        color: '#1a1408', fontStyle: '900',
      }).setOrigin(0.5).setLetterSpacing(1.6)
      const ctaW = labelObj.width + 32
      const ctaH = labelObj.height + 16
      const ctaBg = this.add.graphics()
      ctaBg.fillStyle(accent.primary, 1)
      ctaBg.fillRoundedRect(-ctaW / 2, ctaY - ctaH / 2, ctaW, ctaH, ctaH / 2)
      ctaBg.lineStyle(1, 0x000000, 0.4)
      ctaBg.strokeRoundedRect(-ctaW / 2, ctaY - ctaH / 2, ctaW, ctaH, ctaH / 2)
      container.add(ctaBg)
      container.add(labelObj)
      const ctaHit = this.add.rectangle(0, ctaY, ctaW, ctaH, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      ctaHit.on('pointerdown', () => {
        soundManager.playClick()
        close()
        transitionTo(this, 'ShopScene', { tab: 'fortifications' })
      })
      container.add(ctaHit)
    } else {
      const listTopY = -modalH / 2 + headerH
      inventory.slice(0, maxRows).forEach((entry, i) => {
        const item = findFortification(entry.itemId)
        if (!item) return
        const rowY = listTopY + i * itemH + itemH / 2
        const rowG = this.add.graphics()
        rowG.fillStyle(surface.panel, 0.6)
        rowG.fillRoundedRect(-modalW / 2 + 18, rowY - itemH / 2 + 4, modalW - 36, itemH - 8, radii.sm)
        rowG.lineStyle(1, border.subtle, 1)
        rowG.strokeRoundedRect(-modalW / 2 + 18, rowY - itemH / 2 + 4, modalW - 36, itemH - 8, radii.sm)
        container.add(rowG)

        // Icon
        const itemColor = colorForType(item.type)
        const itemHex   = hexForType(item.type)
        const iconCx = -modalW / 2 + 44
        const iconG = this.add.graphics()
        iconG.fillStyle(itemColor, 0.18)
        iconG.fillCircle(iconCx, rowY, 14)
        iconG.lineStyle(1, itemColor, 0.7)
        iconG.strokeCircle(iconCx, rowY, 14)
        drawTypeIcon(iconG, iconCx, rowY, item.type, itemColor)
        container.add(iconG)

        // Name + desc
        container.add(this.add.text(iconCx + 22, rowY - 8, t(item.nameKey).toUpperCase(), {
          fontFamily: fontFamily.body, fontSize: '12px',
          color: itemHex, fontStyle: '700',
        }).setOrigin(0, 0.5).setLetterSpacing(1.2))
        container.add(this.add.text(iconCx + 22, rowY + 9, t(item.descKey), {
          fontFamily: fontFamily.body, fontSize: '10px',
          color: fg.tertiaryHex, fontStyle: '500',
        }).setOrigin(0, 0.5))

        // Remaining badge
        const badgeText = t('scenes.raid-hub.equip.remaining', { remaining: entry.remainingDefenses })
        const remTxt = this.add.text(modalW / 2 - 110, rowY, badgeText, {
          fontFamily: fontFamily.body, fontSize: '10px',
          color: state.successHex, fontStyle: '700',
        }).setOrigin(1, 0.5).setLetterSpacing(1)
        container.add(remTxt)

        // EQUIPAR button
        const equipLabel = t('scenes.raid-hub.equip.equip-btn').toUpperCase()
        const eLabel = this.add.text(0, 0, equipLabel, {
          fontFamily: fontFamily.body, fontSize: '11px',
          color: '#1a1408', fontStyle: '900',
        }).setOrigin(0.5).setLetterSpacing(1.4)
        const eW = eLabel.width + 22
        const eH = eLabel.height + 10
        const eCx = modalW / 2 - 18 - eW / 2
        const eBg = this.add.graphics()
        const drawEBg = (hover: boolean) => {
          eBg.clear()
          eBg.fillStyle(hover ? 0xfcd34d : accent.primary, 1)
          eBg.fillRoundedRect(eCx - eW / 2, rowY - eH / 2, eW, eH, eH / 2)
          eBg.lineStyle(1, 0x000000, 0.4)
          eBg.strokeRoundedRect(eCx - eW / 2, rowY - eH / 2, eW, eH, eH / 2)
        }
        drawEBg(false)
        eLabel.setPosition(eCx, rowY)
        container.add(eBg)
        container.add(eLabel)
        const eHit = this.add.rectangle(eCx, rowY, eW, eH, 0, 0.001)
          .setInteractive({ useHandCursor: true })
        eHit.on('pointerover', () => drawEBg(true))
        eHit.on('pointerout',  () => drawEBg(false))
        eHit.on('pointerdown', () => {
          soundManager.playClick()
          const ok = playerData.equipFortification(item.id)
          if (!ok) return
          close()
          this._refreshEquipPanel()
        })
        container.add(eHit)
      })
    }

    this.tweens.add({
      targets: container, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 220, ease: 'Back.Out',
    })
  }

  private _refreshEquipPanel() {
    if (this._equipLayer) {
      this._equipLayer.destroy()
      this._equipLayer = null
    }
    // Redraw the entire equip panel including the header (slot count)
    this.scene.restart()
  }

  // ── Action button — ATACAR AGORA ──────────────────────────────────────────

  private _drawActionButton() {
    const btnY = ATTACK_BTN_CY
    const btnW = 280
    const btnH = 58
    const cx = W / 2

    const shadow = this.add.graphics()
    shadow.fillStyle(0x000000, 0.5)
    shadow.fillRoundedRect(cx - btnW / 2 + 2, btnY - btnH / 2 + 4, btnW, btnH, 10)

    const bg = this.add.graphics()
    const labelObj = this.add.text(cx, btnY,
      t('scenes.raid-hub.attack-cta').toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '20px',
        color: '#ffffff', fontStyle: '900',
      }).setOrigin(0.5).setLetterSpacing(2.4)

    const drawBg = (enabled: boolean, hover = false) => {
      bg.clear()
      const fill = enabled ? (hover ? 0xf87171 : ATTACK_C) : 0x4a4f5a
      bg.fillStyle(fill, 1)
      bg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10)
      bg.fillStyle(0xffffff, 0.10)
      bg.fillRoundedRect(cx - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, 10,
        { tl: 8, tr: 8, bl: 0, br: 0 })
      bg.lineStyle(1, 0x000000, 0.4)
      bg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10)
      labelObj.setColor(enabled ? '#ffffff' : '#a0a4ad')
    }
    this._attackButtonRedraw = drawBg

    const enabled = this._isAttackEnabled()
    drawBg(enabled)

    const hit = this.add.rectangle(cx, btnY, btnW, btnH, 0, 0.001)
      .setInteractive({ useHandCursor: enabled })
    hit.on('pointerover', () => { if (this._isAttackEnabled()) drawBg(true, true) })
    hit.on('pointerout',  () => drawBg(this._isAttackEnabled()))
    hit.on('pointerdown', () => {
      if (!this._isAttackEnabled()) return
      this.tweens.add({
        targets: labelObj, scaleX: 0.95, scaleY: 0.95,
        duration: 80, yoyo: true, ease: 'Sine.InOut',
        onComplete: () => this._launchRaid(),
      })
    })

    void shadow

    // Disabled-reason hint text under the button — rendered once so the
    // button geometry is stable; updated whenever participation toggles.
    this._attackButtonHint = this.add.text(cx, btnY + btnH / 2 + 14, '', {
      fontFamily: fontFamily.body, fontSize: '11px',
      color: fg.tertiaryHex, fontStyle: '500',
    }).setOrigin(0.5).setLetterSpacing(1)
    this._refreshHintText(enabled)
  }

  private _refreshHintText(enabled: boolean) {
    if (!this._attackButtonHint) return
    if (enabled) {
      this._attackButtonHint.setText('')
      return
    }
    const key = !playerData.getRaid().participating
      ? 'scenes.raid-hub.attack-disabled-toggle-off'
      : 'scenes.raid-hub.attack-disabled-out-of-attacks'
    this._attackButtonHint.setText(t(key))
  }

  private _isAttackEnabled(): boolean {
    return playerData.getRaid().participating && playerData.getRaidAttacksRemaining() > 0
  }

  private _refreshActionButton(): void {
    if (this._attackButtonRedraw) this._attackButtonRedraw(this._isAttackEnabled())
    this._refreshHintText(this._isAttackEnabled())
  }

  private _launchRaid(): void {
    const targets = findOfflineRaidTargets({
      localLevel: playerData.getLevel(),
      limit:      1,
    })
    if (targets.length === 0) {
      this._showNoTargetsToast()
      return
    }
    if (!playerData.consumeRaidAttack()) {
      this._refreshActionButton()
      return
    }
    const payload = buildRaidBattlePayload(targets[0], {
      deckConfig: playerData.getDeckConfig(),
      skinConfig: playerData.getSkinConfig(),
    })
    transitionTo(this, 'BattleScene', payload)
  }

  private _showNoTargetsToast(): void {
    const msg = t('scenes.raid-hub.attack-no-targets', { level: playerData.getLevel() })
    const toast = this.add.text(W / 2, H - 130, msg, {
      fontFamily: fontFamily.body, fontSize: '14px',
      color: state.warnHex, fontStyle: '700',
      backgroundColor: '#10141d', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(200).setAlpha(0)
    this.tweens.add({
      targets: toast, alpha: 1, duration: 180,
      onComplete: () => {
        this.tweens.add({
          targets: toast, alpha: 0, duration: 240, delay: 2200,
          onComplete: () => toast.destroy(),
        })
      },
    })
  }

  shutdown() {
    this.tweens.killAll()
    void this._equipLayer
    void this._modalContainer
  }
}

// ── Type → colour / icon helpers ────────────────────────────────────────────

export function colorForType(type: FortificationType): number {
  switch (type) {
    case 'defense-buff-all':
    case 'king-defense-buff':
    case 'royal-evade':
    case 'first-turn-rush':
      return DEFENSE_C
    case 'attack-buff-all':
    case 'random-traps':
      return ATTACK_C
    case 'reveal-skills':
    case 'gold-multiplier':
      return accent.primary
  }
}

export function hexForType(type: FortificationType): string {
  switch (type) {
    case 'defense-buff-all':
    case 'king-defense-buff':
    case 'royal-evade':
    case 'first-turn-rush':
      return DEFENSE_HEX
    case 'attack-buff-all':
    case 'random-traps':
      return ATTACK_HEX
    case 'reveal-skills':
    case 'gold-multiplier':
      return accent.primaryHex
  }
}

export function drawTypeIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, type: FortificationType, color: number): void {
  switch (type) {
    case 'defense-buff-all':
    case 'king-defense-buff':
      drawShieldIcon(g, x, y, color, 0.42)
      break
    case 'attack-buff-all':
      drawSwordIcon(g, x, y, color, 0.4)
      break
    case 'random-traps':
      g.lineStyle(2, color, 0.95)
      g.lineBetween(x - 6, y - 6, x + 6, y + 6)
      g.lineBetween(x + 6, y - 6, x - 6, y + 6)
      g.fillStyle(color, 0.95)
      g.fillCircle(x, y, 1.5)
      break
    case 'reveal-skills':
      g.lineStyle(2, color, 0.95)
      g.beginPath()
      g.arc(x, y, 7, Math.PI, 0, false)
      g.strokePath()
      g.beginPath()
      g.arc(x, y, 7, 0, Math.PI, false)
      g.strokePath()
      g.fillStyle(color, 0.95)
      g.fillCircle(x, y, 2.5)
      break
    case 'first-turn-rush':
      g.lineStyle(2, color, 0.95)
      g.lineBetween(x - 6, y + 6, x + 6, y - 6)
      g.lineBetween(x + 2, y - 6, x + 6, y - 6)
      g.lineBetween(x + 6, y - 2, x + 6, y - 6)
      break
    case 'royal-evade':
      g.lineStyle(2, color, 0.95)
      g.beginPath()
      g.moveTo(x, y - 7)
      g.lineTo(x + 6, y)
      g.lineTo(x, y + 7)
      g.lineTo(x - 6, y)
      g.closePath()
      g.strokePath()
      break
    case 'gold-multiplier':
      g.fillStyle(color, 0.85)
      g.fillCircle(x, y, 6)
      g.lineStyle(1, color, 0.9)
      g.strokeCircle(x, y, 6)
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(x - 1.5, y - 1.5, 2)
      break
  }
}

// Suppress "unused export" warning until ShopScene + future combat hooks
// import these helpers (kept exported so the iconography stays a single
// source of truth).
void RAID_FORTIFICATIONS
