const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const apiRouter = require('./routes/api');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);

const server = express();
server.use(express.json());
server.use('/api', apiRouter);

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
