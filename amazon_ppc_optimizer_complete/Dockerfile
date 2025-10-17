FROM python:3.11-slim
WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
	build-essential \
 && rm -rf /var/lib/apt/lists/*

# Install python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app

ENV PORT 8080
EXPOSE 8080

# Run the Flask app via Gunicorn
CMD ["gunicorn", "api.app:app", "-b", "0.0.0.0:8080", "--workers", "2", "--timeout", "120"]
