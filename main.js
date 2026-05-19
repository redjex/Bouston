const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

// userData сохраняется между перезапусками и не затрагивается git/сборками
const DATA_PATH = path.join(app.getPath('userData'), 'data.json');

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
  const isApp = data.position === 1 && !!data.authToken;
  const winBounds = isApp ? (data.windowBounds || {}) : {};

  mainWindow = new BrowserWindow({
    width:  isApp ? (winBounds.width  || 1080) : 1250,
    height: isApp ? (winBounds.height || 608)  : 720,
    x:      isApp ? winBounds.x : undefined,
    y:      isApp ? winBounds.y : undefined,
    resizable: isApp,
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

  // mainWindow.webContents.openDevTools();
  
  if (isApp) {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(800, 500);
    mainWindow.loadFile(path.join(__dirname, 'src', 'app', 'app.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  }

  function saveBounds() {
    if (!isApp) return;
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

  if (!isApp) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript('localStorage.clear()');
    });
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  setTimeout(() => { if (!mainWindow.isVisible()) mainWindow.show(); }, 2000);
}

const EMOJI_DIR = path.join(__dirname, 'img', 'emoji');
ipcMain.handle('emoji:list', () =>
  fs.readdirSync(EMOJI_DIR)
    .filter(f => f.endsWith('.tgs'))
    .sort()
    .map(f => ({ file: f, emoji: f.replace(/^\d+_/, '').replace(/\.tgs$/, '') }))
);

ipcMain.on('shell:open', (_e, url) => shell.openExternal(url));
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

ipcMain.on('auth:complete', (_e, data) => {
  const { token, ...tgUser } = data || {};
  writeData({ position: 1, tgUser: tgUser || null, authToken: token || null });
  mainWindow?.setResizable(true);
  mainWindow?.setMinimumSize(800, 500);
  mainWindow?.loadFile(path.join(__dirname, 'src', 'app', 'app.html'));
});

ipcMain.handle('user:get-tg', () => {
  const d = readData();
  return d.tgUser || null;
});

ipcMain.handle('auth:get-token', () => {
  const d = readData();
  return d.authToken || null;
});

ipcMain.on('auth:logout', () => {
  writeData({ position: 0 });
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  mainWindow?.setResizable(false);
  mainWindow?.setMinimumSize(0, 0);
  mainWindow?.setSize(1250, 720);
  mainWindow?.center();
  mainWindow?.loadFile(path.join(__dirname, 'src', 'index.html'));
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
