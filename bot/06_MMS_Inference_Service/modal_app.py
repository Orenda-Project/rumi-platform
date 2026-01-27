"""
MMS-ASR on Modal.com - Serverless GPU Inference

Deploy: modal deploy modal_app.py
Test: modal run modal_app.py

Cost: ~$0.0005/second (T4 GPU), scales to zero when idle

Security: Requires API key in X-API-Key header for /asr endpoint

IMPORTANT: Uses threading lock to prevent adapter conflicts when
multiple concurrent requests use different languages. The MMS model
can only have one language adapter loaded at a time.
"""

import modal
import os
import threading

# Create Modal app with secret for API key authentication
app = modal.App(
    "mms-asr-service",
    secrets=[modal.Secret.from_name("mms-api-key")]
)

# Define the container image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "transformers==4.37.2",
        "torch==2.1.2",
        "torchaudio==2.1.2",
        "librosa==0.10.1",
        "soundfile==0.12.1",
        "numpy==1.26.3",
        "fastapi==0.109.0",
        "python-multipart==0.0.6",  # Required for file uploads
    )
)

# MMS language mapping
MMS_LANGUAGE_MAP = {
    'bal-PK': 'bcc-script_arabic',  # Southern Balochi (Arabic script)
    'sd-PK': 'snd',                  # Sindhi
    'ps-PK': 'pus',                  # Pashto (Southern)
}


@app.cls(
    image=image,
    gpu="T4",  # Use T4 GPU (~$0.000463/sec)
    scaledown_window=300,  # Keep warm for 5 minutes
)
@modal.concurrent(max_inputs=10)  # Handle multiple concurrent requests
class MMSTranscriber:
    """MMS-ASR transcription service with GPU acceleration"""

    @modal.enter()
    def load_model(self):
        """Load model when container starts"""
        import torch
        from transformers import Wav2Vec2ForCTC, AutoProcessor

        print("Loading MMS-ASR model (facebook/mms-1b-all)...")
        self.processor = AutoProcessor.from_pretrained("facebook/mms-1b-all")
        self.model = Wav2Vec2ForCTC.from_pretrained("facebook/mms-1b-all")

        if torch.cuda.is_available():
            self.model = self.model.cuda()
            print(f"Model loaded on GPU: {torch.cuda.get_device_name()}")
        else:
            print("Model loaded on CPU (slower)")

        self.current_adapter = None

        # Threading lock to prevent adapter conflicts during concurrent requests
        # The MMS model can only have one language adapter loaded at a time
        self._inference_lock = threading.Lock()
        print("Inference lock initialized for thread-safe adapter switching")

    @modal.method()
    def transcribe(self, audio_bytes: bytes, language: str) -> dict:
        """
        Transcribe audio in specified language

        Args:
            audio_bytes: Raw audio file bytes (WAV, OGG, MP3)
            language: Language code (bal-PK, sd-PK, ps-PK)

        Returns:
            dict with text, language, latency_ms, success, error
        """
        import time
        import tempfile
        import os
        import torch
        import librosa

        start_time = time.time()

        # Validate language
        if language not in MMS_LANGUAGE_MAP:
            return {
                "text": "",
                "language": language,
                "mms_code": None,
                "latency_ms": (time.time() - start_time) * 1000,
                "success": False,
                "error": f"Unsupported language: {language}. Supported: {list(MMS_LANGUAGE_MAP.keys())}"
            }

        mms_code = MMS_LANGUAGE_MAP[language]

        try:
            # ===== PARALLEL I/O SECTION (outside lock) =====
            # Write audio to temp file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                f.write(audio_bytes)
                temp_path = f.name

            # Load and resample audio to 16kHz (CPU-bound, can run in parallel)
            audio, _ = librosa.load(temp_path, sr=16000, mono=True)
            os.unlink(temp_path)

            # ===== SERIALIZED MODEL SECTION (inside lock) =====
            # Lock prevents adapter conflicts when multiple languages are processed
            with self._inference_lock:
                # Load language adapter if needed
                if self.current_adapter != mms_code:
                    print(f"Switching adapter: {self.current_adapter} -> {mms_code}")
                    self.processor.tokenizer.set_target_lang(mms_code)
                    self.model.load_adapter(mms_code)
                    self.current_adapter = mms_code

                # Process audio
                inputs = self.processor(audio, sampling_rate=16000, return_tensors="pt")

                # Move to GPU if available
                if next(self.model.parameters()).is_cuda:
                    inputs = {k: v.cuda() for k, v in inputs.items()}

                # Inference
                with torch.no_grad():
                    outputs = self.model(**inputs).logits

                # Decode
                ids = torch.argmax(outputs, dim=-1)[0]
                transcript = self.processor.decode(ids)

            # ===== END LOCKED SECTION =====

            latency_ms = (time.time() - start_time) * 1000

            return {
                "text": transcript,
                "language": language,
                "mms_code": mms_code,
                "latency_ms": round(latency_ms, 1),
                "success": True,
                "error": None
            }

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            return {
                "text": "",
                "language": language,
                "mms_code": mms_code,
                "latency_ms": round(latency_ms, 1),
                "success": False,
                "error": str(e)
            }


# FastAPI web endpoint
@app.function(image=image, secrets=[modal.Secret.from_name("mms-api-key")])
@modal.asgi_app()
def web_app():
    """FastAPI web server for HTTP access"""
    from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Header
    from fastapi.responses import JSONResponse

    # Get API key from Modal secret
    API_KEY = os.environ.get("MMS_API_KEY")

    api = FastAPI(
        title="MMS-ASR Service (Modal)",
        description="Speech-to-text for Pakistani regional languages",
        version="1.0.0"
    )

    transcriber = MMSTranscriber()

    def verify_api_key(x_api_key: str = Header(None)):
        """Verify API key from request header"""
        if not API_KEY:
            # No API key configured - allow all (for testing)
            return True
        if x_api_key != API_KEY:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
        return True

    @api.get("/health")
    async def health():
        return {
            "status": "ok",
            "model_loaded": True,
            "gpu_available": True,
            "platform": "modal.com",
            "auth_enabled": bool(API_KEY)
        }

    @api.get("/languages")
    async def languages():
        return {
            "supported_languages": [
                {"code": "bal-PK", "name": "Balochi", "mms_code": "bcc-script_arabic"},
                {"code": "sd-PK", "name": "Sindhi", "mms_code": "snd"},
                {"code": "ps-PK", "name": "Pashto", "mms_code": "pus"},
            ]
        }

    @api.post("/asr")
    async def transcribe_audio(
        audio: UploadFile = File(...),
        language: str = Form(...),
        x_api_key: str = Header(None)
    ):
        # Verify API key
        verify_api_key(x_api_key)

        audio_bytes = await audio.read()
        result = transcriber.transcribe.remote(audio_bytes, language)
        return result

    return api


# CLI test function
@app.local_entrypoint()
def main():
    """Test the service locally"""
    import sys

    print("MMS-ASR Service (Modal.com)")
    print("=" * 40)
    print("Deploy: modal deploy modal_app.py")
    print("Test:   modal run modal_app.py")
    print()
    print("Supported languages:")
    for code, mms in MMS_LANGUAGE_MAP.items():
        print(f"  - {code}: {mms}")
