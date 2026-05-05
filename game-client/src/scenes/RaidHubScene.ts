/**
 * scenes/RaidHubScene.ts — the "Offline Raid" hub.
 *
 * Reached from the lobby's offline-attack tile via the explainer popup's
 * PARTICIPAR button. Hosts:
 *   - Mastery panel (Attack + Defense, total earned + spendable balance)
 *   - Daily counters (attacks left + defenses left, both capped at 10)
 *   - Participation toggle (when ON, the player can launch raids and
 *     enter the matchmaking pool other players draw from)
 *   - Fortifications shop — items that buff your defense team for a
 *     fixed number of incoming raids, paid in Gold or DG
 *   - Action button: "ATACAR AGORA" (consumes one of today's attacks
 *     and launches the raid). Disabled when participation is OFF or
 *     when the daily quota is exhausted.
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import {
  SCREEN, surface, border, accent, fg, state, currency,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { soundManager } from '../utils/SoundManager'
import { playerData, RAID_DAILY_LIMIT } from '../utils/PlayerDataManager'
import { drawSwordIcon, drawShieldIcon } from '../utils/CombatIcons'
import {
  RAID_FORTIFICATIONS,
  type FortificationDef,
  type FortificationType,
} from '../data/raidFortifications'
import { findOfflineRaidTargets, buildRaidBattlePayload } from '../utils/OfflineRaidMatchmaking'
import { t } from '../i18n'

const W = SCREEN.W
const H = SCREEN.H

const TOP_BAR_H = 60

// Theme constants — reuse the same red/blue/gold vocabulary as the popup
// so the Hub reads as a continuation of the same feature.
const ATTACK_C  = 0xef4444
const DEFENSE_C = 0x3b82f6
const ATTACK_HEX  = '#ef4444'
const DEFENSE_HEX = '#3b82f6'
const NEUTRAL_BASE   = 0x101729

export default class RaidHubScene extends Phaser.Scene {
  private _itemsLayer: Phaser.GameObjects.Container | null = null
  private _balancePill: Phaser.GameObjects.Container | null = null
  private _attackButtonContainer: Phaser.GameObjects.Container | null = null
  private _attackButtonRedraw: ((enabled: boolean) => void) | null = null
  private _toggleRedraw: ((on: boolean) => void) | null = null
  private _counterRedraw: (() => void) | null = null

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
    this._drawFortificationsShop()
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

    // Currency pills (gold + DG) on the right — same kit the lobby uses
    UI.currencyPill(this, W - 220, TOP_BAR_H / 2, {
      kind: 'gold', amount: playerData.getGold(),
    })
    UI.currencyPill(this, W - 90, TOP_BAR_H / 2, {
      kind: 'dg', amount: playerData.getDG(),
    })
  }

  // ── Hero band ──────────────────────────────────────────────────────────────

  private _drawHero() {
    const heroY = TOP_BAR_H + 56
    const heroHalf = 36

    // Twin halos
    this.tweens.add({
      targets: this.add.circle(W / 2 - 22, heroY, 50, ATTACK_C, 0.15),
      alpha: { from: 0.1, to: 0.28 }, scale: { from: 0.95, to: 1.1 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
    this.tweens.add({
      targets: this.add.circle(W / 2 + 22, heroY, 50, DEFENSE_C, 0.15),
      alpha: { from: 0.1, to: 0.28 }, scale: { from: 0.95, to: 1.1 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: 800,
    })

    // Shield + sword combo (same combat icons used everywhere)
    const shieldGfx = this.add.graphics()
    drawShieldIcon(shieldGfx, W / 2, heroY, DEFENSE_C, 1.4)
    const swordGfx = this.add.graphics()
    drawSwordIcon(swordGfx, W / 2, heroY - 4, ATTACK_C, 1.0)
    void heroHalf

    // Subtitle under emblem
    this.add.text(W / 2, heroY + 56, t('scenes.raid-hub.subtitle'), {
      fontFamily: fontFamily.serif, fontSize: '15px',
      color: fg.secondaryHex, fontStyle: 'italic',
    }).setOrigin(0.5)
  }

  // ── Daily counters (attacks remaining + defenses remaining) ───────────────

  private _drawCounters() {
    const cy = TOP_BAR_H + 168
    const cardW = 220
    const cardH = 64
    const gap = 24

    const attacksLeft  = playerData.getRaidAttacksRemaining()
    const defensesLeft = playerData.getRaidDefensesRemaining()

    const drawCounter = (
      cx: number,
      label: string,
      remaining: number,
      color: number,
      colorHex: string,
      icon: 'sword' | 'shield',
    ) => {
      // Card background
      const g = this.add.graphics()
      g.fillStyle(0x000000, 0.45)
      g.fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 4, cardW, cardH, radii.lg)
      g.fillStyle(surface.panel, 0.98)
      g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.lg)
      // Coloured top stripe (red for attack, blue for defense)
      g.fillStyle(color, 0.85)
      g.fillRoundedRect(cx - cardW / 2 + 6, cy - cardH / 2, cardW - 12, 3,
        { tl: 1.5, tr: 1.5, bl: 0, br: 0 })
      g.lineStyle(1, color, 0.55)
      g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.lg)

      // Icon disc at the left
      const iconCx = cx - cardW / 2 + 28
      g.fillStyle(color, 0.18)
      g.fillCircle(iconCx, cy, 18)
      g.lineStyle(1, color, 0.7)
      g.strokeCircle(iconCx, cy, 18)
      const iconGfx = this.add.graphics()
      if (icon === 'sword') drawSwordIcon(iconGfx, iconCx, cy, color, 0.5)
      else                  drawShieldIcon(iconGfx, iconCx, cy, color, 0.55)

      // Label + count
      this.add.text(iconCx + 28, cy - 11, label, {
        fontFamily: fontFamily.body, fontSize: '12px',
        color: colorHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.5)

      this.add.text(iconCx + 28, cy + 11, `${remaining} / ${RAID_DAILY_LIMIT}`, {
        fontFamily: fontFamily.mono, fontSize: '20px',
        color: '#ffffff', fontStyle: '700',
      }).setOrigin(0, 0.5)
    }

    drawCounter(
      W / 2 - cardW / 2 - gap / 2,
      t('scenes.raid-hub.counters.attacks').toUpperCase(),
      attacksLeft, ATTACK_C, ATTACK_HEX, 'sword',
    )
    drawCounter(
      W / 2 + cardW / 2 + gap / 2,
      t('scenes.raid-hub.counters.defenses').toUpperCase(),
      defensesLeft, DEFENSE_C, DEFENSE_HEX, 'shield',
    )
  }

  // ── Mastery panel — total earned + spendable balance ──────────────────────

  private _drawMasteryPanel() {
    const cy = TOP_BAR_H + 252
    const panelW = 464
    const panelH = 76
    const px = W / 2
    const py = cy

    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(px - panelW / 2 + 2, py - panelH / 2 + 4, panelW, panelH, radii.md)
    g.fillStyle(NEUTRAL_BASE, 0.96)
    g.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, radii.md)
    g.lineStyle(1, accent.primary, 0.55)
    g.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, radii.md)

    // Header label centered above the two stats
    this.add.text(px, py - panelH / 2 + 12, t('scenes.raid-hub.mastery.title').toUpperCase(), {
      fontFamily: fontFamily.body, fontSize: '11px',
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(2)

    const drawSide = (cx: number, type: 'attack' | 'defense') => {
      const label = t(type === 'attack'
        ? 'scenes.raid-hub.mastery.attack-label'
        : 'scenes.raid-hub.mastery.defense-label').toUpperCase()
      const color = type === 'attack' ? ATTACK_C : DEFENSE_C
      const colorHex = type === 'attack' ? ATTACK_HEX : DEFENSE_HEX
      const available = playerData.getMasteryAvailable(type)
      const earned    = playerData.getMasteryEarned(type)

      // Icon disc
      const iconCx = cx - 80
      g.fillStyle(color, 0.18)
      g.fillCircle(iconCx, py + 6, 14)
      g.lineStyle(1, color, 0.7)
      g.strokeCircle(iconCx, py + 6, 14)
      const iconGfx = this.add.graphics()
      if (type === 'attack') drawSwordIcon(iconGfx, iconCx, py + 6, color, 0.4)
      else                   drawShieldIcon(iconGfx, iconCx, py + 6, color, 0.45)

      this.add.text(iconCx + 22, py - 4, label, {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: colorHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.4)

      // "available / earned" — available bigger, earned smaller in ()
      this.add.text(iconCx + 22, py + 14,
        t('scenes.raid-hub.mastery.value', { available, earned }), {
          fontFamily: fontFamily.mono, fontSize: '14px',
          color: '#ffffff', fontStyle: '700',
        }).setOrigin(0, 0.5)
    }

    drawSide(px - panelW / 4, 'attack')
    drawSide(px + panelW / 4, 'defense')

    // Vertical divider between attack and defense sides
    g.fillStyle(border.default, 0.5)
    g.fillRect(px - 1, py - panelH / 2 + 28, 2, panelH - 36)
  }

  // ── Participation toggle ──────────────────────────────────────────────────

  private _drawParticipationToggle() {
    const cy = TOP_BAR_H + 348
    const cardW = 460
    const cardH = 60
    const cx = W / 2

    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 4, cardW, cardH, radii.md)
    g.fillStyle(surface.panel, 0.98)
    g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.md)
    g.lineStyle(1, border.default, 1)
    g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, radii.md)

    // Label
    const titleText = this.add.text(cx - cardW / 2 + 22, cy - 11,
      t('scenes.raid-hub.participating.title').toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '13px',
        color: fg.primaryHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.6)

    const subText = this.add.text(cx - cardW / 2 + 22, cy + 11,
      t('scenes.raid-hub.participating.body'), {
        fontFamily: fontFamily.body, fontSize: '12px',
        color: fg.tertiaryHex, fontStyle: '500',
      }).setOrigin(0, 0.5)
    void titleText; void subText

    // Custom toggle (UI.toggle is binary — we just need ON/OFF)
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
    this._toggleRedraw = drawToggle
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

  // ── Fortifications shop (3 × 2 grid) ──────────────────────────────────────

  private _drawFortificationsShop() {
    const startY = TOP_BAR_H + 432
    this.add.text(W / 2, startY, t('scenes.raid-hub.shop.title').toUpperCase(), {
      fontFamily: fontFamily.body, fontSize: '13px',
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(2)

    this.add.text(W / 2, startY + 18, t('scenes.raid-hub.shop.subtitle'), {
      fontFamily: fontFamily.serif, fontSize: '13px',
      color: fg.tertiaryHex, fontStyle: 'italic',
    }).setOrigin(0.5)

    const layer = this.add.container(0, 0)
    this._itemsLayer = layer

    const cardW = 200
    const cardH = 120
    const cols = 4
    const colGap = 12
    const rowGap = 14
    const rows = Math.ceil(RAID_FORTIFICATIONS.length / cols)
    const totalW = cols * cardW + (cols - 1) * colGap
    const startX = (W - totalW) / 2 + cardW / 2
    const gridY = startY + 50

    RAID_FORTIFICATIONS.forEach((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = startX + col * (cardW + colGap)
      const cy = gridY + row * (cardH + rowGap) + cardH / 2
      this._drawFortificationCard(layer, cx, cy, cardW, cardH, item)
    })

    void rows
  }

  private _drawFortificationCard(
    container: Phaser.GameObjects.Container,
    cx: number, cy: number, w: number, h: number,
    item: FortificationDef,
  ) {
    const owned = playerData.getRaid().ownedFortifications.find((f) => f.itemId === item.id)
    const accentColor = colorForType(item.type)
    const accentHex   = hexForType(item.type)

    const g = this.add.graphics()
    // Drop shadow + body
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 4, w, h, radii.md)
    g.fillStyle(surface.panel, 0.98)
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radii.md)
    // Top stripe in the type's accent colour
    g.fillStyle(accentColor, 0.7)
    g.fillRoundedRect(cx - w / 2 + 4, cy - h / 2, w - 8, 3,
      { tl: 1.5, tr: 1.5, bl: 0, br: 0 })
    g.lineStyle(1, owned ? accentColor : border.default, owned ? 0.85 : 1)
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, radii.md)
    container.add(g)

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

    // Title (uppercase)
    const titleText = this.add.text(iconCx + 22, cy - h / 2 + 16,
      t(item.nameKey).toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: accentHex, fontStyle: '700',
        wordWrap: { width: w - 50 },
      }).setOrigin(0, 0)
    titleText.setLetterSpacing(1.2)
    container.add(titleText)

    // Description
    const descText = this.add.text(cx - w / 2 + 12, cy - 6,
      t(item.descKey), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: fg.tertiaryHex, fontStyle: '500',
        wordWrap: { width: w - 24 },
      }).setOrigin(0, 0)
    container.add(descText)

    // Footer — duration + buy CTA OR "Active: N defesas"
    const footY = cy + h / 2 - 18
    if (owned) {
      this.add.text(cx, footY,
        t('scenes.raid-hub.shop.active', { remaining: owned.remainingDefenses }), {
          fontFamily: fontFamily.body, fontSize: '11px',
          color: state.successHex, fontStyle: '700',
        }).setOrigin(0.5).setLetterSpacing(1.2)
    } else {
      // Cost on the left, BUY on the right
      const costText = item.currency === 'gold'
        ? `${item.cost} G`
        : `${item.cost} DG`
      const costColor = item.currency === 'gold' ? currency.goldCoinHex : currency.dgGemHex
      this.add.text(cx - w / 2 + 12, footY, costText, {
        fontFamily: fontFamily.mono, fontSize: '12px',
        color: costColor, fontStyle: '700',
      }).setOrigin(0, 0.5)

      const btnW = 60
      const btnH = 22
      const btnCx = cx + w / 2 - btnW / 2 - 8
      const bg = this.add.graphics()
      bg.fillStyle(accent.primary, 0.9)
      bg.fillRoundedRect(btnCx - btnW / 2, footY - btnH / 2, btnW, btnH, 6)
      bg.lineStyle(1, 0x000000, 0.4)
      bg.strokeRoundedRect(btnCx - btnW / 2, footY - btnH / 2, btnW, btnH, 6)
      this.add.text(btnCx, footY, t('scenes.raid-hub.shop.buy'), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: '#1a1408', fontStyle: '900',
      }).setOrigin(0.5).setLetterSpacing(1.2)
      const hit = this.add.rectangle(btnCx, footY, btnW + 4, btnH + 4, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => this._tryPurchase(item))
    }
  }

  // ── Purchase flow ─────────────────────────────────────────────────────────

  private _tryPurchase(item: FortificationDef): void {
    soundManager.playClick()
    const ok = item.currency === 'gold'
      ? playerData.spendGold(item.cost)
      : playerData.spendDG(item.cost)
    if (!ok) {
      this._showInsufficientFundsToast(item.currency)
      return
    }
    playerData.addRaidFortification(item.id, item.durationDefenses)
    // Re-render the scene so the card flips to "Active" and the currency
    // pills + counters update.
    this.scene.restart()
  }

  private _showInsufficientFundsToast(currencyKind: 'gold' | 'dg'): void {
    const msg = currencyKind === 'gold'
      ? t('scenes.raid-hub.shop.toast.no-gold')
      : t('scenes.raid-hub.shop.toast.no-dg')
    const toast = this.add.text(W / 2, H - 80, msg, {
      fontFamily: fontFamily.body, fontSize: '14px',
      color: state.errorHex, fontStyle: '700',
      backgroundColor: '#10141d', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(200).setAlpha(0)
    this.tweens.add({
      targets: toast, alpha: 1, duration: 180,
      onComplete: () => {
        this.tweens.add({
          targets: toast, alpha: 0, duration: 220, delay: 1400,
          onComplete: () => toast.destroy(),
        })
      },
    })
  }

  // ── Action button — ATACAR AGORA ──────────────────────────────────────────

  private _drawActionButton() {
    const btnY = H - 56
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

    this._attackButtonContainer = this.add.container(0, 0, [shadow, bg, labelObj, hit])

    // Disabled-reason hint text under the button
    if (!enabled) {
      const hintKey = !playerData.getRaid().participating
        ? 'scenes.raid-hub.attack-disabled-toggle-off'
        : 'scenes.raid-hub.attack-disabled-out-of-attacks'
      this.add.text(cx, btnY - btnH / 2 - 14, t(hintKey), {
        fontFamily: fontFamily.body, fontSize: '11px',
        color: fg.tertiaryHex, fontStyle: '500',
      }).setOrigin(0.5).setLetterSpacing(1)
    }
  }

  private _isAttackEnabled(): boolean {
    return playerData.getRaid().participating && playerData.getRaidAttacksRemaining() > 0
  }

  private _refreshActionButton(): void {
    if (this._attackButtonRedraw) this._attackButtonRedraw(this._isAttackEnabled())
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
    void this._itemsLayer
    void this._balancePill
    void this._attackButtonContainer
    void this._counterRedraw
    void this._toggleRedraw
  }
}

// ── Type → colour / icon helpers ────────────────────────────────────────────

function colorForType(type: FortificationType): number {
  switch (type) {
    case 'defense-buff-all':
    case 'king-defense-buff':
      return DEFENSE_C
    case 'attack-buff-all':
    case 'random-traps':
      return ATTACK_C
    case 'royal-evade':
    case 'first-turn-rush':
      return DEFENSE_C
    case 'reveal-skills':
    case 'gold-multiplier':
      return accent.primary
  }
}

function hexForType(type: FortificationType): string {
  switch (type) {
    case 'defense-buff-all':
    case 'king-defense-buff':
      return DEFENSE_HEX
    case 'attack-buff-all':
    case 'random-traps':
      return ATTACK_HEX
    case 'royal-evade':
    case 'first-turn-rush':
      return DEFENSE_HEX
    case 'reveal-skills':
    case 'gold-multiplier':
      return accent.primaryHex
  }
}

function drawTypeIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, type: FortificationType, color: number): void {
  switch (type) {
    case 'defense-buff-all':
    case 'king-defense-buff':
      drawShieldIcon(g, x, y, color, 0.42)
      break
    case 'attack-buff-all':
      drawSwordIcon(g, x, y, color, 0.4)
      break
    case 'random-traps':
      // simple X-spike glyph
      g.lineStyle(2, color, 0.95)
      g.lineBetween(x - 6, y - 6, x + 6, y + 6)
      g.lineBetween(x + 6, y - 6, x - 6, y + 6)
      g.fillStyle(color, 0.95)
      g.fillCircle(x, y, 1.5)
      break
    case 'reveal-skills':
      // eye glyph
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
      // chevron arrow up-right
      g.lineStyle(2, color, 0.95)
      g.lineBetween(x - 6, y + 6, x + 6, y - 6)
      g.lineBetween(x + 2, y - 6, x + 6, y - 6)
      g.lineBetween(x + 6, y - 2, x + 6, y - 6)
      break
    case 'royal-evade':
      // diamond
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
      // gold coin (filled circle with rim)
      g.fillStyle(color, 0.85)
      g.fillCircle(x, y, 6)
      g.lineStyle(1, color, 0.9)
      g.strokeCircle(x, y, 6)
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(x - 1.5, y - 1.5, 2)
      break
  }
}
