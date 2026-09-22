@echo off
setlocal
cd /d "%~dp0"

set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not exist "%PY%" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"

if not exist "%PY%" (
  where py >nul 2>&1 && (
    py -3 -c "import customtkinter, yaml, matplotlib, wasmtime" >nul 2>&1
    if errorlevel 1 (
      echo Installiere Abhaengigkeiten...
      py -3 -m pip install -r requirements-borge.txt
    )
    if not exist "%~dp0vendor\cifi_wasm\release.wasm" (
      echo Lade cifi-tools WASM...
      py -3 "%~dp0scripts\fetch_cifi_wasm.py"
    )
    start "" py -3 "%~dp0borge_sim_tool.py" --maximized
    exit /b 0
  )
  echo Python nicht gefunden.
  echo Bitte Python 3.11+ installieren: https://www.python.org/downloads/
  pause
  exit /b 1
)

"%PY%" -c "import customtkinter, yaml, matplotlib, wasmtime" >nul 2>&1
if errorlevel 1 (
  echo Installiere Abhaengigkeiten...
  "%PY%" -m pip install -r "%~dp0requirements-borge.txt"
)

if not exist "%~dp0vendor\cifi_wasm\release.wasm" (
  echo Lade cifi-tools WASM...
  "%PY%" "%~dp0scripts\fetch_cifi_wasm.py"
)

start "" "%PY%" "%~dp0borge_sim_tool.py" --maximized
endlocal
