// electron-ui/markdown-renderer.js

// Import the 'marked' library
import { marked } from "marked";

// Make sure hljs is loaded globally (usually via index.html)
// If hljs is not globally available, you might need to import it here too
// import hljs from 'highlight.js'; // Example if loading as module

/**
 * Renders a Markdown string into HTML, highlights code blocks,
 * and returns a container element ready to be appended.
 * @param {string} markdownString The raw Markdown string.
 * @returns {HTMLDivElement} A div element containing the rendered content.
 * @throws {Error} If Markdown parsing fails.
 */
function renderMarkdown(markdownString) {
  const container = document.createElement("div");
  container.classList.add("llm-response"); // Class for styling

  try {
    // Configure marked (optional)
    marked.setOptions({
      gfm: true,
      breaks: true,
      // sanitize: true, // Consider sanitization for security
    });

    // Parse Markdown to HTML
    const generatedHtml = marked.parse(markdownString);
    container.innerHTML = generatedHtml; // Set the HTML content

    // Find and highlight code blocks within the generated HTML
    const codeBlocks = container.querySelectorAll("pre code");
    codeBlocks.forEach((block) => {
      try {
        // Check if highlight.js is loaded and available
        if (
          typeof hljs !== "undefined" &&
          hljs &&
          typeof hljs.highlightElement === "function"
        ) {
          hljs.highlightElement(block);
        } else {
          console.warn(
            "hljs.highlightElement is not available for code block:",
            block
          );
        }
      } catch (highlightError) {
        console.warn("Error applying highlight.js:", highlightError);
      }
    });

    return container; // Return the container element
  } catch (parseError) {
    console.error("Error parsing Markdown:", parseError);
    // Return a basic container with error text if parsing fails
    container.textContent = `Error rendering response: ${markdownString.substring(
      0,
      100
    )}...`;
    container.classList.add("error-message"); // Style as error
    // We throw here so the calling function knows rendering failed
    throw new Error(`Markdown rendering failed: ${parseError.message}`);
  }
}

// Export the function to make it available for import in other files
export { renderMarkdown };
