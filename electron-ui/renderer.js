// electron-ui/renderer.js

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
  const modelSelect = document.getElementById("model-select");
  const refreshModelsBtn = document.getElementById("refresh-models-btn");
  // --- New DOM Elements for Image Upload ---
  const attachButton = document.getElementById("attach-button");
  const imageUploadInput = document.getElementById("image-upload-input");
  const attachmentInfo = document.getElementById("attachment-info");
  const attachmentFilename = document.getElementById("attachment-filename");
  const removeAttachmentBtn = document.getElementById("remove-attachment-btn");
  // --- End New DOM Elements ---

  // --- State Variables ---
  let currentSelectedModel = null;
  let defaultModel = null;
  // --- New State Variable for Image ---
  let attachedImageBase64 = null; // Store the base64 string of the image
  let attachedImageFilename = null; // Store the filename
  // --- End New State Variable ---

  // --- Backend API URL ---
  const BACKEND_URL = "http://127.0.0.1:8000";

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
   * @param {boolean} hasAttachment Indicates if an image was attached with this message.
   */
  function addUserMessage(message, hasAttachment = false) {
    const line = document.createElement("div");
    let displayMessage = `> ${message}`;
    if (hasAttachment) {
      displayMessage += ` [Image: ${attachedImageFilename || "Attached"}]`; // Add indication
    }
    line.textContent = displayMessage;
    outputArea.appendChild(line);
    scrollToBottom();
  }

  /**
   * Adds an error message to the output area.
   * @param {string} message The error message to add.
   */
  function addError(message) {
    const line = document.createElement("div");
    line.textContent = `Error: ${message}`;
    line.classList.add("error-message");
    outputArea.appendChild(line);
    scrollToBottom();
  }

  /**
   * Clears the currently attached image state and UI.
   */
  function clearAttachment() {
    attachedImageBase64 = null;
    attachedImageFilename = null;
    attachmentFilename.textContent = "";
    attachmentInfo.classList.add("hidden");
    // Reset the file input so the same file can be selected again
    imageUploadInput.value = null;
    console.log("Attachment cleared.");
  }

  // --- (renderMarkdownResponse, showLoading, hideLoading, updateConnectionStatus, scrollToBottom - remain unchanged) ---
  // Include the updated renderMarkdownResponse from previous step if you haven't already

  /**
   * Parses Markdown string, highlights code blocks, creates a container div,
   * and returns it ready for appending. Relies on global 'marked' and bridged 'api.highlightCode'.
   * @param {string} markdownString The raw Markdown string.
   * @returns {HTMLDivElement} A div element containing the rendered content.
   */
  function renderMarkdownResponse(markdownString) {
    const container = document.createElement("div");
    container.classList.add("llm-response");

    try {
      if (typeof marked === "undefined" || !marked) {
        throw new Error("Marked library is not loaded.");
      }

      marked.setOptions({
        gfm: true,
        breaks: true,
      });

      const generatedHtml = marked.parse(markdownString);
      container.innerHTML = generatedHtml;

      // Use the highlightCode function exposed via preload bridge
      if (window.api && typeof window.api.highlightCode === "function") {
        container.querySelectorAll("pre code").forEach((block) => {
          try {
            const languageMatch = block.className.match(/language-(\w+)/);
            const language = languageMatch ? languageMatch[1] : null;
            const codeText = block.textContent;
            const highlightedHtml = window.api.highlightCode(
              codeText,
              language
            );
            block.innerHTML = highlightedHtml;
          } catch (highlightError) {
            console.warn(
              "Error applying highlight via bridge:",
              highlightError,
              "Block:",
              block
            );
          }
        });
      } else {
        console.warn(
          "window.api.highlightCode not available via preload bridge, skipping code highlighting."
        );
      }

      return container;
    } catch (error) {
      console.error("Error processing Markdown response:", error);
      container.innerHTML = `<p>Error rendering response.</p><pre>${markdownString.substring(
        0,
        200
      )}...</pre>`;
      container.classList.add("error-message");
      return container;
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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      if (data.error) {
        throw new Error(data.error);
      }

      modelSelect.innerHTML = "";
      fetchedModels = data.models || [];

      if (fetchedModels.length > 0) {
        fetchedModels.forEach((modelName) => {
          const option = document.createElement("option");
          option.value = modelName;
          option.textContent = modelName;
          modelSelect.appendChild(option);
        });
        if (
          currentSelectedModel &&
          fetchedModels.includes(currentSelectedModel)
        ) {
          modelSelect.value = currentSelectedModel;
        } else if (defaultModel && fetchedModels.includes(defaultModel)) {
          modelSelect.value = defaultModel;
        } else {
          modelSelect.value = fetchedModels[0];
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
      modelSelect.disabled = fetchedModels.length === 0;
      refreshModelsBtn.disabled = false;
    }
  }

  /**
   * Checks the backend status on startup, stores default model, and fetches model list.
   */
  async function checkBackendStatus() {
    try {
      updateConnectionStatus("connecting");
      addSystemMessage("Connecting to backend...");

      const response = await fetch(`${BACKEND_URL}/api/status`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      console.log("Backend Status:", data);

      defaultModel = data.ollama_model;
      updateConnectionStatus("connected");
      addSystemMessage(`Connected. Default model: ${defaultModel || "N/A"}.`);
      setInteractionDisabled(false);
      inputField.focus();

      await fetchAndPopulateModels();

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
      setInteractionDisabled(true);
      defaultModel = null;
      modelSelect.innerHTML = `<option value="">Connect Error</option>`;
      modelSelect.disabled = true;
      refreshModelsBtn.disabled = true;
    }
  }

  /**
   * Handles the user input submission (text and optional image) to the backend.
   */
  async function handleSubmit() {
    const userInput = inputField.value.trim();
    const isImageAttached = !!attachedImageBase64; // Check if image data exists

    // Require either text input OR an attached image to proceed
    if (!userInput && !isImageAttached) {
      addError("Please enter a prompt or attach an image.");
      inputField.focus();
      return;
    }

    if (!currentSelectedModel) {
      addError("Please select an Ollama model first.");
      modelSelect.focus();
      return;
    }

    // Display user message (including image indication)
    addUserMessage(userInput || "(Image prompt)", isImageAttached); // Show placeholder if no text

    const currentInput = userInput; // Store before clearing
    inputField.value = ""; // Clear input field

    const loadingIndicator = showLoading();
    updateConnectionStatus("connecting");
    setInteractionDisabled(true);

    // Construct payload
    const payload = {
      prompt: currentInput || "Describe this image", // Use default prompt if only image
      model: currentSelectedModel,
      image: null, // Initialize image field
    };

    // Add image data if attached, stripping the prefix
    if (isImageAttached && attachedImageBase64) {
      const base64Prefix = "data:image/";
      const commaIndex = attachedImageBase64.indexOf(",");
      if (attachedImageBase64.startsWith(base64Prefix) && commaIndex > -1) {
        payload.image = attachedImageBase64.substring(commaIndex + 1); // Get only the base64 part
      } else {
        console.warn(
          "Unexpected Base64 format, sending as is:",
          attachedImageBase64.substring(0, 50) + "..."
        );
        // Optionally, send the whole thing or handle the error differently
        payload.image = attachedImageBase64;
      }
    }

    console.log("Sending payload:", {
      ...payload,
      image: payload.image ? "[Attached Image]" : null,
    }); // Don't log full base64

    try {
      const response = await fetch(`${BACKEND_URL}/api/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      hideLoading(loadingIndicator);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed with status ${response.status}`
        );
      }

      if (data.error) {
        addError(data.error);
        updateConnectionStatus("error");
      } else if (data.suggestion) {
        const renderedElement = renderMarkdownResponse(data.suggestion);
        outputArea.appendChild(renderedElement);
        scrollToBottom();
        updateConnectionStatus("connected");
      } else {
        addError("Received an empty or unexpected response from the backend.");
        updateConnectionStatus("error");
      }
    } catch (error) {
      console.error("Error during handleSubmit fetch:", error);
      hideLoading(loadingIndicator);
      addError(`Communication error: ${error.message}`);
      updateConnectionStatus("error");
    } finally {
      // --- Clear the attachment after sending ---
      clearAttachment();
      // --- End clear attachment ---

      setInteractionDisabled(false);
      inputField.focus();
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
    attachButton.disabled = disabled; // Also disable attach button during processing
    removeAttachmentBtn.disabled = disabled; // Disable remove button too

    const cursorStyle = disabled ? "not-allowed" : "";
    inputField.style.cursor = disabled ? "not-allowed" : "text";
    submitButton.style.cursor = cursorStyle;
    modelSelect.style.cursor = cursorStyle;
    refreshModelsBtn.style.cursor = cursorStyle;
    attachButton.style.cursor = cursorStyle;
    removeAttachmentBtn.style.cursor = cursorStyle;
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
      if (controls) controls.style.display = "none";
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
  });

  // Refresh model list on button click
  refreshModelsBtn.addEventListener("click", () => {
    fetchAndPopulateModels();
  });

  // --- New Event Listeners for Image Upload ---

  // Trigger hidden file input when attach button is clicked
  attachButton.addEventListener("click", () => {
    if (!attachButton.disabled) {
      // Prevent triggering if disabled
      imageUploadInput.click();
    }
  });

  // Handle file selection from the hidden input
  imageUploadInput.addEventListener("change", (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];

      // Basic validation: Check if it's an image
      if (!file.type.startsWith("image/")) {
        addError("Please select a valid image file (e.g., PNG, JPG, GIF).");
        clearAttachment(); // Clear any previous state and reset input
        return;
      }

      // Read the file as Base64 Data URL
      const reader = new FileReader();

      reader.onload = (e) => {
        attachedImageBase64 = e.target.result; // Store the full data URL initially
        attachedImageFilename = file.name; // Store filename
        console.log(
          `Image attached: ${file.name}, Size: ${Math.round(
            file.size / 1024
          )} KB`
        );

        // Update UI to show attached file
        attachmentFilename.textContent = file.name;
        attachmentInfo.classList.remove("hidden");
      };

      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        addError(`Failed to read image file: ${error}`);
        clearAttachment();
      };

      reader.readAsDataURL(file); // Start reading the file
    }
    // No need to reset input value here, do it in clearAttachment
  });

  // Handle remove attachment button click
  removeAttachmentBtn.addEventListener("click", () => {
    clearAttachment();
  });
  // --- End New Event Listeners ---

  // --- Initial Execution ---
  console.log("Setting up AIFred UI...");
  setupWindowControls();
  addSystemMessage("AIFred Electron UI Initialized...");
  setTimeout(checkBackendStatus, 1000);

  // --- IPC Communication Setup ---
  if (window.api && typeof window.api.receive === "function") {
    window.api.receive("fromMain", (data) => {
      console.log("Received from main via IPC:", data);
      if (data.type === "statusUpdate") {
        addSystemMessage(`Main Process Update: ${data.message}`);
      }
    });
  } else {
    console.warn(
      "window.api.receive not defined, IPC receive channel setup skipped."
    );
  }

  console.log("Renderer process setup complete.");
}); // <-- End of DOMContentLoaded wrapper
