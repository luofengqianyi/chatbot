import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import settings
from database import init_db

from routers.auth_routes import router as auth_router
from routers.session_routes import router as session_router
from routers.upload_routes import router as upload_router
from routers.chat_routes import router as chat_router

app = FastAPI(title=settings.APP_NAME)

# FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

# 获取当前文件所在目录 (backend)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 项目根目录 (chatbot)
PROJECT_ROOT = os.path.dirname(BASE_DIR)
# FRONTEND_DIR: Docker uses env var, local dev uses PROJECT_ROOT
FRONTEND_DIR = os.getenv("FRONTEND_DIR", os.path.join(PROJECT_ROOT, "frontend"))

# CORS (still useful for CDN assets)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers first
app.include_router(auth_router)
app.include_router(session_router)
app.include_router(upload_router)
app.include_router(chat_router)

# Serve frontend at root
@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# Mount frontend static assets
css_dir = os.path.join(FRONTEND_DIR, "css")
js_dir = os.path.join(FRONTEND_DIR, "js")
if os.path.exists(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")
if os.path.exists(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")

# Mount uploads
uploads_path = settings.UPLOAD_DIR
if os.path.exists(uploads_path):
    app.mount("/api/files", StaticFiles(directory=uploads_path), name="uploads")


@app.on_event("startup")
def on_startup():
    init_db()
    print(f"Frontend dir: {FRONTEND_DIR}")
    print(f"Upload dir: {uploads_path}")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8888)
# FRONTEND_DIR: Docker uses env var, local dev uses PROJECT_ROOT
FRONTEND_DIR = os.getenv("FRONTEND_DIR", os.path.join(PROJECT_ROOT, "frontend"))
