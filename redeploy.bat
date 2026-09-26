@echo off
setlocal enabledelayedexpansion
cd /d "C:\Users\0512y\Desktop\shipaton\8_YKStudio\zenn"
echo [%date% %time%] Zenn redeploy start >> redeploy.log
powershell -NoProfile -Command "$d=git log -1 --format=%%cI; if($d){$days=[math]::Round(((Get-Date)-[datetime]$d).TotalDays,1); Write-Output \"last commit $days days ago\"}" >> redeploy.log 2>&1

REM 2026-09-26 fix: network probe only delays start, never cancels the run.
REM Always proceeds to push even on timeout. The old exit-0-on-timeout path
REM caused a silent multi-day skip and was removed.
powershell -NoProfile -Command "$deadline=(Get-Date).AddMinutes(5); $ok=$false; while((Get-Date) -lt $deadline){try{$c=New-Object System.Net.Sockets.TcpClient; $iar=$c.BeginConnect('github.com',443,$null,$null); if($iar.AsyncWaitHandle.WaitOne(800) -and $c.Connected){$ok=$true; $c.Close(); break}; $c.Close()}catch{}; Start-Sleep -Seconds 15}; if($ok){Write-Output 'network ok'}else{Write-Output 'network probe timed out, proceeding anyway'}" >> redeploy.log 2>&1

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
