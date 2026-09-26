@echo off
setlocal enabledelayedexpansion
cd /d "C:\Users\0512y\Desktop\shipaton\8_YKStudio\zenn"
echo [%date% %time%] Zenn redeploy start >> redeploy.log

powershell -NoProfile -Command "$deadline=(Get-Date).AddMinutes(20); $ok=$false; while((Get-Date) -lt $deadline){try{$c=New-Object System.Net.Sockets.TcpClient; $iar=$c.BeginConnect('github.com',443,$null,$null); if($iar.AsyncWaitHandle.WaitOne(800) -and $c.Connected){$ok=$true; $c.Close(); break}; $c.Close()}catch{}; Start-Sleep -Seconds 15}; if(-not $ok){exit 1}"
if errorlevel 1 (
  echo [%date% %time%] Zenn redeploy skipped: no network after 20min wait >> redeploy.log
  endlocal
  exit /b 0
)

git commit --allow-empty -m "Zenn redeploy trigger (auto, waiting on Zenn post rate limit to clear)" >> redeploy.log 2>&1

set PUSH_OK=0
for /l %%i in (1,1,3) do (
  if "!PUSH_OK!"=="0" (
    git push >> redeploy.log 2>&1
    if !errorlevel! == 0 (
      set PUSH_OK=1
    ) else (
      echo [%date% %time%] push attempt %%i failed, retrying in 30s >> redeploy.log
      timeout /t 30 /nobreak >nul
    )
  )
)

echo [%date% %time%] Zenn redeploy done (push ok=!PUSH_OK!) >> redeploy.log
endlocal
