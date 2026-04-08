const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Draft Game',
    icon: path.join(__dirname, 'icon.png'),
  })

  // In production, load the built game
  win.loadFile(path.join(__dirname, '..', 'game-client', 'dist', 'index.html'))

  // Remove menu bar
  win.setMenuBarVisibility(false)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
