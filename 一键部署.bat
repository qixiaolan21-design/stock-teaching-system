@echo off
chcp 65001 >nul
echo ==========================================
echo   股票教学案例管理系统 - 部署工具
echo ==========================================
echo.
echo 正在部署到 Render...
echo.
echo 步骤：
echo 1. 确保代码已推送到 GitHub
echo 2. 打开 Render 控制台
echo 3. 创建新的 Web Service
echo.
echo GitHub 仓库：https://github.com/qixiaolan21-design/stock-teaching-system
echo.
start https://dashboard.render.com/new/web-service
pause
