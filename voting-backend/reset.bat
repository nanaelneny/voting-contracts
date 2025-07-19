@echo off
echo 🔴 Killing existing processes...
taskkill /IM node.exe /F >nul 2>&1

echo 🌐 Starting Hardhat node...
start cmd /k "cd blockchain && npx hardhat node --hostname 0.0.0.0"

timeout /t 5

echo 🚀 Deploying contracts...
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
cd ..

echo 🖥 Starting backend server...
start cmd /k "cd backend && set HOST=0.0.0.0 && npm run dev"

echo 🌐 Starting frontend app...
start cmd /k "cd frontend && set HOST=0.0.0.0 && npm start"
