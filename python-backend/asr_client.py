import nemo.collections.asr as nemo_asr
# import soundfile as sf # No longer needed for reading initial file
import numpy as np
import io
import os
import tempfile
import asyncio
import logging
from pydub import AudioSegment # <-- Import pydub
# import torch # Uncomment if explicitly using torch features like checking cuda

logger = logging.getLogger(__name__)
TARGET_SAMPLE_RATE = 16000
_asr_model = None # Global variable to hold the loaded model

# --- load_asr_model function remains the same ---
async def load_asr_model():
    """Loads the Parakeet ASR model into the global variable _asr_model."""
    global _asr_model
    if _asr_model is None:
        try:
            logger.info("Loading Parakeet ASR model (nvidia/parakeet-tdt-0.6b-v2)...")
            _asr_model = nemo_asr.models.ASRModel.from_pretrained(
                model_name="nvidia/parakeet-tdt-0.6b-v2"
            )
            _asr_model.eval()
            logger.info("Parakeet ASR model loaded successfully.")
        except ImportError:
             logger.error("NeMo or its dependencies not found. Cannot load ASR model.")
             _asr_model = None
        except Exception as e:
            logger.error(f"Failed to load ASR model: {e}", exc_info=True)
            _asr_model = None
    else:
         logger.info("ASR model already loaded.")
# --- End load_asr_model ---


# --- NEW transcribe_audio_data using pydub ---
async def transcribe_audio_data(audio_data: bytes) -> str:
    """
    Transcribes raw audio bytes using the loaded Parakeet model.
    Uses pydub (requires ffmpeg) to handle initial format conversion,
    then converts to 16kHz mono WAV for NeMo.

    Args:
        audio_data: Raw bytes of the audio file (e.g., webm/opus from browser).

    Returns:
        The transcribed text string.

    Raises:
        RuntimeError: If the ASR model is not loaded or ffmpeg is missing.
        Exception: If any error occurs during audio processing or transcription.
    """
    if _asr_model is None:
        logger.error("ASR model is not loaded. Cannot transcribe.")
        raise RuntimeError("ASR model not available. Please ensure it loaded correctly on startup.")

    temp_wav_path = None
    try:
        # --- Step 1: Load audio bytes using pydub ---
        # Use io.BytesIO to treat the bytes like a file
        audio_io = io.BytesIO(audio_data)
        try:
             # Let pydub detect format (needs ffmpeg for webm/opus)
            audio_segment = AudioSegment.from_file(audio_io)
            logger.debug(f"pydub loaded audio: SR={audio_segment.frame_rate}, Channels={audio_segment.channels}, Duration={audio_segment.duration_seconds:.2f}s")
        except Exception as e: # Catch pydub specific errors (e.g., ffmpeg not found)
             logger.error(f"pydub failed to load audio from bytes. Is ffmpeg installed and in PATH? Error: {e}", exc_info=True)
             if "ffmpeg" in str(e).lower() or "Couldn't find execution environment" in str(e):
                 raise RuntimeError("ffmpeg not found or not configured correctly. Cannot process audio.") from e
             else:
                 raise ValueError(f"Failed to process audio data with pydub: {e}") from e


        # --- Step 2: Convert to 16kHz Mono using pydub ---
        audio_segment = audio_segment.set_channels(1) # Convert to mono
        audio_segment = audio_segment.set_frame_rate(TARGET_SAMPLE_RATE) # Resample to 16kHz
        logger.debug(f"pydub converted to: SR={audio_segment.frame_rate}, Channels={audio_segment.channels}")

        # --- Step 3: Export processed audio to a temporary WAV file ---
        # Create a temporary file path for the WAV output
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            temp_wav_path = tmp_wav.name

        # Export the pydub segment to the WAV file path
        # Use export method which returns the file handle, ensure it's closed
        exported_file = audio_segment.export(temp_wav_path, format="wav")
        exported_file.close() # Explicitly close the handle returned by export
        logger.debug(f"Processed audio exported to temp WAV file: {temp_wav_path}")


        # --- Step 4: Transcribe using the WAV file path (Run in thread pool) ---
        logger.info(f"Starting NeMo transcription for {temp_wav_path}...")
        transcription_result = await asyncio.to_thread(
             _asr_model.transcribe, [temp_wav_path], batch_size=1
        )
        logger.info("NeMo transcription finished.")

        # --- Step 5: Extract text ---
        if transcription_result and isinstance(transcription_result, (list, tuple)) and len(transcription_result) > 0:
            first_result = transcription_result[0]
            text = first_result if isinstance(first_result, str) else getattr(first_result, 'text', str(first_result))
            logger.debug(f"Raw transcription result: '{text[:100]}...'")
            return text.strip() if text else ""
        else:
             logger.warning(f"Transcription result was empty or invalid: {transcription_result}")
             return ""

    except Exception as e:
        # Catch any other unexpected errors during the process
        logger.error(f"Error during audio processing/transcription: {e}", exc_info=True)
        raise Exception(f"Transcription failed: {e}") from e

    finally:
        # --- Step 6: Clean up the temporary WAV file ---
        if temp_wav_path and os.path.exists(temp_wav_path):
            try:
                os.remove(temp_wav_path)
                logger.debug(f"Cleaned up temporary WAV file: {temp_wav_path}")
            except OSError as e:
                logger.error(f"Error deleting temporary WAV file {temp_wav_path}: {e}")