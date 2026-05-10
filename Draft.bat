@echo off
title Draft Game Launcher
color 0E

echo.
echo ============================================
echo         DRAFT GAME - Iniciando...
echo ============================================
echo.

echo [1/2] Iniciando Backend API...
start "Draft Backend" cmd /k "cd /d C:\Projetos\Draft\backend_api && npm run start:dev"

echo Aguardando 5 segundos para o backend iniciar...
timeout /t 5 /nobreak > nul

echo [2/2] Iniciando Game Client...
start "Draft Client" cmd /k "cd /d C:\Projetos\Draft\game-client && npm run dev"

echo Aguardando 8 segundos para o Vite iniciar...
timeout /t 8 /nobreak > nul

echo Abrindo navegador...
start chrome "http://localhost:5173"

echo.
echo ============================================
echo  Pronto! Jogo iniciado.
echo ============================================
echo.
timeout /t 5 /nobreak > nul
exit
