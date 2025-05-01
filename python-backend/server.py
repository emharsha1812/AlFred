# python-backend/server.py

import asyncio
import configparser
import os
import sys # Needed for sys.path modification
import traceback # Needed for detailed error logging
import httpx # Needed for calling Ollama /api/tags

# Add the directory containing this file (server.py) to the Python path
# This ensures Python can find sibling modules like llm_client.py
# when run via uvicorn server:app
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

# --- Local Imports ---
try:
    # Ensure llm_client.py is in the same directory (should work now)
    from llm_client import get_ollama_suggestion
except ImportError as e: # Catch the specific error
    print(f"\nERROR: Failed to import llm_client: {e}")
    print(f"Current sys.path: {sys.path}") # Print path for debugging if it still fails
    print("Make sure llm_client.py is in the python-backend directory.\n")
    exit(1)

import uvicorn
from fastapi import FastAPI, HTTPException # HTTPException might be needed later
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Configuration Loading ---
ollama_url = None
ollama_model = None

def load_config():
    """Loads Ollama configuration from config.ini"""
    global ollama_url, ollama_model
    config = configparser.ConfigParser()
    # Construct path relative to this file (server.py)
    config_path = os.path.join(os.path.dirname(__file__), 'config.ini')

    if not os.path.exists(config_path):
        print(f"WARNING: config.ini not found at {config_path}")
        # Set reasonable defaults if config is missing
        ollama_url = 'http://localhost:11434'
        ollama_model = 'gemma3:4b' # Example default, user might not have this
        print(f"--- Using default fallback Ollama URL: {ollama_url} ---")
        print(f"--- Using default fallback Ollama Model: {ollama_model} ---")
        return

    try:
        config.read(config_path)
        # Provide fallbacks in get() for resilience
        ollama_url = config.get('Ollama', 'ApiBaseUrl', fallback='http://localhost:11434')
        ollama_model = config.get('Ollama', 'Model', fallback=None) # Fallback to None if not set
        print(f"--- Loaded Ollama URL from config: {ollama_url} ---")
        if ollama_model:
             print(f"--- Loaded Default Ollama Model from config: {ollama_model} ---")
        else:
             print(f"--- Default Ollama Model not set in config.ini ---")

    except configparser.Error as e:
        print(f"ERROR reading config.ini: {e}")
        # Fallback to defaults on error
        ollama_url = 'http://localhost:11434'
        ollama_model = None # No default model if config is broken
        print("--- Using default fallback Ollama URL due to config error ---")
        print("--- Default Ollama Model unset due to config error ---")

# --- Load config immediately when the module is loaded ---
load_config()

# --- Pydantic Models ---
class AskRequest(BaseModel):
    """Request model for the /api/ask endpoint"""
    prompt: str
    model: str | None = None # Optional: frontend can specify model to use

class AskResponse(BaseModel):
    """Response model for the /api/ask endpoint"""
    suggestion: str | None = None
    error: str | None = None

# --- FastAPI App Initialization ---
app = FastAPI()

# --- CORS Middleware ---
# Allow requests from Electron's origin and localhost for testing
origins = [
    "http://localhost",
    "http://localhost:8080", # Common dev server port
    "null", # Needed for `file://` origin in some cases
    "file://", # Electron's default origin when loading local files
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # List of allowed origins
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)

# --- API Endpoints ---

@app.get("/api/status")
async def get_status():
    """Simple endpoint to check if the server is running and report default model."""
    print(">>> Handler for /api/status was called!")
    # Use the globally loaded default model name
    return {"status": "AIFred Backend Running", "ollama_model": ollama_model}

@app.get("/api/models")
async def get_models():
    """Gets the list of locally available models from Ollama."""
    if not ollama_url:
         return {"models": [], "error": "Ollama URL not configured"}

    ollama_tags_url = f"{ollama_url.rstrip('/')}/api/tags"
    print(f"--- Querying Ollama for models at: {ollama_tags_url} ---")
    models = []
    error_message = None
    try:
        timeout = httpx.Timeout(10.0, connect=5.0) # Timeout for model listing
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(ollama_tags_url)
            response.raise_for_status() # Raise exception for bad status codes (4xx or 5xx)
            data = response.json()

            # Extract model names safely
            if "models" in data and isinstance(data["models"], list):
                # Sort the model names alphabetically
                models = sorted([m.get("name") for m in data["models"] if m.get("name")])
                print(f"--- Found models: {models} ---")
            else:
               error_message = "Unexpected response format from Ollama /api/tags"
               print(f"Warning: {error_message}. Response: {data}")

    except httpx.HTTPStatusError as e:
        # Provide clearer error messages from Ollama if possible
        error_detail = f"{str(e.response.text)[:150]}" # Limit length
        error_message = f"Ollama API error ({e.response.status_code}): {error_detail}"
        print(f"Error contacting Ollama /api/tags: {error_message}")
    except httpx.RequestError as e:
        error_message = f"Cannot connect to Ollama at {ollama_url}. Is it running? ({type(e).__name__})"
        print(f"Error contacting Ollama /api/tags: {error_message}")
    except Exception as e:
        error_message = f"An unexpected error occurred while fetching models: {e}"
        print(f"Error contacting Ollama /api/tags: {error_message}")
        traceback.print_exc() # Log full traceback for unexpected errors

    # Return a consistent dictionary structure
    return {"models": models, "error": error_message}


@app.post("/api/ask", response_model=AskResponse)
async def ask_ollama(request: AskRequest):
    """Receives a prompt and gets a suggestion from Ollama using specified/default model."""
    print(f">>> Handler for /api/ask called. Prompt: '{request.prompt[:50]}...', Requested Model: {request.model or 'Default'}")
    try:
        # Determine which model to use: model from request OR fallback to default from config
        model_to_use = request.model if request.model else ollama_model

        # Check if we actually have a model selected/configured
        if not model_to_use:
             print("ERROR: No model specified in request and no default model configured.")
             return AskResponse(error="Model not selected or configured.")
        if not ollama_url:
             print("ERROR: Ollama URL is not configured.")
             return AskResponse(error="Ollama URL not configured.")

        print(f"--- Using model: {model_to_use} ---")

        # Call the Ollama client function (ensure it's imported correctly)
        suggestion, error = await get_ollama_suggestion(
            endpoint=ollama_url,
            model=model_to_use, # Pass the determined model
            prompt=request.prompt,
            # base64_image=None # Add image handling later if needed
        )

        # Process the response from the client function
        if error:
            print(f"Error reported from Ollama client: {error}")
            # Return error in the standard response format
            return AskResponse(error=f"Ollama interaction failed: {error}")
        elif suggestion:
            print("Suggestion received successfully from Ollama.")
            return AskResponse(suggestion=suggestion)
        else:
            # This case might occur if llm_client returns (None, None) unexpectedly
            print("Warning: No suggestion or error received from llm_client function.")
            return AskResponse(error="Received no response content from Ollama client.")

    except Exception as e:
        # Catch any other unexpected errors during request handling
        print(f"An unexpected error occurred in /api/ask handler: {e}")
        traceback.print_exc() # Log the full traceback for debugging
        # Return a generic server error message
        return AskResponse(error=f"Internal Server Error: {e}")

# --- Main Execution ---
if __name__ == "__main__":
    # Use environment variables or defaults for host/port
    host = os.getenv("AIFRED_HOST", "127.0.0.1")
    port = int(os.getenv("AIFRED_PORT", 8000))

    print(f"Starting AIFred Backend Server on http://{host}:{port}")
    # Run Uvicorn programmatically
    uvicorn.run(
        "server:app", # app object is in server.py
        host=host,
        port=port,
        reload=True, # Enable auto-reload for development
        reload_dirs=[os.path.dirname(__file__)] # Watch current directory for changes
     )