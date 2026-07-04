from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


# --- Auth Schemas ---
class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Session Schemas ---
class SessionCreate(BaseModel):
    title: str = "新对话"


class SessionResponse(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Message Schemas ---
class MessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    content_type: str
    timestamp: datetime

    class Config:
        from_attributes = True


# --- Chat Schemas ---
class ChatRequest(BaseModel):
    message: str = ""
    image_base64: Optional[str] = None
    image_filename: Optional[str] = None
    model: Optional[str] = None
