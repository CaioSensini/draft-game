import Phaser from 'phaser'

function rerenderText(text: Phaser.GameObjects.Text): void {
  if (!text.active || !text.visible) return

  const refreshable = text as Phaser.GameObjects.Text & {
    updateText?: () => Phaser.GameObjects.Text
  }

  if (typeof refreshable.updateText === 'function') {
    refreshable.updateText()
    return
  }

  text.setText(text.text)
}

function visitGameObject(obj: Phaser.GameObjects.GameObject): void {
  if (obj instanceof Phaser.GameObjects.Text) {
    rerenderText(obj)
    return
  }

  if (obj instanceof Phaser.GameObjects.Container) {
    for (const child of obj.list) {
      visitGameObject(child as Phaser.GameObjects.GameObject)
    }
  }
}

export function rerenderActiveTextObjects(game: Phaser.Game): void {
  for (const scene of game.scene.getScenes(true)) {
    for (const obj of scene.children.list) {
      visitGameObject(obj)
    }
  }
}
