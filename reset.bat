@echo off
echo 🛠 Resetting Online Voting System (Windows)...

REM 🛡 Allow firewall ports
echo ✅ Allowing firewall ports (3000, 5000, 8545)...
netsh advfirewall firewall add rule name="Voting App Ports" dir=in action=allow protocol=TCP localport=3000,5000,8545 >nul 2>&1

REM 🛑 Stop any running processes on those ports
echo 🚫 Killing processes on ports 3000, 5000, and 8545...
for %%p in (3000 5000 8545) do (
    for /f "tokens=5" %%t in ('netstat -ano ^| findstr :%%p') do (
        taskkill /PID %%t /F >nul 2>&1
    )
)

REM 🗑 Clean Hardhat artifacts
echo 🗑 Cleaning blockchain artifacts...
cd voting-backend
del /Q build >nul 2>&1
del /Q cache >nul 2>&1
cd ..

REM 🔥 Restart Hardhat node
echo 🚀 Starting Hardhat blockchain...
start cmd /k "cd voting-backend && npx hardhat node --hostname 0.0.0.0"

REM ⏳ Wait for Hardhat to start
timeout /t 5 >nul

REM 📦 Deploy contracts
echo 🚀 Deploying smart contracts...
cd voting-backend
npx hardhat run scripts/deploy.js --network localhost
cd ..

REM 🖥 Start backend server
echo 🌐 Starting backend API server...
start cmd /k "cd voting-backend && npm run dev"

REM 💻 Start frontend server
echo 🌐 Starting frontend...
start cmd /k "cd voting-frontend && HOST=0.0.0.0 npm start"

echo ✅ Voting System reset and running!
pause
