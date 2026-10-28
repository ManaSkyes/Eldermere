@echo off
rem Starts a small local web server for Eldermere and opens the game and the dungeon creator.
rem The game uses JavaScript modules, which browsers will not load from file:// (double-clicking index.html).
rem The server (tools\serve.py) tells the browser not to cache, so a refresh always gets the latest files.
rem Keep this window open while you play; close it to stop the server.
cd /d "%~dp0"
set PORT=8000
start "" "http://localhost:%PORT%/index.html"
start "" "http://localhost:%PORT%/dungeon-editor.html"
where py >nul 2>nul && (py tools\serve.py %PORT% & goto :eof)
where python >nul 2>nul && (python tools\serve.py %PORT% & goto :eof)
where npx >nul 2>nul && (npx --yes http-server -p %PORT% -c-1 & goto :eof)
echo Could not find Python or Node.js. Install Python from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), then run this again.
pause
