import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'

// ---- Dark Fantasy Premium palette -------------------------------------------

const W = 1280
const H = 720

const BG_COLOR        = 0x080a12
const PANEL_BG        = 0x12161f
const PANEL_BORDER    = 0x3d2e14
const CARD_BG         = 0x141a24
const CARD_BG_HOVER   = 0x1a2230

const GOLD_HEX        = '#f0c850'
const ICE_BLUE_HEX    = '#4fc3f7'
const EMERALD_HEX     = '#4caf50'
const BLOOD_RED_HEX   = '#ef5350'
const AMBER_HEX       = '#ffa726'
const BODY_TEXT_HEX   = '#e8e0d0'
const MUTED_HEX       = '#7a7062'
const WHITE_HEX       = '#ffffff'

const GOLD_NUM        = 0xf0c850
const GOLD_BORDER     = 0x3d2e14
const EMERALD_NUM     = 0x4caf50
const BLOOD_RED_NUM   = 0xef5350
const DIVIDER_GOLD    = 0xc9a84c

// Rarity border colors
const BRONZE_BORDER   = 0xcd7f32
const SILVER_BORDER   = 0xc0c0c0
const PREMIUM_BORDER  = 0xf0c850

// ---- Shop item data ---------------------------------------------------------

type Currency = 'gold' | 'dg'
type Rarity = 'basic' | 'advanced' | 'premium'

interface ShopItem {
  name: string
  description: string
  price: number
  currency: Currency
  category: 'skills' | 'premium'
  rarity: Rarity
}

const SHOP_ITEMS: ShopItem[] = [
  {
    name: 'Pacote Basico',
    description: '1 skill aleatoria',
    price: 100,
    currency: 'gold',
    category: 'skills',
    rarity: 'basic',
  },
  {
    name: 'Pacote Avancado',
    description: '3 skills aleatorias (1 garantida rara)',
    price: 500,
    currency: 'gold',
    category: 'skills',
    rarity: 'advanced',
  },
  {
    name: 'Pacote Premium',
    description: '5 skills aleatorias (2 garantidas raras)',
    price: 50,
    currency: 'dg',
    category: 'skills',
    rarity: 'premium',
  },
  {
    name: 'Pacote de Ataque',
    description: '1 skill de ataque aleatoria',
    price: 200,
    currency: 'gold',
    category: 'skills',
    rarity: 'basic',
  },
  {
    name: 'Pacote de Defesa',
    description: '1 skill de defesa aleatoria',
    price: 200,
    currency: 'gold',
    category: 'skills',
    rarity: 'basic',
  },
  // Premium currency (placeholder)
  {
    name: '100 DG',
    description: 'Pacote de 100 DG (moeda premium)',
    price: 0,
    currency: 'dg',
    category: 'premium',
    rarity: 'basic',
  },
  {
    name: '500 DG',
    description: 'Pacote de 500 DG + bonus 50',
    price: 0,
    currency: 'dg',
    category: 'premium',
    rarity: 'advanced',
  },
]

const RARITY_BORDER: Record<Rarity, number> = {
  basic:    BRONZE_BORDER,
  advanced: SILVER_BORDER,
  premium:  PREMIUM_BORDER,
}

// ---- Random skill pool for drops --------------------------------------------

const SKILL_POOL = [
  'ls_a1', 'ls_a2', 'lw_a1', 'lw_a2', 'le_a1', 'le_a2', 'lk_a1', 'lk_a2',
  'ls_d1', 'ls_d2', 'lw_d1', 'lw_d2', 'le_d1', 'le_d2', 'lk_d1', 'lk_d2',
]
const CLASS_MAP: Record<string, string> = {
  ls: 'specialist', lw: 'warrior', le: 'executor', lk: 'king',
}

function getRandomSkill(): { skillId: string; unitClass: string } {
  const id = SKILL_POOL[Math.floor(Math.random() * SKILL_POOL.length)]
  const prefix = id.substring(0, 2)
  return { skillId: id, unitClass: CLASS_MAP[prefix] }
}

// ---- Scene ------------------------------------------------------------------

export default class ShopScene extends Phaser.Scene {
  private activeTab: 'skills' | 'premium' = 'skills'
  private itemContainer!: Phaser.GameObjects.Container
  private tabBgs = new Map<string, Phaser.GameObjects.Rectangle>()
  private tabLabels = new Map<string, Phaser.GameObjects.Text>()

  // Balance display
  private goldText!: Phaser.GameObjects.Text
  private dgText!: Phaser.GameObjects.Text

  // Popup overlay objects
  private popupOverlay: Phaser.GameObjects.Rectangle | null = null
  private popupContainer: Phaser.GameObjects.Container | null = null

  constructor() {
    super('ShopScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)

    this.drawBackground()
    this.drawTitle()
    this.drawBalanceBar()
    this.drawTabs()

    this.itemContainer = this.add.container(0, 0)
    this.renderItems()

    this.drawBackButton()
  }

  // ---- Drawing helpers ------------------------------------------------------

  private drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)
    this.add.rectangle(W / 2, H / 2, 1020, 630, PANEL_BG, 0.97)
      .setStrokeStyle(2, PANEL_BORDER, 1)
  }

  private drawTitle() {
    this.add.text(W / 2, 78, 'LOJA', {
      fontFamily: 'Arial',
      fontSize: '42px',
      color: GOLD_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Gold divider under title
    this.add.rectangle(W / 2, 104, 200, 2, DIVIDER_GOLD, 0.3)
  }

  private drawBalanceBar() {
    const barY = 128
    const barW = 420
    const barH = 36

    this.add.rectangle(W / 2, barY, barW, barH, 0x0e1118, 0.95)
      .setStrokeStyle(1, GOLD_BORDER, 0.6)

    const p = playerData.get()

    // Gold balance (left side)
    this.goldText = this.add.text(W / 2 - 60, barY, `\u269C ${p.gold}`, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: AMBER_HEX,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)

    // Separator
    this.add.text(W / 2, barY, '|', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: MUTED_HEX,
    }).setOrigin(0.5)

    // DG balance (right side)
    this.dgText = this.add.text(W / 2 + 60, barY, `\uD83D\uDC8E ${p.dg}`, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: ICE_BLUE_HEX,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
  }

  private refreshBalance() {
    const p = playerData.get()
    this.goldText.setText(`\u269C ${p.gold}`)
    this.dgText.setText(`\uD83D\uDC8E ${p.dg}`)
  }

  private drawTabs() {
    const tabs: Array<{ key: 'skills' | 'premium'; label: string }> = [
      { key: 'skills', label: 'Pacotes de Skills' },
      { key: 'premium', label: 'DG (Moeda Premium)' },
    ]

    const tabW = 220
    const tabH = 34
    const gap = 12
    const totalW = tabs.length * tabW + (tabs.length - 1) * gap
    const startX = (W - totalW) / 2 + tabW / 2
    const tabY = 164

    tabs.forEach((tab, i) => {
      const x = startX + i * (tabW + gap)
      const isActive = tab.key === this.activeTab

      const bg = this.add.rectangle(x, tabY, tabW, tabH, isActive ? 0x1c2218 : CARD_BG)
        .setStrokeStyle(1, isActive ? EMERALD_NUM : GOLD_BORDER, isActive ? 0.8 : 0.3)
        .setInteractive({ useHandCursor: true })

      const label = this.add.text(x, tabY, tab.label, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: isActive ? GOLD_HEX : MUTED_HEX,
        fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.activeTab !== tab.key) bg.setFillStyle(0x1a2230) })
      bg.on('pointerout', () => { if (this.activeTab !== tab.key) bg.setFillStyle(CARD_BG) })
      bg.on('pointerdown', () => {
        this.activeTab = tab.key
        this.refreshTabs()
        this.renderItems()
      })

      this.tabBgs.set(tab.key, bg)
      this.tabLabels.set(tab.key, label)
    })
  }

  private refreshTabs() {
    this.tabBgs.forEach((bg, key) => {
      const active = key === this.activeTab
      bg.setFillStyle(active ? 0x1c2218 : CARD_BG)
      bg.setStrokeStyle(1, active ? EMERALD_NUM : GOLD_BORDER, active ? 0.8 : 0.3)
    })
    this.tabLabels.forEach((label, key) => {
      label.setColor(key === this.activeTab ? GOLD_HEX : MUTED_HEX)
    })
  }

  private renderItems() {
    this.itemContainer.removeAll(true)

    const items = SHOP_ITEMS.filter((item) => item.category === this.activeTab)

    // Layout: responsive columns (2 cols for skills with 5 items, 2 cols for premium with 2 items)
    const cols = items.length > 3 ? 2 : 2
    const cardW = 440
    const cardH = 110
    const gapX = 16
    const gapY = 12
    const gridW = cols * cardW + (cols - 1) * gapX
    const startX = (W - gridW) / 2 + cardW / 2
    const startY = 200

    items.forEach((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = startX + col * (cardW + gapX)
      const cy = startY + row * (cardH + gapY) + cardH / 2

      const isPremiumPlaceholder = item.category === 'premium' && item.price === 0
      const rarityBorder = RARITY_BORDER[item.rarity]

      // Card background
      const cardBg = this.add.rectangle(cx, cy, cardW, cardH, CARD_BG)
        .setStrokeStyle(1, GOLD_BORDER, 0.3)
      this.itemContainer.add(cardBg)

      // Rarity top border accent (colored line at top of card)
      const topBorder = this.add.rectangle(cx, cy - cardH / 2 + 2, cardW - 2, 3, rarityBorder, 0.8)
      this.itemContainer.add(topBorder)

      // Pack name
      const nameTxt = this.add.text(cx - cardW / 2 + 16, cy - 26, item.name, {
        fontFamily: 'Arial',
        fontSize: '17px',
        color: WHITE_HEX,
        fontStyle: 'bold',
      }).setOrigin(0, 0)
      this.itemContainer.add(nameTxt)

      // Description
      const descTxt = this.add.text(cx - cardW / 2 + 16, cy + 2, item.description, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: MUTED_HEX,
      }).setOrigin(0, 0)
      this.itemContainer.add(descTxt)

      // Price + buy button (right side)
      if (!isPremiumPlaceholder) {
        const priceColor = item.currency === 'gold' ? AMBER_HEX : ICE_BLUE_HEX
        const priceIcon = item.currency === 'gold' ? '\u269C' : '\uD83D\uDC8E'
        const priceLabel = `${priceIcon} ${item.price}`

        const priceTxt = this.add.text(cx + cardW / 2 - 16, cy - 24, priceLabel, {
          fontFamily: 'Arial',
          fontSize: '16px',
          color: priceColor,
          fontStyle: 'bold',
        }).setOrigin(1, 0)
        this.itemContainer.add(priceTxt)

        // Check affordability
        const p = playerData.get()
        const canAfford = item.currency === 'gold' ? p.gold >= item.price : p.dg >= item.price
        const btnFill = CARD_BG
        const btnBorder = canAfford ? EMERALD_NUM : BLOOD_RED_NUM
        const btnAlpha = canAfford ? 0.9 : 0.5

        const buyBg = this.add.rectangle(cx + cardW / 2 - 60, cy + 20, 100, 30, btnFill)
          .setStrokeStyle(2, btnBorder, btnAlpha)
          .setInteractive({ useHandCursor: true })
        this.itemContainer.add(buyBg)

        const buyLabel = this.add.text(cx + cardW / 2 - 60, cy + 20, 'Comprar', {
          fontFamily: 'Arial',
          fontSize: '13px',
          color: canAfford ? EMERALD_HEX : BLOOD_RED_HEX,
          fontStyle: 'bold',
        }).setOrigin(0.5)
        this.itemContainer.add(buyLabel)

        buyBg.on('pointerover', () => buyBg.setFillStyle(CARD_BG_HOVER))
        buyBg.on('pointerout', () => buyBg.setFillStyle(CARD_BG))
        buyBg.on('pointerdown', () => this.onPurchase(item))
      } else {
        const placeholderTxt = this.add.text(cx + cardW / 2 - 16, cy, 'Em breve', {
          fontFamily: 'Arial',
          fontSize: '14px',
          color: MUTED_HEX,
          fontStyle: 'italic',
        }).setOrigin(1, 0.5)
        this.itemContainer.add(placeholderTxt)
      }

      // Hover effect on card
      cardBg.setInteractive()
      cardBg.on('pointerover', () => {
        cardBg.setFillStyle(CARD_BG_HOVER)
        topBorder.setAlpha(1)
      })
      cardBg.on('pointerout', () => {
        cardBg.setFillStyle(CARD_BG)
        topBorder.setAlpha(0.8)
      })
    })
  }

  // ---- Purchase flow ---------------------------------------------------------

  private onPurchase(item: ShopItem) {
    // Check if player can afford it
    if (item.currency === 'gold') {
      if (!playerData.spendGold(item.price)) {
        this.showPopup('Gold insuficiente!', true)
        return
      }
    } else {
      if (!playerData.spendDG(item.price)) {
        this.showPopup('DG insuficiente!', true)
        return
      }
    }

    // Determine how many skills to drop based on the pack
    let dropCount = 1
    if (item.name === 'Pacote Avancado') dropCount = 3
    else if (item.name === 'Pacote Premium') dropCount = 5

    // Generate and add skills
    const dropped: string[] = []
    for (let i = 0; i < dropCount; i++) {
      const { skillId, unitClass } = getRandomSkill()
      playerData.addSkill(skillId, unitClass)
      dropped.push(skillId)
    }

    // Update balance display
    this.refreshBalance()
    // Rebuild items to refresh affordability
    this.renderItems()

    // Show result
    const skillList = dropped.join(', ')
    this.showPopup(
      dropCount === 1
        ? `Skill obtida!\n\n${skillList}`
        : `${dropCount} skills obtidas!\n\n${skillList}`,
      false,
    )
  }

  private showPopup(message: string, isError: boolean) {
    // Semi-transparent overlay
    this.popupOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
      .setInteractive()
      .setDepth(100)

    const container = this.add.container(0, 0).setDepth(101)

    const boxW = 420
    const boxH = 220
    const borderColor = isError ? BLOOD_RED_NUM : GOLD_NUM

    // Popup box
    const box = this.add.rectangle(W / 2, H / 2, boxW, boxH, PANEL_BG)
      .setStrokeStyle(2, borderColor, 0.9)
    container.add(box)

    // Gold accent line at top
    container.add(
      this.add.rectangle(W / 2, H / 2 - boxH / 2 + 2, boxW - 2, 3, borderColor, 0.6)
    )

    // Message text
    const msgTxt = this.add.text(W / 2, H / 2 - 20, message, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: isError ? BLOOD_RED_HEX : BODY_TEXT_HEX,
      align: 'center',
      wordWrap: { width: boxW - 40 },
    }).setOrigin(0.5)
    container.add(msgTxt)

    // OK button
    const okBg = this.add.rectangle(W / 2, H / 2 + 68, 130, 36, CARD_BG)
      .setStrokeStyle(2, GOLD_BORDER, 0.7)
      .setInteractive({ useHandCursor: true })
    container.add(okBg)

    const okLabel = this.add.text(W / 2, H / 2 + 68, 'OK', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: GOLD_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)
    container.add(okLabel)

    okBg.on('pointerover', () => okBg.setFillStyle(CARD_BG_HOVER))
    okBg.on('pointerout', () => okBg.setFillStyle(CARD_BG))
    okBg.on('pointerdown', () => this.closePopup())

    // Animate entry
    container.setScale(0.85)
    container.setAlpha(0)
    this.tweens.add({
      targets: container,
      scaleX: 1, scaleY: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    })

    this.popupContainer = container
  }

  private closePopup() {
    if (this.popupContainer) {
      this.tweens.add({
        targets: this.popupContainer,
        scaleX: 0.9, scaleY: 0.9,
        alpha: 0,
        duration: 150,
        ease: 'Power2',
        onComplete: () => {
          this.popupContainer?.destroy()
          this.popupContainer = null
        },
      })
    }
    if (this.popupOverlay) {
      this.tweens.add({
        targets: this.popupOverlay,
        alpha: 0,
        duration: 150,
        onComplete: () => {
          this.popupOverlay?.destroy()
          this.popupOverlay = null
        },
      })
    }
  }

  // ---- Back button ----------------------------------------------------------

  private drawBackButton() {
    const y = H - 50

    const bg = this.add.rectangle(W / 2, y, 200, 42, CARD_BG)
      .setStrokeStyle(1, GOLD_BORDER, 0.4)
      .setInteractive({ useHandCursor: true })

    const label = this.add.text(W / 2, y, 'Voltar', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: MUTED_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => { bg.setFillStyle(CARD_BG_HOVER); label.setColor(BODY_TEXT_HEX) })
    bg.on('pointerout', () => { bg.setFillStyle(CARD_BG); label.setColor(MUTED_HEX) })
    bg.on('pointerdown', () => this.scene.start('LobbyScene'))
  }
}
