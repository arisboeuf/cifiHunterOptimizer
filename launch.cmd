@echo off
setlocal
cd /d "%~dp0"
set PYTHONUNBUFFERED=1

REM Prefer real installs over WindowsApps stub (often not on PATH in Cursor terminals).
set "PY="
if exist "%LocalAppData%\Programs\Python\Python313\python.exe" set "PY=%LocalAppData%\Programs\Python\Python313\python.exe"
if not defined PY if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PY=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined PY if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "PY=%LocalAppData%\Programs\Python\Python311\python.exe"
if not defined PY if exist "%LocalAppData%\Programs\Python\Python310\python.exe" set "PY=%LocalAppData%\Programs\Python\Python310\python.exe"
if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY (
  echo Python not found. Install Python or open launch.py in Cursor and Run with the Python extension.
  exit /b 1
)

"%PY%" -u "%~dp0launch.py" %*
