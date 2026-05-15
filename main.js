const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

const DATA_PATH = path.join(__dirname, 'data.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { position: 0 };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

let mainWindow;

function createWindow() {
  Menu.setApplicationMenu(null);

  const data = readData();
  const winBounds = data.windowBounds || {};

  mainWindow = new BrowserWindow({
    width:  winBounds.width  || 1080,
    height: winBounds.height || 608,
    x:      winBounds.x,
    y:      winBounds.y,
    resizable: data.position === 1,
    titleBarStyle: 'hidden',
    titleBarOverlay: { height: 32, color: '#00000000', symbolColor: '#000000' },
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'img', 'logo_white.png'),
  });
  mainWindow.webContents.openDevTools();
  if (data.position === 1) {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(800, 500);
    mainWindow.loadFile(path.join(__dirname, 'src', 'app', 'app.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  }

  function saveBounds() {
    const d = readData();
    d.windowMaximized = mainWindow.isMaximized();
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      d.windowBounds = mainWindow.getBounds();
    }
    writeData(d);
  }

  mainWindow.on('resize',   saveBounds);
  mainWindow.on('move',     saveBounds);
  mainWindow.on('maximize', saveBounds);
  mainWindow.on('unmaximize', saveBounds);

  if (data.windowMaximized) mainWindow.maximize();

  mainWindow.webContents.session.clearCache();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  setTimeout(() => { if (!mainWindow.isVisible()) mainWindow.show(); }, 2000);
}

ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win:close',    () => mainWindow?.close());

const overlaySymbol = { light: '#000000', dark: '#ffffff' };

ipcMain.on('win:set-theme', (_e, theme) => {
  mainWindow?.setTitleBarOverlay({
    color:       '#00000000',
    symbolColor: overlaySymbol[theme] ?? '#000000',
    height:      32,
  });
});

ipcMain.on('auth:complete', () => {
  writeData({ position: 1 });
  mainWindow?.setResizable(true);
  mainWindow?.setMinimumSize(800, 500);
  mainWindow?.loadFile(path.join(__dirname, 'src', 'app', 'feed.html'));
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
