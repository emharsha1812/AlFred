// electron-frontend/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// --- Highlight.js Setup ---
let hljsApi = {}; // Object to hold our highlight function
try {
  console.log("Preload: Loading highlight.js...");
  // Load the core library using require (available in preload)
  const hljs = require("highlight.js/lib/core");

  // Load and register the languages you need explicitly
  hljs.registerLanguage("python", require("highlight.js/lib/languages/python"));
  hljs.registerLanguage(
    "javascript",
    require("highlight.js/lib/languages/javascript")
  );
  hljs.registerLanguage("css", require("highlight.js/lib/languages/css"));
  hljs.registerLanguage("xml", require("highlight.js/lib/languages/xml")); // For HTML
  hljs.registerLanguage("bash", require("highlight.js/lib/languages/bash"));
  hljs.registerLanguage("json", require("highlight.js/lib/languages/json"));
  // Add other languages if needed

  console.log("Preload: highlight.js loaded and languages registered.");

  // Define the function that will perform highlighting
  hljsApi.highlight = (code, language) => {
    // Check if the specified language is loaded
    if (language && hljs.getLanguage(language)) {
      try {
        // Use hljs.highlight, returning the .value (highlighted HTML string)
        return hljs.highlight(code, {
          language: language,
          ignoreIllegals: true,
        }).value;
      } catch (e) {
        console.error(
          `Preload Error (highlight): Failed to highlight with lang ${language}`,
          e
        );
        return code; // Return original code on error
      }
    } else {
      // If language not specified or not loaded, fallback to auto-detection
      try {
        return hljs.highlightAuto(code).value;
      } catch (e) {
        console.error(
          `Preload Error (highlightAuto): Failed to auto-highlight`,
          e
        );
        return code; // Return original code on error
      }
    }
  };
} catch (err) {
  console.error(
    "PRELOAD SCRIPT ERROR: Failed to load or setup highlight.js!",
    err
  );
  // Provide a dummy function if loading failed so renderer doesn't crash
  hljsApi.highlight = (code, language) => {
    console.warn(
      "Preload Warning: highlight.js is not available. Returning raw code."
    );
    return code; // Return raw code without highlighting
  };
}
// --- End Highlight.js Setup ---

// Expose API to the renderer process
contextBridge.exposeInMainWorld("api", {
  // --- Existing IPC methods ---
  send: (channel, data) => {
    const validChannels = ["toMain" /* other channels */];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ["fromMain" /* other channels */];
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      }; // Unsubscribe function
    }
    return () => {}; // Dummy unsubscribe
  },
  // --- ADDED: Expose the highlighter function ---
  highlightCode: (code, language) => {
    return hljsApi.highlight(code, language); // Call the function defined above
  },
});

console.log("Preload script finished. API (including highlightCode) exposed.");
