@echo off
echo Building backend binaries for all platforms...

rmdir /s /q packages\elysia-api\assets\bin 2>nul
mkdir packages\elysia-api\assets\bin

echo Building WebUI...
pushd packages\webui
call yarn build
if errorlevel 1 (
  popd
  exit /b 1
)
popd

rmdir /s /q backend\webui\dist 2>nul
mkdir backend\webui\dist
xcopy /e /i /y packages\webui\dist\* backend\webui\dist\ >nul
echo WebUI assets synced to backend/webui/dist

cd backend

echo Building Windows amd64...
set GOOS=windows
set GOARCH=amd64
go build -ldflags "-s -w" -o ..\packages\elysia-api\assets\bin\elysia-backend.exe .

echo Building Linux amd64...
set GOOS=linux
set GOARCH=amd64
go build -ldflags "-s -w" -o ..\packages\elysia-api\assets\bin\elysia-backend-linux .

echo Building macOS amd64 (Intel)...
set GOOS=darwin
set GOARCH=amd64
go build -ldflags "-s -w" -o ..\packages\elysia-api\assets\bin\elysia-backend-darwin-amd64 .

echo Building macOS arm64 (Apple Silicon)...
set GOOS=darwin
set GOARCH=arm64
go build -ldflags "-s -w" -o ..\packages\elysia-api\assets\bin\elysia-backend-darwin-arm64 .

cd ..

echo.
echo Done! Binaries copied to packages\elysia-api\assets\bin\
dir packages\elysia-api\assets\bin\
