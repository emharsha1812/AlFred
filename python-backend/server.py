# python-backend/server.py

import asyncio
import configparser # Keep commented unless restoring lifespan/load_config
import os
import traceback # Needed for error logging in /api/ask
from contextlib import asynccontextmanager # Keep commented unless restoring lifespan

import uvicorn
from fastapi import FastAPI, HTTPException # HTTPException might be needed
from fastapi.middleware.cors import CORSMiddleware # Needed for CORS
from pydantic import BaseModel # Needed for request/response models

# --- Local Imports ---
try:
    # Ensure llm_client.py is in the same directory
    from llm_client import get_ollama_suggestion
except ImportError:
    print("\nERROR: llm_client.py not found.")
    print("Make sure llm_client.py is in the python-backend directory.\n")
    exit(1)

# --- Configuration Loading ---
# Using placeholder global variables for now, as lifespan/load_config are commented
# TODO: Restore proper config loading later
ollama_url = 'http://localhost:11434'
ollama_model = 'gemma3:4b'
print(f"--- Using hardcoded Ollama URL: {ollama_url} ---")
print(f"--- Using hardcoded Ollama Model: {ollama_model} ---")

# --- Pydantic Models ---
class AskRequest(BaseModel):
    """Request model for the /api/ask endpoint"""
    prompt: str
    # Add other potential fields like image_data later

class AskResponse(BaseModel):
    """Response model for the /api/ask endpoint"""
    suggestion: str | None = None
    error: str | None = None

# --- FastAPI Lifespan --- (Keep commented for now)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Code to run on startup
    print("Starting AIFred Backend Server...")
    # load_config() # Restore this later
    # print(f"Using Ollama endpoint: {ollama_url}")
    # print(f"Using Ollama model: {ollama_model}")
    yield
    # Code to run on shutdown
    print("Shutting down AIFred Backend Server...")

# --- FastAPI App Initialization ---
# app = FastAPI(lifespan=lifespan) # Initialize with lifespan later
app = FastAPI() # Initialize bare minimum app

# --- CORS Middleware ---
# Allow requests from Electron's origin and localhost for testing
origins = [
    "http://localhost",
    "http://localhost:8080",
    "null", # Needed for `file://` origin
    "file://", # Electron's default origin
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
    """Simple endpoint to check if the server is running."""
    print(">>> Handler for /api/status was called!")
    # Use the globally defined variable for now
    return {"status": "AIFred Backend Running (w/ CORS)", "ollama_model": ollama_model}

@app.post("/api/ask", response_model=AskResponse)
async def ask_ollama(request: AskRequest):
    """Receives a prompt and gets a suggestion from Ollama."""
    print(f">>> Handler for /api/ask called. Prompt: '{request.prompt[:50]}...'")
    try:
        # Call the Ollama client function using global vars
        suggestion, error = await get_ollama_suggestion(
            endpoint=ollama_url,
            model=ollama_model,
            prompt=request.prompt,
            # base64_image=None # Add image handling later
        )

        if error:
            print(f"Error from Ollama client: {error}")
            # Return AskResponse with error message
            return AskResponse(error=f"Ollama interaction failed: {error}")
        elif suggestion:
            print("Suggestion received from Ollama.")
            return AskResponse(suggestion=suggestion)
        else:
            # This case might indicate an issue in llm_client.py if it returns (None, None)
            print("Warning: No suggestion or error received from Ollama client function.")
            return AskResponse(error="Received no suggestion or error from Ollama.")

    except Exception as e:
        print(f"An unexpected error occurred in /api/ask handler: {e}")
        traceback.print_exc() # Log the full error for debugging
        # Return AskResponse with error message instead of raising HTTPException
        # This gives more info to the frontend than just "Internal Server Error"
        return AskResponse(error=f"Internal Server Error: {e}")

# --- Main Execution ---
if __name__ == "__main__":
    host = os.getenv("AIFRED_HOST", "127.0.0.1")
    port = int(os.getenv("AIFRED_PORT", 8000))

    print(f"Starting server (w/ /api/ask & CORS) on {host}:{port}")
    uvicorn.run("server:app", host=host, port=port, reload=True)