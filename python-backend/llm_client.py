# llm_client.py
import httpx
import json
import asyncio

# Renamed function and added optional image parameter
async def get_ollama_suggestion(endpoint: str, model: str, prompt: str, base64_image: str | None = None) -> tuple[str | None, str | None]:
    """
    Sends a prompt (and optionally a base64 image) to the Ollama API.

    Args:
        endpoint: The base URL of the Ollama API.
        model: The name of the Ollama model to use.
        prompt: The text prompt.
        base64_image: Optional base64 encoded string of the image.

    Returns:
        A tuple containing (suggestion_text, error_message).
    """
    api_url = f"{endpoint.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    # --- Add image only if provided ---
    if base64_image:
        payload["images"] = [base64_image]
    # ---

    headers = {'Content-Type': 'application/json'}

    print(f"Sending request to {api_url} with model {model}...")
    # Log payload type (text or image)
    log_payload = payload.copy()
    if "images" in log_payload: log_payload["images"] = ["[omitted]"]
    print(f"Payload: {log_payload}")


    try:
        timeout = httpx.Timeout(300.0, connect=60.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(api_url, headers=headers, json=payload)
            response.raise_for_status()
            response_data = response.json()

            if response_data and 'response' in response_data:
                print("Ollama suggestion received.")
                return response_data['response'].strip(), None
            else:
                print(f"Ollama response missing 'response' key: {response_data}")
                return None, f"Unexpected response format from Ollama: {response_data}"
    # ... (error handling remains the same) ...
    except httpx.HTTPStatusError as e:
        error_detail = f"HTTP Error: {e.response.status_code} - {e.response.text}"
        print(error_detail); return None, error_detail
    except httpx.RequestError as e:
        error_detail = f"Connection Error: {e}"; print(error_detail); return None, error_detail
    except json.JSONDecodeError as e:
        error_detail = f"JSON Decode Error: {e}. Response: {response.text[:100]}..."; print(error_detail); return None, error_detail
    except Exception as e:
        import traceback; error_detail = f"Unexpected error: {e}\n{traceback.format_exc()}"; print(error_detail); return None, error_detail