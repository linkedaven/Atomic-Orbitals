@echo off
rem Builds two things from the source (needs a JDK, version 17 or newer, on the PATH):
rem   atomic-orbitals.jar                  double-click on any computer that has Java
rem   dist\AtomicOrbitals-windows.zip      a standalone app with its own Java inside:
rem                                          unzip anywhere, double-click AtomicOrbitals.exe, no Java needed
setlocal enabledelayedexpansion
cd /d "%~dp0"

for %%t in (javac jar jlink jpackage) do (
  where %%t >nul 2>nul
  if errorlevel 1 (
    echo.
    echo "%%t" was not found. Install a JDK, version 17 or newer, from https://adoptium.net
    echo and tick "Add to PATH" in the installer, then run this file again.
    goto :fail
  )
)

echo [1/5] Compiling...
if exist build rmdir /s /q build
mkdir build\classes build\input
rem a list of quoted sources with forward slashes, so folders with spaces work
(for /r "backend\src\main" %%f in (*.java) do (
  set "p=%%f"
  echo "!p:\=/!"
)) > build\sources.txt
javac --release 17 -encoding UTF-8 -d build\classes @build\sources.txt || goto :fail

echo [2/5] Packing the jar (backend + frontend)...
jar --create --file build\input\atomic-orbitals.jar --main-class hydrogen.Main -C build\classes . -C . frontend || goto :fail
copy /y build\input\atomic-orbitals.jar atomic-orbitals.jar >nul

echo [3/5] Making a small Java runtime...
jlink --add-modules java.base,java.desktop,jdk.httpserver --strip-debug --no-header-files --no-man-pages --output build\runtime || goto :fail

echo [4/5] Making the standalone app...
if exist dist rmdir /s /q dist
jpackage --type app-image --name AtomicOrbitals --input build\input --main-jar atomic-orbitals.jar --main-class hydrogen.Main --runtime-image build\runtime --dest dist || goto :fail

echo [5/5] Zipping...
powershell -NoProfile -Command "Compress-Archive -Path 'dist\AtomicOrbitals' -DestinationPath 'dist\AtomicOrbitals-windows.zip' -Force" || goto :fail

rmdir /s /q build
echo.
echo Done.
echo   atomic-orbitals.jar                 (needs Java)
echo   dist\AtomicOrbitals-windows.zip     (no Java needed: unzip, then run AtomicOrbitals.exe)
echo.
pause
exit /b 0

:fail
echo.
echo Build failed. See the messages above.
if exist build rmdir /s /q build
pause
exit /b 1
