import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "AI Chatbot"
    DATABASE_URL: str = "sqlite:///./chatbot.db"
    SECRET_KEY: str = "your-secret-key-change-in-production-abc123xyz"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    DASHSCOPE_API_KEY: str = ""
    MAX_PDF_CHUNK_SIZE: int = 500
    MAX_PDF_CHUNKS_RETRIEVED: int = 3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

os.makedirs(os.path.join(settings.UPLOAD_DIR, "images"), exist_ok=True)
os.makedirs(os.path.join(settings.UPLOAD_DIR, "pdfs"), exist_ok=True)
