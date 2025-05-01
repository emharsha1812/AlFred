// electron-ui/main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron"); // Added globalShortcut
const path = require("path");

// Keep a global reference to prevent garbage collection
let mainWindow;

// --- Function to toggle window visibility ---
// Defined globally so it can be called by shortcut and potentially tray later
function toggleWindowVisibility() {
  if (mainWindow) {
    // Check if mainWindow exists
    if (mainWindow.isVisible()) {
      // If window is visible, maybe check if it's focused before hiding
      if (mainWindow.isFocused()) {
        mainWindow.hide(); // Hide if visible and focused
      } else {
        mainWindow.focus(); // Bring focus if visible but not focused
      }
    } else {
      // If window is hidden, show and focus it
      mainWindow.show();
      mainWindow.focus();
    }
  } else {
    console.log(
      "Attempted to toggle visibility, but mainWindow is not defined."
    );
    // If window doesn't exist, maybe create it? (Optional)
    // if (BrowserWindow.getAllWindows().length === 0) createWindow();
  }
}

// --- Function to create the window ---
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
    // skipTaskbar: true, // Consider enabling this if you want it mainly controlled by hotkey/tray
    backgroundColor: "#00000000", // Transparent background
  });

  // Load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Open DevTools in development mode (Optional)
  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.webContents.openDevTools({ mode: "detach" });
  // }

  // --- Optional: Prevent closing, hide instead ---
  // This makes the 'X' button behave like the hotkey/tray hide action
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      // Check a flag set only when explicitly quitting
      event.preventDefault(); // Prevent the window from actually closing
      mainWindow.hide(); // Hide it instead
    }
    // If app.isQuitting is true (set by Quit menu/logic), allow close
  });
  // --- End Optional Close Handler ---

  // Set up IPC listeners for window controls from renderer
  setupIPC();
} // --- End createWindow ---

// --- Set up IPC communication ---
function setupIPC() {
  // Handle window control messages from renderer
  ipcMain.on("toMain", (event, args) => {
    // Check which command was sent
    if (!args || !args.command) return;

    switch (args.command) {
      case "minimize-window":
        mainWindow?.minimize(); // Use optional chaining
        break;
      case "maximize-window":
        if (mainWindow?.isMaximized()) {
          // Use optional chaining
          mainWindow.unmaximize();
        } else {
          mainWindow?.maximize();
        }
        break;
      case "close-window":
        // Make the renderer's close button HIDE the window, consistent with 'X' button
        mainWindow?.hide();
        // If you want this button to actually QUIT the app, uncomment below:
        // app.isQuitting = true; // Signal that we intend to quit
        // app.quit();
        break;
      case "executeCode": // Example from original code
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
} // --- End setupIPC ---

// Helper to send messages to renderer (Keep if used)
function sendResponseToRenderer(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("fromMain", data);
  }
}

// --- App Lifecycle Events ---

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow(); // Create the main window

  // --- Global Shortcut Registration ---
  try {
    // Use 'Control+Alt+C' as requested
    const shortcut = "Control+Alt+C";
    if (!globalShortcut.register(shortcut, toggleWindowVisibility)) {
      console.error(
        `ERROR: Failed to register global shortcut "${shortcut}". It might be used by another application.`
      );
      // Consider notifying the user via a dialog if registration fails
    } else {
      console.log(`Global shortcut "${shortcut}" registered successfully.`);
    }
  } catch (error) {
    console.error("Error during global shortcut registration:", error);
  }
  // --- End Global Shortcut Registration ---

  // Handle macOS dock activation
  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isVisible()) {
      // If window exists but is hidden, show it on dock click
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Optional: Send initial message to renderer (Keep if used)
  // setTimeout(() => {
  //   sendResponseToRenderer({
  //     type: "response",
  //     message: "Main process ready and connected to renderer",
  //   });
  // }, 2500);
}); // --- End app.whenReady ---

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", function () {
  // On macOS, apps usually stay active even without windows.
  // If you add a Tray icon later, you'll likely want to REMOVE this app.quit() call
  // and let the user quit explicitly via the Tray menu.
  if (process.platform !== "darwin") {
    app.quit(); // Default behavior on Win/Linux
  }
});

// Unregister shortcuts when the application is about to quit
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  console.log("Global shortcuts unregistered.");
});

// --- Backend Connection Placeholder (Keep if used) ---
// function connectToBackend() {
//   console.log("Backend connection would be initialized here");
// }
