# AIFred - Your Local AI Coding Butler

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AIFred is your local AI coding buddy! It runs discreetly on your screen, ready to help explain code, suggest fixes, or answer programming questions using AI models that run **entirely on your own machine** via Ollama.
![product](https://github.com/user-attachments/assets/760069d2-d586-4f56-9978-6a14b36220db)



## What it Does

* **On-Screen Helper:** Shows up as a cool terminal-style window that stays on top.
* **Local AI Power:** Talks to AI models (like Gemma, Llama, etc.) running locally with Ollama, keeping your code private.
* **Model Choice:** Lets you pick which local Ollama model you want to use.
* **Clear Answers:** Displays AI responses, including nicely formatted code blocks.
* **Quick Access:** Hide or show the window instantly with `Control+Alt+C`.
* *Coming Soon:* Grab code directly from your clipboard to ask questions about it!

## How it Works (The Simple Version)

It's an **Electron app** (the window you see) that sends your questions to a local **Python server**. That server then asks your **Ollama AI** for an answer and sends it back to the window.

## Tech Stack

* **Frontend:** Electron, HTML, CSS, JavaScript
* **Backend:** Python, FastAPI
* **AI Integration:** Ollama

## Getting Started

**You'll Need:**

* [Node.js](https://nodejs.org/) & npm
* [Python](https://www.python.org/) 3.x & pip
* [Git](https://git-scm.com/)
* [Ollama](https://ollama.com/) installed and running (make sure you've pulled a model: `ollama pull gemma2:9b`)

**Steps:**

1.  **Clone the code:**
    ```bash
    git clone <your-repository-url>
    cd aifred-project # Or your folder name
    ```

2.  **Run the Backend:**
    ```bash
    cd python-backend
    pip install -r requirements.txt
    uvicorn server:app --reload
    # Keep this terminal running!
    ```

3.  **Run the Frontend:**
    * Open a *new* terminal.
    ```bash
    cd ../electron-frontend # Go back and into the frontend folder
    npm install
    npm start
    ```

## How to Use

1.  Make sure the Python backend server (Step 2) is running.
2.  Make sure Ollama is running.
3.  Start the Electron app (Step 3).
4.  Type your question in the input box at the bottom and press Enter.
5.  Use `Control+Alt+C` to quickly show or hide the AIFred window.

## Next Steps

We're currently working on adding:

* A system tray icon for easier access.
* The ability to quickly send text from your clipboard to AIFred.

## License

This project uses the MIT License.
