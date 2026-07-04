import json
import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, ChatSession, Message
from schemas import MessageResponse, ChatRequest
from auth import get_current_user
import requests
from config import settings

router = APIRouter(prefix="/api", tags=["chat"])


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
def get_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.timestamp.asc())
        .all()
    )
    return [MessageResponse.model_validate(m) for m in messages]


@router.post("/chat/{session_id}")
async def chat_stream(
    session_id: int,
    data: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_msg = Message(
        session_id=session_id,
        role="user",
        content=data.message or "",
        content_type="image" if data.image_base64 else "text",
        metadata_json={"image_base64": data.image_base64, "image_filename": data.image_filename} if data.image_base64 else None,
    )
    db.add(user_msg)
    db.commit()

    history = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.timestamp.asc())
        .all()
    )

    llm_messages = _build_llm_messages(history, data)

    if session.title == "新对话" and data.message:
        session.title = data.message[:50] + ("..." if len(data.message) > 50 else "")
        db.commit()

    # 定义has_image，供generate闭包使用
    has_image = bool(data.image_base64)

    async def generate():
        full_response = ""
        try:
            # Use OpenAI-compatible endpoint for qwen3.7-plus support
            headers = {
                "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
                "Content-Type": "application/json"
            }
            # 用户选择的模型优先，否则自动选择
            # 确保模型名是字符串
            model_raw = data.model
            if isinstance(model_raw, str):
                model_name = model_raw
            else:
                model_name = "qwen-vl-plus" if has_image else "qwen3.7-plus"
            
            payload = {
                "model": model_name,
                "messages": llm_messages,
                "stream": True,
                "max_tokens": 1024,
                "temperature": 0.3,
            }

            resp = requests.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                proxies={"http": None, "https": None},
                headers=headers,
                json=payload,
                stream=True,
                timeout=60,
            )

            # If first model fails with 404, try fallback models
            if resp.status_code == 404 and has_image:
                fallbacks = [m for m in ["qwen-vl-plus", "qwen-vl-max", "qwen3.7-plus"] if m != model_name]
                for fb in fallbacks:
                    # silently try next model
                    model_name = fb
                    payload["model"] = model_name
                    # If falling back to text-only model, remove image content from messages
                    if isinstance(model_name, str) and not any(v in model_name for v in ["vl-"]):
                        text_msgs = []
                        for m in llm_messages:
                            if isinstance(m.get("content"), list):
                                text_parts = [p for p in m["content"] if p.get("type") == "text"]
                                text_msgs.append({"role": m["role"], "content": text_parts[0]["text"] if text_parts else ""})
                            else:
                                text_msgs.append(m)
                        payload["messages"] = text_msgs
                    resp.close()
                    resp = requests.post(
                        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                        proxies={"http": None, "https": None},
                        headers=headers,
                        json=payload,
                        stream=True,
                        timeout=60,
                    )
                    if resp.status_code == 200:
                        break

            for line in resp.iter_lines():
                if line:
                    line = line.decode("utf-8")
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content_delta = delta.get("content", "")
                                if content_delta:
                                    full_response += content_delta
                                    payload = json.dumps({"type": "delta", "content": content_delta}, ensure_ascii=False)
                                    yield f"data: {payload}\n\n"
                        except json.JSONDecodeError:
                            pass

            yield f"data: {json.dumps({'type': 'done', 'content': full_response}, ensure_ascii=False)}\n\n"

            if full_response.strip():
                assistant_msg = Message(
                    session_id=session_id,
                    role="assistant",
                    content=full_response,
                    content_type="text",
                )
                db.add(assistant_msg)
                db.commit()

        except Exception as e:
            error_msg = f"抱歉，AI 响应出错了: {str(e)}"
            yield f"data: {json.dumps({'type': 'error', 'content': error_msg}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _build_llm_messages(history: list[Message], data: ChatRequest) -> list[dict]:
    system_prompt = {
        "role": "system",
        "content": "你是一个简洁高效的AI助手。直接回答用户问题，避免冗长开场白和多余解释，回答务必精炼直击要点。用中文回复，除非用户用其他语言提问。数学公式用LaTeX：行内$...$，块级$$...$$。"
    }

    messages = [system_prompt]
    has_image = bool(data.image_base64)

    prev_msgs = history[:-1] if len(history) > 0 else []

    for msg in prev_msgs:
        if msg.metadata_json and msg.metadata_json.get("image_base64"):
            img_b64 = msg.metadata_json["image_base64"]
            messages.append({
                "role": msg.role,
                "content": [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                            {"type": "text", "text": msg.content or "请分析这张图片"}],
            })
        else:
            messages.append({
                "role": msg.role,
                "content": msg.content or " ",
            })

    if has_image:
        messages.append({
            "role": "user",
            "content": [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{data.image_base64}"}},
                        {"type": "text", "text": data.message or "请分析这张图片"}],
        })
    else:
        messages.append({
            "role": "user",
            "content": data.message or " ",
        })

    return messages

