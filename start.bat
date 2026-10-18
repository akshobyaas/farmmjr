@echo off
REM Starts both the Django backend and the React frontend dev servers,
REM each in its own window, so you can see each one's own logs.
cd /d "%~dp0"

start "Smart Farming - Backend" cmd /k "cd backend && call venv\Scripts\activate.bat && python manage.py runserver"
start "Smart Farming - Frontend" cmd /k "cd frontend && npm run dev"

echo Backend and frontend are starting in two new windows.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
