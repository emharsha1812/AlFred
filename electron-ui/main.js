// electron-ui/main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// Keep a global reference to prevent garbage collection
let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800, // Increased width for better readability
    height: 600, // Increased height for better UX
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // Use preload for secure IPC
      contextIsolation: true, // Security: keep renderer isolated
      nodeIntegration: false, // Security: keep Node.js out of renderer
    },
    frame: false, // Make the window frameless
    transparent: true, // Allow transparency
    alwaysOnTop: true, // Keep it on top
    // skipTaskbar: true, // Hide from taskbar (optional)
    backgroundColor: "#00000000", // Transparent background
  });

  // Load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Open DevTools in development mode
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Set up IPC listeners for window controls
  setupIPC();
}

// Set up IPC communication
function setupIPC() {
  // Handle window control messages from renderer
  ipcMain.on("toMain", (event, args) => {
    // Check which command was sent
    if (!args || !args.command) return;

    switch (args.command) {
      case "minimize-window":
        mainWindow.minimize();
        break;
      case "maximize-window":
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case "close-window":
        mainWindow.close();
        break;
      case "executeCode":
        // Future: Send to Python backend
        sendResponseToRenderer({
          type: "response",
          message: "Code execution processed (simulated)",
        });
        break;
      default:
        console.log("Unknown command:", args.command);
    }
  });
}

// Helper to send messages to renderer
function sendResponseToRenderer(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("fromMain", data);
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  // Handle macOS dock behavior
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // After a short delay, send an initial message to the renderer
  setTimeout(() => {
    sendResponseToRenderer({
      type: "response",
      message: "Main process ready and connected to renderer",
    });
  }, 2500);
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle backend connection (future implementation)
// This will manage the Python backend process
function connectToBackend() {
  // Future: Add logic to spawn/connect to Python backend
  console.log("Backend connection would be initialized here");
}
