import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported image format: {ext}")

    filename = f"{uuid.uuid4().hex}{ext}"
    save_dir = os.path.join(settings.UPLOAD_DIR, "images")
    save_path = os.path.join(save_dir, filename)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {
        "filename": filename,
        "url": f"/api/files/images/{filename}",
        "original_name": file.filename,
    }


@router.post("/pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    filename = f"{uuid.uuid4().hex}.pdf"
    save_dir = os.path.join(settings.UPLOAD_DIR, "pdfs")
    save_path = os.path.join(save_dir, filename)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    # Extract text
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(content))
        full_text = ""
        for page in reader.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")

    # Chunk the text
    chunk_size = settings.MAX_PDF_CHUNK_SIZE
    words = full_text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk_text = " ".join(words[i : i + chunk_size])
        chunks.append(chunk_text)

    return {
        "filename": filename,
        "url": f"/api/files/pdfs/{filename}",
        "original_name": file.filename,
        "total_chunks": len(chunks),
        "full_text_preview": full_text[:500],
        "chunks": chunks,
    }
