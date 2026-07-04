 # ============================================
# AI Chatbot - Backend Dockerfile
# Build: docker build -t chatbot-backend -f Dockerfile .
# ============================================

FROM python:3.12-slim

WORKDIR /app

# 安装系统依赖（pypdf 等可能需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 先装依赖（利用 Docker layer 缓存）
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ .

# 上传目录
RUN mkdir -p /app/uploads/images /app/uploads/pdfs

EXPOSE 8888

# 生产建议用 gunicorn + uvicorn workers
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--workers", "4", "--bind", "0.0.0.0:8888", "--timeout", "120"]
