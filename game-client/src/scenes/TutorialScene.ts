import Phaser from 'phaser'

// ---- Layout constants (1280 x 720) -----------------------------------------

const W = 1280
const H = 720

const BG_COLOR     = 0x0f1117
const PANEL_COLOR  = 0x171b26
const PANEL_STROKE = 0x39435c
const GOLD_TEXT    = '#f8e7b9'
const LIGHT_TEXT   = '#cfd7ea'
const MUTED_TEXT   = '#8ea0c9'

const BTN_GREEN     = 0x3a7a45
const BTN_GREEN_HOV = 0x4a9155
const BTN_GREEN_STR = 0x9ee6a9
const BTN_BLUE      = 0x1e3a5f
const BTN_BLUE_HOV  = 0x2a4f7a
const BTN_BLUE_STR  = 0x60a5fa

// ---- Tutorial steps ---------------------------------------------------------

interface TutorialStep {
  title: string
  text: string
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Bem-vindo!',
    text: 'Bem-vindo ao Draft Game! Seu objetivo e derrotar o Rei inimigo.',
  },
  {
    title: 'Classes',
    text: 'Cada time tem 4 personagens: Rei, Guerreiro, Executor e Especialista.',
  },
  {
    title: 'Rounds',
    text: 'A partida acontece em rounds. Cada round tem 2 fases: Movimento e Acao.',
  },
  {
    title: 'Fase de Movimento',
    text: 'Na fase de MOVIMENTO, clique em um personagem e depois clique no tile para onde quer move-lo.',
  },
  {
    title: 'Fase de Acao',
    text: 'Na fase de ACAO, escolha 1 skill de ataque e 1 de defesa para cada personagem.',
  },
  {
    title: 'Deck de Skills',
    text: 'Cada personagem tem um DECK de 8 skills: 4 de ataque e 4 de defesa.',
  },
  {
    title: 'Rotacao de Skills',
    text: 'Apos usar uma skill, ela vai para o final da fila. Planeje suas jogadas!',
  },
  {
    title: 'Muro Central',
    text: 'O MURO CENTRAL da bonus! Aliados encostados no muro ganham +25% defesa e dano por aliado.',
  },
  {
    title: 'Passivas',
    text: 'Cada classe tem uma PASSIVA unica. Consulte o perfil de cada personagem.',
  },
  {
    title: 'Boa sorte!',
    text: 'Boa sorte! Agora monte seu deck e entre em combate!',
  },
]

// ---- Scene ------------------------------------------------------------------

export default class TutorialScene extends Phaser.Scene {
  private currentStep = 0

  // UI elements that update per step
  private stepTitle!: Phaser.GameObjects.Text
  private stepText!: Phaser.GameObjects.Text
  private stepCounter!: Phaser.GameObjects.Text
  private prevBtn!: Phaser.GameObjects.Rectangle
  private prevLabel!: Phaser.GameObjects.Text
  private nextBtn!: Phaser.GameObjects.Rectangle
  private nextLabel!: Phaser.GameObjects.Text
  private dots: Phaser.GameObjects.Arc[] = []

  constructor() {
    super('TutorialScene')
  }

  create() {
    this.currentStep = 0

    this.drawBackground()
    this.drawHeader()
    this.drawSkipButton()
    this.drawContentPanel()
    this.drawNavigation()
    this.drawDots()
    this.refreshStep()
  }

  // ---- Background -----------------------------------------------------------

  private drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)

    // Semi-transparent overlay to give "tutorial mode" feel
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.3)
  }

  // ---- Header ---------------------------------------------------------------

  private drawHeader() {
    this.add.text(W / 2, 50, 'TUTORIAL', {
      fontFamily: 'Arial',
      fontSize: '42px',
      color: GOLD_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.add.text(W / 2, 90, 'Aprenda o basico antes de entrar em combate', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: MUTED_TEXT,
    }).setOrigin(0.5)
  }

  // ---- Skip button (top right) ----------------------------------------------

  private drawSkipButton() {
    const x = W - 100
    const y = 50

    const bg = this.add.rectangle(x, y, 120, 36, 0x1e293b)
      .setStrokeStyle(1, 0x334155, 0.7)
      .setInteractive({ useHandCursor: true })

    const label = this.add.text(x, y, 'Pular', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#94a3b8',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => { bg.setFillStyle(0x263548); label.setColor('#f1f5f9') })
    bg.on('pointerout', () => { bg.setFillStyle(0x1e293b); label.setColor('#94a3b8') })
    bg.on('pointerdown', () => this.completeTutorial())
  }

  // ---- Content panel --------------------------------------------------------

  private drawContentPanel() {
    // Central panel where step content is displayed
    const panelY = 320
    const panelW = 800
    const panelH = 300

    this.add.rectangle(W / 2, panelY, panelW, panelH, PANEL_COLOR, 0.96)
      .setStrokeStyle(2, PANEL_STROKE, 1)

    // Step counter (e.g. "1 / 10")
    this.stepCounter = this.add.text(W / 2, panelY - 120, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: MUTED_TEXT,
    }).setOrigin(0.5)

    // Step title
    this.stepTitle = this.add.text(W / 2, panelY - 70, '', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: GOLD_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Step body text
    this.stepText = this.add.text(W / 2, panelY + 10, '', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: LIGHT_TEXT,
      align: 'center',
      wordWrap: { width: 700 },
      lineSpacing: 8,
    }).setOrigin(0.5)
  }

  // ---- Navigation buttons ---------------------------------------------------

  private drawNavigation() {
    const navY = 530

    // Previous button
    this.prevBtn = this.add.rectangle(W / 2 - 140, navY, 180, 48, BTN_BLUE)
      .setStrokeStyle(1, BTN_BLUE_STR, 0.7)
      .setInteractive({ useHandCursor: true })

    this.prevLabel = this.add.text(W / 2 - 140, navY, 'Anterior', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.prevBtn.on('pointerover', () => this.prevBtn.setFillStyle(BTN_BLUE_HOV))
    this.prevBtn.on('pointerout', () => this.prevBtn.setFillStyle(BTN_BLUE))
    this.prevBtn.on('pointerdown', () => this.goToPrev())

    // Next / Comecar button
    this.nextBtn = this.add.rectangle(W / 2 + 140, navY, 180, 48, BTN_GREEN)
      .setStrokeStyle(1, BTN_GREEN_STR, 0.7)
      .setInteractive({ useHandCursor: true })

    this.nextLabel = this.add.text(W / 2 + 140, navY, 'Proximo', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.nextBtn.on('pointerover', () => this.nextBtn.setFillStyle(BTN_GREEN_HOV))
    this.nextBtn.on('pointerout', () => this.nextBtn.setFillStyle(BTN_GREEN))
    this.nextBtn.on('pointerdown', () => this.goToNext())
  }

  // ---- Progress dots --------------------------------------------------------

  private drawDots() {
    const dotY = 580
    const dotRadius = 5
    const dotGap = 18
    const totalW = TUTORIAL_STEPS.length * (dotRadius * 2 + dotGap) - dotGap
    const startX = (W - totalW) / 2 + dotRadius

    this.dots = []
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      const x = startX + i * (dotRadius * 2 + dotGap)
      const dot = this.add.circle(x, dotY, dotRadius, 0x334155)
      this.dots.push(dot)
    }
  }

  // ---- Step logic -----------------------------------------------------------

  private refreshStep() {
    const step = TUTORIAL_STEPS[this.currentStep]
    const isLast = this.currentStep === TUTORIAL_STEPS.length - 1
    const isFirst = this.currentStep === 0

    this.stepCounter.setText(`${this.currentStep + 1} / ${TUTORIAL_STEPS.length}`)
    this.stepTitle.setText(step.title)
    this.stepText.setText(step.text)

    // Previous button visibility
    this.prevBtn.setVisible(!isFirst)
    this.prevLabel.setVisible(!isFirst)

    // Next button label changes on the last step
    this.nextLabel.setText(isLast ? 'Comecar' : 'Proximo')

    // Update dots
    this.dots.forEach((dot, i) => {
      dot.setFillStyle(i === this.currentStep ? 0x60a5fa : i < this.currentStep ? 0x3a7a45 : 0x334155)
    })
  }

  private goToNext() {
    if (this.currentStep < TUTORIAL_STEPS.length - 1) {
      this.currentStep++
      this.refreshStep()
    } else {
      this.completeTutorial()
    }
  }

  private goToPrev() {
    if (this.currentStep > 0) {
      this.currentStep--
      this.refreshStep()
    }
  }

  private completeTutorial() {
    try {
      localStorage.setItem('draft_tutorial_done', 'true')
    } catch { /* quota / private browsing */ }
    this.scene.start('LobbyScene')
  }
}
