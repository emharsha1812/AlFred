# python-backend/server.py

import asyncio
import configparser
import os
import sys
import traceback
import httpx
import logging # <-- Added for logging

# Add the directory containing this file to the Python path
# (Ensures local imports work correctly)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

# --- Local Imports ---
try:
    # Existing LLM client for Ollama interaction
    from llm_client import get_ollama_suggestion
    # --- NEW ASR Import ---
    import asr_client # Import the new ASR client module
    # --- End NEW ASR Import ---
except ImportError as e:
    # Use logger if available, otherwise print
    init_logger = logging.getLogger(__name__)
    init_logger.critical(f"Failed to import local modules: {e}", exc_info=True)
    print(f"\nCRITICAL ERROR: Failed to import local modules: {e}")
    print(f"Current sys.path: {sys.path}")
    print("Make sure llm_client.py and asr_client.py are in the python-backend directory.")
    print("Check dependencies, especially NeMo toolkit for asr_client.\n")
    exit(1) # Exit if core components can't be imported

import uvicorn
# --- Imports for FastAPI, Models, CORS, and new Endpoint ---
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# --- End Imports ---

# --- Basic Logging Setup ---
# Configure logging level and format (adjust level to DEBUG for more detail)
logging.basicConfig(
    level=logging.INFO, # Use INFO for production, DEBUG for development
    format='%(asctime)s - %(name)s - [%(levelname)s] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout) # Log to console
        # Optionally add: logging.FileHandler('aifred_backend.log') # Log to a file
    ]
)
# Get the root logger for the application
logger = logging.getLogger(__name__)
# --- End Logging Setup ---


# --- Configuration Loading ---
ollama_url: str | None = None
ollama_model: str | None = None

def load_config():
    """Loads Ollama configuration from config.ini"""
    global ollama_url, ollama_model
    config = configparser.ConfigParser()
    # Determine config path relative to this file
    config_path = os.path.join(os.path.dirname(__file__), 'config.ini')

    if not os.path.exists(config_path):
        logger.warning(f"Config file 'config.ini' not found at {config_path}. Using default fallbacks.")
        ollama_url = 'http://localhost:11434'
        # Default to a known general model if none specified, ensure it exists in user's Ollama
        ollama_model = 'gemma2:latest' # Consider a more common default maybe?
        logger.info(f"--- Using default Ollama URL: {ollama_url} ---")
        logger.info(f"--- Using default Ollama Model: {ollama_model} (Ensure this model is available!) ---")
        return

    try:
        config.read(config_path)
        ollama_section = config['Ollama'] if 'Ollama' in config else {}
        ollama_url = ollama_section.get('ApiBaseUrl', 'http://localhost:11434')
        ollama_model = ollama_section.get('Model', None) # Default to None if not set
        logger.info(f"--- Loaded Ollama URL from config: {ollama_url} ---")
        if ollama_model:
             logger.info(f"--- Loaded Default Ollama Model from config: {ollama_model} ---")
        else:
             logger.info(f"--- Default Ollama Model not set in config.ini (will require selection in UI) ---")

    except configparser.Error as e:
        logger.error(f"Error reading config.ini: {e}", exc_info=True)
        # Fallback safely even if config read fails partially
        ollama_url = ollama_url or 'http://localhost:11434' # Keep potentially loaded value or use default
        ollama_model = None # Reset model on config error
        logger.warning("--- Using default fallback Ollama URL due to config error ---")
        logger.warning("--- Default Ollama Model unset due to config error ---")
    except KeyError:
         logger.error("Config file found, but missing 'Ollama' section or keys ('ApiBaseUrl', 'Model'). Using defaults.")
         ollama_url = ollama_url or 'http://localhost:11434'
         ollama_model = None


# --- Pydantic Models ---
# Model for Ollama interaction request
class AskRequest(BaseModel):
    prompt: str
    model: str | None = None  # Allow frontend to override default model
    image: str | None = None  # Base64 encoded image string

# Model for Ollama interaction response
class AskResponse(BaseModel):
    suggestion: str | None = None
    error: str | None = None

# --- NEW Pydantic Model for Transcription Response ---
class TranscriptionResponse(BaseModel):
    """Response model for the /api/transcribe endpoint"""
    text: str | None = None   # The transcribed text
    error: str | None = None  # Error message if transcription failed

# --- FastAPI App Initialization ---
# Add title and version for documentation purposes
app = FastAPI(
    title="AIFred Backend API",
    version="0.2.0",
    description="Provides LLM suggestions via Ollama and Speech-to-Text transcription.",
)

# --- CORS Middleware ---
# Allow requests from the Electron frontend origin (file://, null) and localhost dev server
origins = [
    "http://localhost",         # Allow general localhost
    "http://localhost:8080",    # Common dev port if using a separate frontend server
    "null",                     # Origin for file:// URLs in some browsers/Electron versions
    "file://",                  # Explicitly allow file protocol (Electron)
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,         # List of allowed origins
    allow_credentials=True,        # Allow cookies if needed in the future
    allow_methods=["*"],           # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],           # Allow all headers
)

# --- Server Startup Event ---
@app.on_event("startup")
async def startup_event():
    """Tasks to run when the server starts."""
    logger.info("Backend server starting up...")
    load_config() # Load Ollama config first
    # Attempt to load the ASR model after config is loaded
    try:
        await asr_client.load_asr_model() # Load the ASR model from asr_client
    except Exception as e:
        # Log critical error if model fails to load but allow server to start
        # The transcription endpoint will then fail gracefully if model is unavailable
        logger.critical(f"ASR MODEL FAILED TO LOAD ON STARTUP: {e}", exc_info=True)
    logger.info("Backend server startup complete.")
# --- End Server Startup Event ---


# --- API Endpoints ---

@app.get("/api/status", tags=["Status"])
async def get_status():
    """Checks if the server is running and returns the default Ollama model."""
    logger.info("GET /api/status called")
    # Check if the ASR model loaded successfully
    asr_status = "Loaded" if asr_client._asr_model is not None else "Failed/Not Loaded"
    return {
        "status": "AIFred Backend Running",
        "default_ollama_model": ollama_model,
        "asr_model_status": asr_status
    }

@app.get("/api/models", tags=["Ollama"])
async def get_models():
    """Gets the list of locally available models from Ollama."""
    if not ollama_url:
         logger.error("GET /api/models: Ollama URL not configured.")
         # Use HTTPException for clear error reporting to client
         raise HTTPException(status_code=503, detail="Ollama URL not configured in backend.")

    ollama_tags_url = f"{ollama_url.rstrip('/')}/api/tags"
    logger.info(f"GET /api/models - Querying Ollama models at: {ollama_tags_url}")
    models = []
    error_message = None
    try:
        # Increased timeout slightly for potentially slow Ollama responses
        timeout = httpx.Timeout(15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(ollama_tags_url)
            logger.debug(f"Ollama /api/tags response status: {response.status_code}")
            response.raise_for_status() # Raise exception for non-2xx status codes
            data = response.json()

            if "models" in data and isinstance(data["models"], list):
                # Filter out potentially null names and sort
                models = sorted([m.get("name") for m in data["models"] if m.get("name")])
                logger.info(f"Found {len(models)} models from Ollama.")
            else:
               error_message = "Unexpected response format from Ollama /api/tags"
               logger.warning(f"{error_message}. Response data: {data}")
               # Report this as an internal server error, as backend can't parse Ollama response
               raise HTTPException(status_code=502, detail=error_message) # 502 Bad Gateway

    except httpx.TimeoutException:
         error_message = f"Timeout connecting to Ollama model list at {ollama_tags_url}"
         logger.error(error_message, exc_info=True)
         raise HTTPException(status_code=504, detail=error_message) # 504 Gateway Timeout
    except httpx.HTTPStatusError as e:
        error_message = f"Ollama API error ({e.response.status_code}): {str(e.response.text)[:200]}"
        logger.error(f"Error getting models from Ollama: {error_message}", exc_info=True)
        # Forward Ollama's error status code if possible, otherwise use 502
        raise HTTPException(status_code=e.response.status_code or 502, detail=error_message)
    except httpx.RequestError as e:
        error_message = f"Cannot connect to Ollama at {ollama_url}. Is it running?"
        logger.error(error_message, exc_info=True)
        raise HTTPException(status_code=503, detail=error_message) # 503 Service Unavailable
    except Exception as e:
        error_message = f"An unexpected error occurred while fetching models: {e}"
        logger.error(error_message, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error fetching models.")

    logger.info(f"GET /api/models - Returning {len(models)} models.")
    # Return directly on success, errors are raised as HTTPErrors
    return {"models": models, "error": None} # Explicitly return None for error on success


@app.post("/api/ask", response_model=AskResponse, tags=["Ollama"])
async def ask_ollama(request: AskRequest):
    """Receives a prompt (and optional image), sends it to Ollama, returns suggestion."""
    image_presence = "Yes" if request.image else "No"
    logger.info(f"POST /api/ask - Prompt: '{request.prompt[:50]}...', Model: {request.model or 'Default'}, Image: {image_presence}")

    # Validate required configurations
    if not ollama_url:
        logger.error("ASK ERROR: Ollama URL is not configured.")
        raise HTTPException(status_code=503, detail="Ollama URL not configured in backend.")
    model_to_use = request.model or ollama_model # Use request model > default model
    if not model_to_use:
        logger.error("ASK ERROR: No model specified in request and no default configured.")
        raise HTTPException(status_code=400, detail="Ollama model not specified or configured.")

    logger.info(f"--- Using model '{model_to_use}' for Ollama request ---")
    if request.image:
        logger.info(f"--- Sending image data to model '{model_to_use}'. Ensure it supports multimodal input. ---")

    try:
        # Call the llm_client function to interact with Ollama
        suggestion, error = await get_ollama_suggestion(
            endpoint=ollama_url,
            model=model_to_use,
            prompt=request.prompt,
            base64_image=request.image
        )

        # Handle response from llm_client
        if error:
            logger.error(f"Error from Ollama client: {error}")
            # Determine appropriate status code based on error type if possible
            if "connect" in error.lower():
                 raise HTTPException(status_code=503, detail=f"Ollama connection failed: {error}")
            else:
                 raise HTTPException(status_code=502, detail=f"Ollama interaction failed: {error}") # 502 Bad Gateway
        elif suggestion is not None:
            logger.info("Suggestion received successfully from Ollama.")
            return AskResponse(suggestion=suggestion)
        else:
            # This case should ideally not happen if llm_client returns either suggestion or error
            logger.warning("llm_client returned neither suggestion nor error.")
            raise HTTPException(status_code=500, detail="Received no response content from Ollama client.")

    except Exception as e:
        # Catch-all for unexpected errors during the request handling
        logger.error(f"An unexpected error occurred in /api/ask handler: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")


# --- NEW Transcription Endpoint ---
@app.post("/api/transcribe", response_model=TranscriptionResponse, tags=["Transcription"])
async def handle_transcription(audio_file: UploadFile = File(..., description="Audio file to be transcribed")):
    """
    Receives an audio file, transcribes it using the configured ASR model (Parakeet),
    and returns the transcribed text. Expects formats like WAV, FLAC, MP3, WebM, Ogg etc.
    (Conversion to 16kHz mono WAV is handled internally).
    """
    logger.info(f"POST /api/transcribe - Received file: {audio_file.filename}, Content-Type: {audio_file.content_type}, Size: {audio_file.size}")

    if not audio_file.size or audio_file.size == 0:
        logger.warning("Transcription attempt with empty file.")
        raise HTTPException(status_code=400, detail="Received empty audio file.")

    # Check if ASR model is loaded before proceeding
    if asr_client._asr_model is None:
         logger.error("Transcription request failed: ASR model not loaded.")
         raise HTTPException(status_code=503, detail="ASR model is not available. Server might be starting or encountered loading error.")

    try:
        # Read audio data from the uploaded file in chunks to handle potentially large files
        # Although for STT, files shouldn't be excessively large. Reading all at once is often fine.
        audio_bytes = await audio_file.read()
        logger.debug(f"Read {len(audio_bytes)} bytes from uploaded audio file.")

        # Call the transcription function from the ASR client module
        # This handles conversion, temporary file creation, NeMo call, and cleanup
        transcribed_text = await asr_client.transcribe_audio_data(audio_bytes)

        logger.info(f"Transcription successful: '{transcribed_text[:70]}...'")
        # Return the successful transcription
        return TranscriptionResponse(text=transcribed_text)

    except ValueError as e: # Catch errors from audio processing/conversion
        logger.error(f"Transcription Error: Invalid audio data or format. {e}", exc_info=True)
        # 400 Bad Request for issues likely caused by the uploaded file
        raise HTTPException(status_code=400, detail=f"Invalid audio data or format: {e}")
    except RuntimeError as e: # Catch errors like model not loaded from ASR client
         logger.error(f"Transcription Error: ASR Service runtime issue. {e}", exc_info=True)
         # 503 Service Unavailable indicates backend issue
         raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        # Catch-all for other unexpected errors during transcription process
        logger.error(f"Unexpected error during transcription: {e}", exc_info=True)
        # 500 Internal Server Error for unknown backend problems
        raise HTTPException(status_code=500, detail="Internal server error during transcription.")
    finally:
        # Ensure the UploadFile resource is closed
        await audio_file.close()
# --- End NEW Transcription Endpoint ---


# --- Main Execution ---
if __name__ == "__main__":
    # Load host and port from environment variables or use defaults
    host = os.getenv("AIFRED_HOST", "127.0.0.1")
    port = int(os.getenv("AIFRED_PORT", 8000))

    logger.info(f"Starting AIFred Backend Server on http://{host}:{port}")
    logger.info("Using Uvicorn with reload enabled.")

    # Run the FastAPI app using Uvicorn
    uvicorn.run(
        "server:app",                      # App location: 'filename:app_instance_name'
        host=host,                         # Host to bind to
        port=port,                         # Port to listen on
        reload=True,                       # Enable auto-reload on code changes
        reload_dirs=[os.path.dirname(__file__)], # Watch the directory containing this file
        log_config=None,                   # Disable Uvicorn's default logging to use ours
        # Consider adding workers > 1 in production if needed, but be mindful of ASR model loading/GPU memory
        # workers=int(os.getenv("AIFRED_WORKERS", 1))
     )