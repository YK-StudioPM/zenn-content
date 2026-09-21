@echo off
setlocal
cd /d "C:\Users\0512y\Desktop\shipaton\8_YKStudio\zenn"
echo [%date% %time%] Zenn redeploy start >> redeploy.log
git commit --allow-empty -m "Zenn redeploy trigger (auto, waiting on Zenn post rate limit to clear)" >> redeploy.log 2>&1
git push >> redeploy.log 2>&1
echo [%date% %time%] Zenn redeploy done (exit %errorlevel%) >> redeploy.log
endlocal
