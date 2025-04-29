// preload.js
// This file runs in a privileged context with access to both Node.js and browser APIs

// Set up contextBridge for secure IPC (Inter-Process Communication)
const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('api', {
  // Method to send messages to the main process
  send: (channel, data) => {
    // Whitelist channels for security
    const validChannels = ['toMain', 'executeCode', 'requestBackendConnection'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  
  // Method to receive messages from the main process
  receive: (channel, func) => {
    // Whitelist channels for security
    const validChannels = ['fromMain', 'backendResponse', 'statusUpdate'];
    if (validChannels.includes(channel)) {
      // Remove the event listener to avoid memory leaks
      ipcRenderer.removeAllListeners(channel);
      // Add the new event listener
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});

// Log when preload has initialized
console.log('Preload script loaded');