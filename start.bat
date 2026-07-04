@echo off
chcp 65001 >nul

echo ===============================
echo   AI Chatbot - Backend Server
echo ===============================
echo.

cd /d D:\xiangmu\chatbot\backend

echo [1/3] Installing dependencies...
pip install -r requirements.txt -q

echo [2/3] Cleaning up port 8888...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8888"') do (
    if not "%%a"=="" (
        taskkill /PID %%a /F >nul 2>nul
    )
)
timeout /t 1 /nobreak >nul

echo [3/3] Starting server...
echo.
echo   Open in browser: http://localhost:8888
echo.
echo   Press Ctrl+C to stop.
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8888

pause
