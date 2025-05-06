# python-backend/server.py

import asyncio
import configparser # Ensure uncommented
import os
import sys
import traceback # Ensure uncommented (needed for /api/models)
import httpx # Ensure uncommented (needed for /api/models)

# Add the directory containing this file to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

# --- Local Imports ---
try: # Ensure uncommented
    from llm_client import get_ollama_suggestion
except ImportError as e:
    print(f"\nERROR: Failed to import llm_client: {e}")
    print(f"Current sys.path: {sys.path}")
    print("Make sure llm_client.py is in the python-backend directory.\n")
    exit(1)
# End uncommented block

import uvicorn
from fastapi import FastAPI, HTTPException # HTTPException needed for potential future use
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel # Ensure uncommented

# --- Configuration Loading ---
ollama_url = None
ollama_model = None

# vvvv THIS ENTIRE FUNCTION DEFINITION MUST BE UNCOMMENTED vvvv
def load_config():
    """Loads Ollama configuration from config.ini"""
    global ollama_url, ollama_model
    config = configparser.ConfigParser()
    config_path = os.path.join(os.path.dirname(__file__), 'config.ini')

    if not os.path.exists(config_path):
        print(f"WARNING: config.ini not found at {config_path}")
        ollama_url = 'http://localhost:11434'
        # Use a known multimodal model if default is image-focused
        ollama_model = 'llava' # Changed example default
        print(f"--- Using default fallback Ollama URL: {ollama_url} ---")
        print(f"--- Using default fallback Ollama Model: {ollama_model} (Ensure this model supports images!) ---")
        return

    try:
        config.read(config_path)
        ollama_url = config.get('Ollama', 'ApiBaseUrl', fallback='http://localhost:11434')
        ollama_model = config.get('Ollama', 'Model', fallback=None)
        print(f"--- Loaded Ollama URL from config: {ollama_url} ---")
        if ollama_model:
             print(f"--- Loaded Default Ollama Model from config: {ollama_model} (Ensure this model supports images if used!) ---")
        else:
             print(f"--- Default Ollama Model not set in config.ini ---")

    except configparser.Error as e:
        print(f"ERROR reading config.ini: {e}")
        ollama_url = 'http://localhost:11434'
        ollama_model = None
        print("--- Using default fallback Ollama URL due to config error ---")
        print("--- Default Ollama Model unset due to config error ---")
# ^^^^ THIS ENTIRE FUNCTION DEFINITION MUST BE UNCOMMENTED ^^^^

load_config() # This call MUST be uncommented and AFTER the definition

# --- Pydantic Models ---
class AskRequest(BaseModel): # Ensure uncommented
    """Request model for the /api/ask endpoint"""
    prompt: str
    model: str | None = None
    image: str | None = None
class AskResponse(BaseModel): # Ensure uncommented
    """Response model for the /api/ask endpoint"""
    suggestion: str | None = None
    error: str | None = None

# --- FastAPI App Initialization ---
app = FastAPI()

# --- CORS Middleware ---
origins = [
    "http://localhost",
    "http://localhost:8080",
    "null",
    "file://",
]
app.add_middleware( # Ensure uncommented
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints ---

@app.get("/api/status") # Ensure uncommented
async def get_status():
    """Simple endpoint to check if the server is running and report default model."""
    print(">>> Handler for /api/status was called!")
    return {"status": "AIFred Backend Running (Fully Restored)", "ollama_model": ollama_model}

@app.get("/api/models") # Ensure uncommented
async def get_models():
    """Gets the list of locally available models from Ollama."""
    if not ollama_url:
         print("--- /api/models returning error: Ollama URL not configured ---")
         return {"models": [], "error": "Ollama URL not configured"}

    ollama_tags_url = f"{ollama_url.rstrip('/')}/api/tags"
    print(f"--- ENTERING /api/models ---")
    print(f"--- Querying Ollama for models at: {ollama_tags_url} ---")
    models = []
    error_message = None
    try:
        timeout = httpx.Timeout(10.0, connect=5.0)
        print("--- Attempting httpx.AsyncClient GET request... ---")
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(ollama_tags_url)
            print(f"--- Received response status from Ollama: {response.status_code} ---")
            response.raise_for_status()
            data = response.json()
            print("--- Ollama response JSON parsed ---")

            if "models" in data and isinstance(data["models"], list):
                models = sorted([m.get("name") for m in data["models"] if m.get("name")])
                print(f"--- Found models: {models} ---")
            else:
               error_message = "Unexpected response format from Ollama /api/tags"
               print(f"Warning: {error_message}. Response data: {data}")

    except httpx.TimeoutException as e:
         error_message = f"Timeout connecting to Ollama at {ollama_tags_url} after {timeout.read_timeout}s. Is Ollama responsive?"
         print(f"ERROR in /api/models: {error_message}")
    except httpx.HTTPStatusError as e:
        error_detail = f"{str(e.response.text)[:150]}"
        error_message = f"Ollama API error ({e.response.status_code}): {error_detail}"
        print(f"ERROR in /api/models: {error_message}")
    except httpx.RequestError as e:
        error_message = f"Cannot connect to Ollama at {ollama_url}. Is it running? ({type(e).__name__})"
        print(f"ERROR in /api/models: {error_message}")
    except Exception as e:
        error_message = f"An unexpected error occurred while fetching models: {e}"
        print(f"ERROR in /api/models: {error_message}")
        if traceback:
            traceback.print_exc()

    print(f"--- EXITING /api/models. Returning: models={models}, error={error_message} ---")
    return {"models": models, "error": error_message}


@app.post("/api/ask", response_model=AskResponse) # Ensure uncommented
async def ask_ollama(request: AskRequest):
    """Receives a prompt and optional image, gets a suggestion from Ollama."""
    image_presence = "Yes" if request.image else "No"
    print(f">>> Handler for /api/ask called. Prompt: '{request.prompt[:50]}...', Model: {request.model or 'Default'}, Image Attached: {image_presence}")
    try:
        model_to_use = request.model if request.model else ollama_model
        if not model_to_use:
             print("ERROR: No model specified in request and no default model configured.")
             return AskResponse(error="Model not selected or configured.")
        if not ollama_url:
             print("ERROR: Ollama URL is not configured.")
             return AskResponse(error="Ollama URL not configured.")

        print(f"--- Using model: {model_to_use} ---")
        if request.image:
            print(f"--- NOTE: Sending image data. Ensure model '{model_to_use}' supports multimodal input. ---")

        suggestion, error = await get_ollama_suggestion(
            endpoint=ollama_url,
            model=model_to_use,
            prompt=request.prompt,
            base64_image=request.image
        )
        if error:
            print(f"Error reported from Ollama client: {error}")
            return AskResponse(error=f"Ollama interaction failed: {error}")
        elif suggestion:
            print("Suggestion received successfully from Ollama.")
            return AskResponse(suggestion=suggestion)
        else:
            print("Warning: No suggestion or error received from llm_client function.")
            return AskResponse(error="Received no response content from Ollama client.")
    except Exception as e:
        print(f"An unexpected error occurred in /api/ask handler: {e}")
        if traceback: # Use traceback if imported
             traceback.print_exc()
        return AskResponse(error=f"Internal Server Error: {e}")

# --- Main Execution ---
if __name__ == "__main__":
    host = os.getenv("AIFRED_HOST", "127.0.0.1")
    port = int(os.getenv("AIFRED_PORT", 8000))
    print(f"Starting AIFred Backend Server (FULLY RESTORED) on http://{host}:{port}")
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=True,
        reload_dirs=[os.path.dirname(__file__)]
     )