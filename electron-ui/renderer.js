// electron-ui/renderer.js

// --- DOM Elements ---
const outputArea = document.getElementById("output-area");
const inputField = document.getElementById("input-field");
const submitButton = document.getElementById("submit-button");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const minimizeBtn = document.getElementById("minimize-btn");
const maximizeBtn = document.getElementById("maximize-btn");
const closeBtn = document.getElementById("close-btn");

// --- Backend API URL ---
const BACKEND_URL = "http://127.0.0.1:8000"; // Your FastAPI server address

// --- Functions ---

/**
 * Adds a system message to the output area.
 * @param {string} message The text message to add.
 */
function addSystemMessage(message) {
  const line = document.createElement("div");
  line.textContent = message;
  line.classList.add("system-message");
  outputArea.appendChild(line);
  scrollToBottom();
}

/**
 * Adds a plain text message line to the output area (e.g., user input).
 * @param {string} message The text message to add.
 */
function addUserMessage(message) {
  const line = document.createElement("div");
  // Optionally add a class for user messages if you want different styling
  // line.classList.add("user-message");
  line.textContent = message;
  outputArea.appendChild(line);
  scrollToBottom();
}

/**
 * Adds an error message to the output area.
 * @param {string} message The error message to add.
 */
function addError(message) {
  const line = document.createElement("div");
  line.textContent = `Error: ${message}`; // Prefix with "Error: "
  line.classList.add("error-message");
  outputArea.appendChild(line);
  scrollToBottom();
}

/**
 * Adds a preformatted block with syntax highlighting (AI response).
 * @param {string} text The preformatted text.
 * @param {string} [language] Optional language for syntax highlighting.
 */
function addPreformattedText(text, language = "plaintext") {
  // Default to plaintext
  const pre = document.createElement("pre");
  const code = document.createElement("code");

  // Try to detect language if not provided and highlight.js is available
  let effectiveLanguage = language;
  if (language === "plaintext" && window.hljs) {
    // Use auto-detection, limit to common languages for performance if needed
    // const detected = hljs.highlightAuto(text);
    // effectiveLanguage = detected.language || 'plaintext';
    // For now, let's explicitly ask for python/js detection or default
    if (
      text.includes("def ") ||
      text.includes("import ") ||
      text.includes(":")
    ) {
      effectiveLanguage = "python";
    } else if (
      text.includes("function") ||
      text.includes("const") ||
      text.includes("let")
    ) {
      effectiveLanguage = "javascript";
    }
    // Add more heuristics if needed
  }

  // Apply the language class if highlight.js is available
  if (window.hljs) {
    code.classList.add(`language-${effectiveLanguage}`);
    code.textContent = text;
    try {
      // Highlight the element AFTER adding it to the DOM might be more reliable sometimes
      // For now, highlight before appending
      hljs.highlightElement(code);
    } catch (e) {
      console.warn("Failed to apply syntax highlighting:", e);
      code.textContent = text; // Fallback to plain text
    }
  } else {
    code.textContent = text;
  }

  pre.appendChild(code);
  outputArea.appendChild(pre);
  scrollToBottom();
}

/**
 * Shows a loading indicator in the output area.
 * @returns {HTMLElement} The loading element that can be removed later.
 */
function showLoading() {
  // Remove existing loading indicators first
  const existingLoadings = outputArea.querySelectorAll(
    ".loading-container, .loader"
  );
  existingLoadings.forEach((el) => el.remove());

  const container = document.createElement("div");
  container.classList.add("loading-container");

  // Create the loader with the new style
  const loader = document.createElement("div");
  loader.classList.add("loader");

  // Create text label for the loader
  const label = document.createElement("div");
  label.textContent = "Processing";
  label.classList.add("loading-text");

  // Add elements to container
  container.appendChild(loader);
  container.appendChild(label);

  outputArea.appendChild(container);
  scrollToBottom();
  return container;
}
/**
 * Removes a specific loading indicator element.
 * @param {HTMLElement} loadingElement The element returned by showLoading.
 */
function hideLoading(loadingElement) {
  if (loadingElement && loadingElement.parentNode) {
    loadingElement.remove();
  } else {
    // Fallback: Remove any loading indicators if the specific one wasn't passed/found
    const existingLoadings = outputArea.querySelectorAll(
      ".loading, .loading-container, .loader"
    );
    existingLoadings.forEach((el) => el.remove());
  }
}
/**
 * Updates the connection status display.
 * @param {'connected'|'connecting'|'disconnected'|'error'} status The connection status.
 */
function updateConnectionStatus(status, message = "") {
  // Remove all status classes
  statusDot.classList.remove("connecting", "offline");

  // Update based on status
  switch (status) {
    case "connected":
      statusText.textContent = "Ready"; // Changed from Connected for brevity
      break;
    case "connecting": // Use this when making a request
      statusDot.classList.add("connecting");
      statusText.textContent = "Processing...";
      break;
    case "disconnected":
      statusDot.classList.add("offline");
      statusText.textContent = "Disconnected";
      break;
    case "error":
      statusDot.classList.add("offline"); // Show as offline on error
      statusText.textContent = "Error";
      break;
    default:
      statusText.textContent = "Unknown";
  }
}

/**
 * Scrolls the output area to the bottom.
 */
function scrollToBottom() {
  // Add a small delay to ensure DOM is updated before scrolling
  setTimeout(() => {
    outputArea.scrollTop = outputArea.scrollHeight;
  }, 50);
}

/**
 * Handles the user input submission by sending it to the backend.
 * Uses async/await for cleaner fetch handling.
 */
async function handleSubmit() {
  // Make the function async
  const userInput = inputField.value.trim();
  if (!userInput) return;

  // Display the user's message
  addUserMessage(`> ${userInput}`);

  // Clear the input field
  const currentInput = userInput; // Store before clearing
  inputField.value = "";

  // Show loading indicator and update status
  const loadingIndicator = showLoading();
  updateConnectionStatus("connecting");
  setInteractionDisabled(true); // Disable input/button during processing

  try {
    const response = await fetch(`${BACKEND_URL}/api/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json", // Explicitly accept JSON
      },
      body: JSON.stringify({ prompt: currentInput }), // Send the stored input
    });

    // Hide loading indicator *after* fetch returns
    hideLoading(loadingIndicator);

    if (!response.ok) {
      // Handle HTTP errors (e.g., 404, 500)
      const errorText = await response.text(); // Try to get error text from response body
      throw new Error(
        `HTTP error ${response.status}: ${errorText || response.statusText}`
      );
    }

    // Parse the JSON response from the backend
    const data = await response.json();

    if (data.error) {
      // Handle errors reported by the backend API
      addError(data.error);
      updateConnectionStatus("error");
    } else if (data.suggestion) {
      // Display the successful suggestion
      addPreformattedText(data.suggestion); // Let it try to auto-detect language
      updateConnectionStatus("connected"); // Back to ready state
    } else {
      // Handle unexpected case where response has neither suggestion nor error
      addError("Received an empty or invalid response from the backend.");
      updateConnectionStatus("error");
    }
  } catch (error) {
    // Handle network errors or exceptions during fetch/parsing
    console.error("Error during fetch:", error);
    hideLoading(loadingIndicator); // Ensure loading is hidden on error
    addError(`Network or communication error: ${error.message}`);
    updateConnectionStatus("error"); // Show error state
  } finally {
    // Re-enable input/button regardless of success or failure
    setInteractionDisabled(false);
    inputField.focus(); // Put focus back on input field
  }
}

/**
 * Disables or enables the input field and submit button.
 * @param {boolean} disabled True to disable, false to enable.
 */
function setInteractionDisabled(disabled) {
  inputField.disabled = disabled;
  submitButton.disabled = disabled;
  submitButton.style.cursor = disabled ? "not-allowed" : "pointer";
  inputField.style.cursor = disabled ? "not-allowed" : "text";
}

// --- Window Control Functions ---

/**
 * Set up the window control buttons.
 */
function setupWindowControls() {
  // Use the preload bridge to communicate with the main process
  if (window.api) {
    minimizeBtn?.addEventListener("click", () => {
      // Optional chaining for safety
      window.api.send("toMain", { command: "minimize-window" });
    });

    maximizeBtn?.addEventListener("click", () => {
      window.api.send("toMain", { command: "maximize-window" });
    });

    closeBtn?.addEventListener("click", () => {
      window.api.send("toMain", { command: "close-window" });
    });
  } else {
    console.warn(
      "Window API (window.api) not available through preload bridge"
    );
    // Hide window controls if they can't function
    const controls = document.querySelector(".window-controls");
    if (controls) controls.classList.add("hidden");
  }
}

// --- Event Listeners ---

// Submit on button click
submitButton.addEventListener("click", handleSubmit);

// Submit on Enter key in input field
inputField.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !inputField.disabled) {
    // Check if not disabled
    event.preventDefault(); // Prevent default form submission/newline
    handleSubmit();
  }
});

// --- Initial Execution ---

// Setup window controls
setupWindowControls();

// Initial log messages with animation delay
setTimeout(() => {
  addSystemMessage("AIFred Electron UI Initialized...");
}, 300);

setTimeout(() => {
  addSystemMessage("Connecting to backend..."); // Changed message
  updateConnectionStatus("connecting");
}, 600);

// --- Check Backend Status on Startup ---
async function checkBackendStatus() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/status`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    console.log("Backend Status:", data);
    updateConnectionStatus("connected");
    addSystemMessage(
      `Connected to backend. Model: ${data.ollama_model || "Unknown"}.`
    );
    addSystemMessage(
      "Ready. Type a message or use /help for simulated commands."
    );
    setInteractionDisabled(false); // Enable input on successful connection
    inputField.focus(); // Focus on input field
  } catch (error) {
    console.error("Failed to connect to backend on startup:", error);
    addError(
      `Failed to connect to backend: ${error.message}. Please ensure the Python server is running.`
    );
    updateConnectionStatus("disconnected"); // Show disconnected status
    setInteractionDisabled(true); // Keep input disabled if backend isn't reachable
  }
}

// Check status after a delay to allow backend to start fully
setTimeout(checkBackendStatus, 1500);

// Initialize syntax highlighting if available
// Note: We load specific languages in index.html now
if (window.hljs) {
  console.log("Highlight.js core loaded.");
  // No need to call hljs.highlightAll() as we highlight elements dynamically
} else {
  console.warn("Highlight.js not found, syntax highlighting disabled");
}

// --- IPC Communication Setup ---
if (window.api) {
  // Example: Receive messages from main process (if needed later)
  window.api.receive("fromMain", (data) => {
    console.log("Received from main:", data);
    // Handle based on message type if main process sends messages
    if (data.type === "statusUpdate") {
      addSystemMessage(`Main Process Update: ${data.message}`);
    }
  });
} else {
  console.warn("window.api not defined, IPC receive channel setup skipped.");
}

console.log("Renderer process loaded.");
