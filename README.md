# AIFred - Your Local AI Coding Assistant 🤖

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AIFred is your local AI coding buddy! It runs discreetly on your screen, ready to help explain code, suggest fixes, answer programming questions, or even take voice commands, using AI models that run **entirely on your own machine**. Privacy first!

![AIFred Screenshots - Helping with a coding problem](![image](https://github.com/user-attachments/assets/07204fea-7e00-401e-9446-65500381a3c0)
)
![Alfred can also understand and trascribe your voice](![image](https://github.com/user-attachments/assets/68623d44-9296-40b0-8a5b-b5f1b3dff294)
)

## ✨ Features

* **On-Screen Helper:** A sleek, terminal-styled overlay window that stays on top.
* **Local LLM Power:** Integrates with **Ollama** to run large language models (like Gemma, Llama 3, etc.) locally on your machine. Your code and queries stay private.
* **🗣️ Voice Input:** Click the microphone icon, speak your query, and AIFred will transcribe it locally using the powerful Parakeet ASR model and send it directly to the selected Ollama LLM.
* **Model Selection:** Choose which installed Ollama model you want to use via a dropdown menu.
* **Syntax Highlighting:** Displays code snippets in AI responses with proper highlighting.
* **Quick Access:** Toggle the window's visibility instantly with a global hotkey (`Ctrl+Alt+C` by default).

## ⚙️ How it Works

AIFred combines a modern frontend with a local backend:

1.  **Frontend (Electron):** Provides the user interface, captures text and microphone input, displays results.
2.  **Backend (Python/FastAPI):**
    * Receives requests from the frontend.
    * Handles **Speech-to-Text (STT):** Transcribes recorded audio using a locally run [NVIDIA NeMo Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) model.
    * Handles **LLM Interaction:** Forwards text prompts (from typing or transcription) to your running Ollama instance.
    * Sends responses back to the frontend.
3.  **Ollama:** Runs the actual large language models locally. AIFred communicates with its API.

![Workflow Diagram Placeholder](https://via.placeholder.com/600x150/2a2a2a/ffffff?text=Frontend+<->+Backend+(FastAPI)+<->+[Ollama+|+NeMo+ASR])
*(Simplified Flow: UI sends text/audio -> Backend processes via NeMo (for audio) or Ollama (for text) -> UI displays result)*

## 🛠️ Tech Stack

* **Frontend:** Electron, HTML5, CSS3, JavaScript
* **Backend:** Python 3.x, FastAPI
* **LLM Integration:** Ollama API
* **ASR/STT:** NVIDIA NeMo Toolkit, Parakeet-TDT Model, pydub
* **Audio Handling:** Web Audio API (Frontend), FFmpeg (Backend dependency via pydub)
* **UI:** Marked (Markdown Parsing), Highlight.js (Syntax Highlighting)
* **Communication:** Local HTTP REST API

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

1.  **[Git](https://git-scm.com/)**: For cloning the repository.
2.  **[Node.js](https://nodejs.org/)**: (LTS version recommended) Includes `npm` for frontend dependencies.
3.  **[Python](https://www.python.org/)**: (Version 3.10 or higher recommended) Includes `pip` for backend dependencies.
4.  **[Ollama](https://ollama.com/)**:
    * Install Ollama for your operating system.
    * Ensure it's running.
    * Pull at least one LLM model: `ollama pull gemma2:latest` (or any other model you prefer).
5.  **[FFmpeg](https://ffmpeg.org/download.html)**:
    * **Required** by the backend for audio format conversion during transcription.
    * Download a static build for your OS (e.g., from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) for Windows).
    * Extract it and **add the `bin` directory** (containing `ffmpeg.exe` on Windows) to your system's **PATH environment variable**.
    * Verify by opening a *new* terminal/CMD and typing `ffmpeg -version`.
6.  **[Hugging Face Account](https://huggingface.co/join)** & **Access Token**:
    * Required to download the NeMo Parakeet ASR model automatically on first run.
    * Create an account on Hugging Face.
    * Generate an Access Token with at least `read` permissions in your [HF Settings](https://huggingface.co/settings/tokens). Copy the token.
7.  **(Recommended)** **NVIDIA GPU & CUDA**: For the NeMo ASR model to perform transcription reasonably fast, an NVIDIA GPU (Volta architecture or newer) with appropriate CUDA drivers installed is highly recommended. Transcription *will* work on CPU but may be very slow.

### Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url> # Replace with your repo URL
    cd aifred # Or your project's root folder name
    ```

2.  **Log in to Hugging Face CLI:**
    * Open your terminal in the project's root directory.
    * Run `huggingface-cli login` and paste your Access Token when prompted.
        ```bash
        huggingface-cli login
        # (Paste your token)
        ```

3.  **Set up Python Backend:**
    * Navigate to the backend directory: `cd python-backend`
    * Create and activate a virtual environment (recommended):
        ```bash
        # Windows
        python -m venv alfred
        alfred\Scripts\activate

        # macOS / Linux
        python3 -m venv alfred
        source alfred/bin/activate
        ```
    * Install Python dependencies (this may take time, especially NeMo):
        ```bash
        pip install -r requirements.txt
        ```
        *(Watch for any errors during installation. You might need specific PyTorch/CUDA versions depending on your GPU setup - install PyTorch separately first if needed)*

4.  **Set up Electron Frontend:**
    * Navigate to the frontend directory: `cd ../electron-ui` (from `python-backend`) or `cd electron-ui` (from root)
    * Install Node.js dependencies:
        ```bash
        npm install
        ```

### Running AIFred

You need two terminals running simultaneously: one for the backend and one for the frontend.

1.  **Start Backend Server:**
    * Open a terminal in the `python-backend` directory.
    * Activate the virtual environment (`alfred\Scripts\activate` or `source alfred/bin/activate`).
    * Run the Uvicorn server:
        ```bash
        uvicorn server:app --reload --host 127.0.0.1 --port 8000
        ```
    * Keep this terminal running. Watch for logs, especially the "Parakeet ASR model loaded successfully" message on first startup after dependencies are installed. (The first time might involve downloading the ~2.5GB ASR model).

2.  **Start Frontend App:**
    * Open a **new** terminal in the `electron-ui` directory.
    * Run the Electron app:
        ```bash
        npm start
        ```

## ⌨️🖱️ How to Use

1.  Ensure **Ollama** is running in the background.
2.  Ensure the **Python Backend Server** (Step 1 above) is running.
3.  The AIFred window should appear (start it via Step 2 above if needed).
4.  **Select Model:** Choose your desired Ollama LLM from the dropdown menu.
5.  **Type Query:** Click the input box, type your question or paste code, and press `Enter` or click `Send`.
6.  **Speak Query:** Click the Microphone icon (🎤). Speak clearly. Click the icon again to stop recording. Your speech will be transcribed and sent directly to the selected Ollama model.
7.  **Toggle Window:** Use `Control+Alt+C` (Windows/Linux) or `Command+Option+C` (macOS - *Note: Hotkey might need adjustment*) to quickly show or hide the AIFred window.

## ⚙️ Configuration

* **Ollama Settings:** You can configure the Ollama API URL and default model used by the backend by editing the `python-backend/config.ini` file.

## ❗ Troubleshooting

* **Connection Refused (Frontend):** Make sure the Python backend server is running *before* starting the frontend app.
* **ASR Model Load Error (Backend Startup):** Check backend logs. Ensure NeMo/PyTorch/dependencies installed correctly. Verify Hugging Face login (`huggingface-cli login`). Ensure sufficient RAM.
* **Transcription Error (Backend):** Ensure **FFmpeg** is installed correctly and added to your system PATH. Check backend logs for details.
* **Slow Transcription:** ASR model performance is heavily dependent on your hardware. Expect slowness on CPU; an NVIDIA GPU is recommended.
* **Highlight.js Errors (Frontend Console):** Syntax highlighting might occasionally fail to load in Electron; this usually doesn't break core functionality.

## 🚀 Next Steps / Future Ideas

* System tray icon for background operation and quick access.
* Ability to capture code/text directly from clipboard or screen selection.
* Settings UI for easier configuration (Ollama URL, default model, hotkeys).
* Support for multimodal Ollama models (sending images). *(Partially implemented?)*
* Packaging for easier distribution (Installers).

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

* Ollama Team
* NVIDIA NeMo Team (for the Parakeet model)
* Electron Team
* FastAPI Team
