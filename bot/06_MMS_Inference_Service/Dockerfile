# MMS-ASR Inference Service
# Uses facebook/mms-1b-all for Pakistani regional language transcription

FROM python:3.11-slim

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Pre-download model at build time (optional, makes startup faster)
# Uncomment to include model in image (~4GB larger image, faster startup)
# RUN python -c "from transformers import Wav2Vec2ForCTC, AutoProcessor; AutoProcessor.from_pretrained('facebook/mms-1b-all'); Wav2Vec2ForCTC.from_pretrained('facebook/mms-1b-all')"

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the service
CMD ["python", "-m", "app.main"]
