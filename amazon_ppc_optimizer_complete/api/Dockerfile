FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY .. /app
WORKDIR /app
ENV PORT 8080
CMD ["gunicorn", "api.app:app", "-b", "0.0.0.0:8080", "--workers", "2", "--timeout", "120"]
