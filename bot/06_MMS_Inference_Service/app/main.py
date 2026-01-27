"""
MMS-ASR Inference Service

FastAPI microservice for Meta's Massively Multilingual Speech ASR
Supports Balochi, Sindhi, and Pashto transcription

Endpoints:
  POST /asr - Transcribe audio in specified language
  GET /health - Health check
  GET /languages - List supported languages

December 2025
"""

import os
import io
import time
import tempfile
from typing import Optional
from contextlib import asynccontextmanager

import torch
import librosa
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from transformers import Wav2Vec2ForCTC, AutoProcessor

# Supported MMS language codes
# Maps our language codes to MMS adapter codes
MMS_LANGUAGE_MAP = {
    'bal-PK': 'bcc-script_arabic',  # Southern Balochi (Arabic script)
    'sd-PK': 'snd',                  # Sindhi
    'ps-PK': 'pus',                  # Pashto (Southern)
}

# Model state
model = None
processor = None
current_adapter = None


class TranscriptionResponse(BaseModel):
    text: str
    language: str
    mms_code: str
    latency_ms: float
    success: bool
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    gpu_available: bool
    current_adapter: Optional[str]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup"""
    global model, processor

    print("Loading MMS-ASR model (facebook/mms-1b-all)...")
    print("This may take 2-3 minutes on first run...")

    start = time.time()
    try:
        processor = AutoProcessor.from_pretrained("facebook/mms-1b-all")
        model = Wav2Vec2ForCTC.from_pretrained("facebook/mms-1b-all")

        # Move to GPU if available
        if torch.cuda.is_available():
            model = model.cuda()
            print(f"Model loaded on GPU in {time.time() - start:.1f}s")
        else:
            print(f"Model loaded on CPU in {time.time() - start:.1f}s")
            print("Warning: CPU inference will be slow. Consider using GPU.")
    except Exception as e:
        print(f"Failed to load model: {e}")
        raise

    yield

    # Cleanup on shutdown
    print("Shutting down MMS-ASR service...")


app = FastAPI(
    title="MMS-ASR Inference Service",
    description="Speech-to-text for Pakistani regional languages (Balochi, Sindhi, Pashto)",
    version="1.0.0",
    lifespan=lifespan
)


def load_audio(audio_bytes: bytes, target_sr: int = 16000) -> np.ndarray:
    """Load audio from bytes and resample to 16kHz mono"""
    # Write to temp file (librosa needs file path or file-like object)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name

    try:
        audio, _ = librosa.load(temp_path, sr=target_sr, mono=True)
        return audio
    finally:
        os.unlink(temp_path)


def transcribe(audio_array: np.ndarray, mms_lang_code: str) -> str:
    """Transcribe audio using MMS-ASR with specified language adapter"""
    global model, processor, current_adapter

    # Load language adapter if needed
    if current_adapter != mms_lang_code:
        print(f"Switching adapter: {current_adapter} -> {mms_lang_code}")
        processor.tokenizer.set_target_lang(mms_lang_code)
        model.load_adapter(mms_lang_code)
        current_adapter = mms_lang_code

    # Process audio
    inputs = processor(audio_array, sampling_rate=16000, return_tensors="pt")

    # Move to GPU if model is on GPU
    if next(model.parameters()).is_cuda:
        inputs = {k: v.cuda() for k, v in inputs.items()}

    # Inference
    with torch.no_grad():
        outputs = model(**inputs).logits

    # Decode
    ids = torch.argmax(outputs, dim=-1)[0]
    transcript = processor.decode(ids)

    return transcript


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and model status"""
    return HealthResponse(
        status="ok" if model is not None else "loading",
        model_loaded=model is not None,
        gpu_available=torch.cuda.is_available(),
        current_adapter=current_adapter
    )


@app.get("/languages")
async def list_languages():
    """List supported languages and their MMS codes"""
    return {
        "supported_languages": [
            {"code": "bal-PK", "name": "Balochi", "mms_code": "bcc-script_arabic"},
            {"code": "sd-PK", "name": "Sindhi", "mms_code": "snd"},
            {"code": "ps-PK", "name": "Pashto", "mms_code": "pus"},
        ],
        "note": "Punjabi (pa-PK) uses Soniox, not MMS"
    }


@app.post("/asr", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(..., description="Audio file (WAV, OGG, MP3)"),
    language: str = Form(..., description="Language code: bal-PK, sd-PK, or ps-PK")
):
    """
    Transcribe audio in specified Pakistani regional language

    - **audio**: Audio file (WAV, OGG, or MP3 format, 16kHz mono recommended)
    - **language**: Language code (bal-PK, sd-PK, or ps-PK)

    Returns transcribed text in native script (Arabic/Perso-Arabic)
    """
    start_time = time.time()

    # Validate language
    if language not in MMS_LANGUAGE_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {language}. Supported: {list(MMS_LANGUAGE_MAP.keys())}"
        )

    mms_code = MMS_LANGUAGE_MAP[language]

    # Check model is loaded
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model is still loading. Please try again in a moment."
        )

    try:
        # Read audio file
        audio_bytes = await audio.read()

        # Load and preprocess audio
        audio_array = load_audio(audio_bytes)

        # Transcribe
        transcript = transcribe(audio_array, mms_code)

        latency = (time.time() - start_time) * 1000

        return TranscriptionResponse(
            text=transcript,
            language=language,
            mms_code=mms_code,
            latency_ms=round(latency, 1),
            success=True
        )

    except Exception as e:
        latency = (time.time() - start_time) * 1000
        return TranscriptionResponse(
            text="",
            language=language,
            mms_code=mms_code,
            latency_ms=round(latency, 1),
            success=False,
            error=str(e)
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
