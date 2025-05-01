// electron-ui/renderer.js

// Wrap entire script in DOMContentLoaded to ensure DOM is ready
// and libraries loaded via <script> tags are potentially available.
document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const outputArea = document.getElementById("output-area");
  const inputField = document.getElementById("input-field");
  const submitButton = document.getElementById("submit-button");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const minimizeBtn = document.getElementById("minimize-btn");
  const maximizeBtn = document.getElementById("maximize-btn");
  const closeBtn = document.getElementById("close-btn");
  const modelSelect = document.getElementById("model-select"); // Added
  const refreshModelsBtn = document.getElementById("refresh-models-btn"); // Added

  // --- State Variables ---
  let currentSelectedModel = null; // Stores the currently selected model name
  let defaultModel = null; // Stores the default model name from backend status

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
   * Adds a plain text message line for user input display.
   * @param {string} message The text message to add.
   */
  function addUserMessage(message) {
    const line = document.createElement("div");
    // line.classList.add("user-message"); // Optional class
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
   * Adds a block of preformatted text (fallback).
   * Used if Markdown rendering fails or for simple text.
   * @param {string} text The preformatted text.
   */
  function addPreformattedText(text) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = text; // Display as plain text
    pre.appendChild(code);
    outputArea.appendChild(pre);
    scrollToBottom();
  }

  /**
   * Parses Markdown string, highlights code blocks, creates a container div,
   * and returns it ready for appending. Relies on global 'marked' and 'hljs'.
   * @param {string} markdownString The raw Markdown string.
   * @returns {HTMLDivElement} A div element containing the rendered content.
   */
  function renderMarkdownResponse(markdownString) {
    const container = document.createElement("div");
    container.classList.add("llm-response"); // Class for styling

    try {
      // Check if Marked library is loaded globally
      if (typeof marked === "undefined" || !marked) {
        throw new Error("Marked library is not loaded.");
      }

      // Configure marked
      marked.setOptions({
        gfm: true,
        breaks: true,
      });

      // Parse Markdown to HTML
      const generatedHtml = marked.parse(markdownString);
      container.innerHTML = generatedHtml;

      // Try to highlight code blocks using global highlight.js if available
      // Note: We previously found global 'hljs' might not be loading correctly.
      if (window.hljs && typeof window.hljs.highlightElement === "function") {
        container.querySelectorAll("pre code").forEach((block) => {
          try {
            hljs.highlightElement(block);
          } catch (highlightError) {
            console.warn(
              "Error applying highlight.js to a code block:",
              highlightError
            );
          }
        });
      } else {
        // This warning might still appear if hljs isn't loading globally
        console.warn(
          "Highlight.js (hljs) not available globally, skipping code highlighting."
        );
      }

      return container; // Return the container element with rendered content
    } catch (error) {
      console.error("Error processing Markdown response:", error);
      // Fallback: Display error and raw text in preformatted block
      container.innerHTML = `<p>Error rendering response.</p><pre>${markdownString.substring(
        0,
        200
      )}...</pre>`;
      container.classList.add("error-message");
      return container; // Return the container with error info
    }
  }

  /**
   * Shows a loading indicator in the output area.
   * @returns {HTMLElement} The loading element that can be removed later.
   */
  function showLoading() {
    // Remove any existing loaders first
    const existingLoadings = outputArea.querySelectorAll(
      ".loading-container, .loader, .spinner"
    );
    existingLoadings.forEach((el) => el.remove());

    // Create container for the loader and text
    const container = document.createElement("div");
    container.classList.add("loading-container");

    // Create the new smaller spinner
    const spinner = document.createElement("div");
    spinner.classList.add("spinner");

    // Add fewer spans for a more compact domino animation
    for (let i = 0; i < 5; i++) {
      // Reduced from 8 to 5 pieces
      const dominoPiece = document.createElement("span");
      spinner.appendChild(dominoPiece);
    }

    // Create the loading text label
    const label = document.createElement("div");
    label.textContent = ""; // Empty text for a cleaner look
    label.classList.add("loading-text");

    // Assemble the container
    container.appendChild(spinner);
    container.appendChild(label);

    // Add to the output area
    outputArea.appendChild(container);

    // Ensure it's visible
    scrollToBottom();

    // Return the container so it can be removed later
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
  function updateConnectionStatus(status) {
    statusDot.classList.remove("connecting", "offline");
    switch (status) {
      case "connected":
        statusText.textContent = "Ready";
        break;
      case "connecting":
        statusDot.classList.add("connecting");
        statusText.textContent = "Processing...";
        break;
      case "disconnected":
        statusDot.classList.add("offline");
        statusText.textContent = "Disconnected";
        break;
      case "error":
        statusDot.classList.add("offline");
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
    setTimeout(() => {
      outputArea.scrollTop = outputArea.scrollHeight;
    }, 50);
  }

  /**
   * Fetches the list of models from the backend and populates the dropdown.
   */
  async function fetchAndPopulateModels() {
    console.log("Fetching models...");
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    modelSelect.disabled = true;
    refreshModelsBtn.disabled = true;
    let fetchedModels = [];

    try {
      const response = await fetch(`${BACKEND_URL}/api/models`);
      const data = await response.json(); // Read response body once

      // Check for errors reported by the backend *or* HTTP errors
      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      if (data.error) {
        throw new Error(data.error);
      }

      modelSelect.innerHTML = ""; // Clear loading/previous options
      fetchedModels = data.models || [];

      if (fetchedModels.length > 0) {
        fetchedModels.forEach((modelName) => {
          const option = document.createElement("option");
          option.value = modelName;
          option.textContent = modelName;
          modelSelect.appendChild(option);
        });
        // Set selection: previous > default > first
        if (
          currentSelectedModel &&
          fetchedModels.includes(currentSelectedModel)
        ) {
          modelSelect.value = currentSelectedModel;
        } else if (defaultModel && fetchedModels.includes(defaultModel)) {
          modelSelect.value = defaultModel;
        } else {
          modelSelect.value = fetchedModels[0]; // Fallback to first
        }
        currentSelectedModel = modelSelect.value;
        console.log(`Models loaded. Selected: ${currentSelectedModel}`);
      } else {
        modelSelect.innerHTML = '<option value="">No models found</option>';
        currentSelectedModel = null;
        console.log("No models found via API.");
      }
    } catch (error) {
      console.error("Failed to fetch or populate models:", error);
      addError(`Failed to fetch models: ${error.message}`);
      modelSelect.innerHTML = `<option value="">Error</option>`;
      currentSelectedModel = null;
    } finally {
      // Enable/disable based on whether models were actually loaded
      modelSelect.disabled = fetchedModels.length === 0;
      refreshModelsBtn.disabled = false; // Always enable refresh button after attempt
    }
  }

  /**
   * Checks the backend status on startup, stores default model, and fetches model list.
   */
  async function checkBackendStatus() {
    try {
      updateConnectionStatus("connecting"); // Show connecting initially
      addSystemMessage("Connecting to backend...");

      const response = await fetch(`${BACKEND_URL}/api/status`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      console.log("Backend Status:", data);

      defaultModel = data.ollama_model; // Store default model name from status response
      updateConnectionStatus("connected");
      addSystemMessage(`Connected. Default model: ${defaultModel || "N/A"}.`);
      setInteractionDisabled(false); // Enable controls now
      inputField.focus();

      // Fetch models only after successful status check
      await fetchAndPopulateModels();

      // Update ready message based on model loading result
      if (currentSelectedModel) {
        addSystemMessage(`Ready. Model '${currentSelectedModel}' selected.`);
      } else {
        addSystemMessage(`Ready, but couldn't load models from Ollama.`);
      }
    } catch (error) {
      console.error("Failed to connect to backend on startup:", error);
      addError(
        `Backend connection failed: ${error.message}. Ensure server & Ollama are running.`
      );
      updateConnectionStatus("disconnected");
      setInteractionDisabled(true); // Keep controls disabled
      defaultModel = null;
      modelSelect.innerHTML = `<option value="">Connect Error</option>`;
      modelSelect.disabled = true;
      refreshModelsBtn.disabled = true;
    }
  }

  /**
   * Handles the user input submission by sending it and the selected model to the backend.
   */
  async function handleSubmit() {
    const userInput = inputField.value.trim();

    // Check if input exists and a model is selected
    if (!userInput) return; // Don't submit empty input
    if (!currentSelectedModel) {
      addError("Please select an Ollama model first.");
      // Optionally shake the dropdown or highlight it
      modelSelect.focus();
      return;
    }

    addUserMessage(`> ${userInput}`);
    const currentInput = userInput; // Store before clearing
    inputField.value = ""; // Clear input field

    const loadingIndicator = showLoading();
    updateConnectionStatus("connecting");
    setInteractionDisabled(true); // Disable UI during request

    // Construct payload with prompt and selected model
    const payload = {
      prompt: currentInput,
      model: currentSelectedModel,
    };
    console.log("Sending payload:", payload);

    try {
      const response = await fetch(`${BACKEND_URL}/api/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      hideLoading(loadingIndicator); // Hide loading indicator once response headers are received

      const data = await response.json(); // Try parsing JSON body

      if (!response.ok) {
        // Use error from JSON body if available, otherwise use status text
        throw new Error(
          data.error || `Request failed with status ${response.status}`
        );
      }

      if (data.error) {
        addError(data.error); // Display error reported by backend API
        updateConnectionStatus("error");
      } else if (data.suggestion) {
        // Render the suggestion using the markdown function
        const renderedElement = renderMarkdownResponse(data.suggestion);
        outputArea.appendChild(renderedElement);
        scrollToBottom();
        updateConnectionStatus("connected"); // Back to ready state
      } else {
        // Handle case where response is OK but has no suggestion/error
        addError("Received an empty or unexpected response from the backend.");
        updateConnectionStatus("error");
      }
    } catch (error) {
      // Handle network errors or exceptions during fetch/parsing
      console.error("Error during handleSubmit fetch:", error);
      hideLoading(loadingIndicator); // Ensure loading is hidden on error
      addError(`Communication error: ${error.message}`);
      updateConnectionStatus("error"); // Show error state
    } finally {
      // Re-enable UI elements regardless of success or failure
      setInteractionDisabled(false);
      inputField.focus(); // Put focus back on input field
    }
  }

  /**
   * Disables or enables interactive UI elements during requests.
   * @param {boolean} disabled True to disable, false to enable.
   */
  function setInteractionDisabled(disabled) {
    inputField.disabled = disabled;
    submitButton.disabled = disabled;
    modelSelect.disabled = disabled;
    refreshModelsBtn.disabled = disabled;

    // Adjust styles for disabled state if needed (optional)
    const cursorStyle = disabled ? "not-allowed" : "";
    inputField.style.cursor = disabled ? "not-allowed" : "text";
    submitButton.style.cursor = cursorStyle;
    modelSelect.style.cursor = cursorStyle;
    refreshModelsBtn.style.cursor = cursorStyle;
    // You might also adjust opacity, etc.
  }

  /**
   * Sets up click handlers for the custom window control buttons.
   */
  function setupWindowControls() {
    if (window.api && typeof window.api.send === "function") {
      minimizeBtn?.addEventListener("click", () =>
        window.api.send("toMain", { command: "minimize-window" })
      );
      maximizeBtn?.addEventListener("click", () =>
        window.api.send("toMain", { command: "maximize-window" })
      );
      closeBtn?.addEventListener("click", () =>
        window.api.send("toMain", { command: "close-window" })
      );
    } else {
      console.warn(
        "Window API (window.api.send) not available via preload bridge."
      );
      const controls = document.querySelector(".window-controls");
      if (controls) controls.style.display = "none"; // Hide controls if bridge isn't working
    }
  }

  // --- Event Listeners ---

  // Submit on button click
  submitButton.addEventListener("click", handleSubmit);

  // Submit on Enter key in input field
  inputField.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !inputField.disabled) {
      event.preventDefault();
      handleSubmit();
    }
  });

  // Update selected model state on dropdown change
  modelSelect.addEventListener("change", (event) => {
    currentSelectedModel = event.target.value;
    console.log(`Model selection changed to: ${currentSelectedModel}`);
    // Optional: addSystemMessage(`Model set to: ${currentSelectedModel}`);
  });

  // Refresh model list on button click
  refreshModelsBtn.addEventListener("click", () => {
    fetchAndPopulateModels();
  });

  // --- Initial Execution ---
  console.log("Setting up AIFred UI...");
  setupWindowControls();

  // Initial messages and status check
  addSystemMessage("AIFred Electron UI Initialized...");
  // Call checkBackendStatus after a short delay to allow backend to potentially start
  setTimeout(checkBackendStatus, 1000);

  // --- IPC Communication Setup ---
  if (window.api && typeof window.api.receive === "function") {
    // Example receiver (add specific handlers as needed)
    window.api.receive("fromMain", (data) => {
      console.log("Received from main via IPC:", data);
      if (data.type === "statusUpdate") {
        addSystemMessage(`Main Process Update: ${data.message}`);
      }
      // Handle other message types from main process if necessary
    });
  } else {
    console.warn(
      "window.api.receive not defined, IPC receive channel setup skipped."
    );
  }

  console.log("Renderer process setup complete.");
}); // <-- End of DOMContentLoaded wrapper
