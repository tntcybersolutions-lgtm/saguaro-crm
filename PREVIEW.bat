@echo off
echo.
echo  ============================================
echo   SAGUARO CRM - LOCAL PREVIEW LAUNCHER
echo  ============================================
echo.

echo  Opening marketing website...
start "" "C:\Users\ChadDerocher\Downloads\saguaro-website-v2.html"
timeout /t 1 /nobreak >nul

echo  Opening AI Takeoff Demo...
start "" "%~dp0saguaro-takeoff-demo.html"
timeout /t 1 /nobreak >nul

echo  Opening CRM Preview (screens and portals)...
start "" "%~dp0saguaro-preview.html"
timeout /t 1 /nobreak >nul

echo.
echo  3 browser tabs opened:
echo    1. Marketing website  (saguaro-website-v2.html)
echo    2. AI Takeoff Demo    (saguaro-takeoff-demo.html)
echo    3. CRM Screen Preview (saguaro-preview.html)
echo.
echo  Press any key to also start the full Next.js dev server...
echo  (Requires .env.local to be configured with Supabase keys)
echo.
pause

echo  Starting Next.js development server on http://localhost:3000...
npm run dev
