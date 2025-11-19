# Screenshot Tool with Free-form Selection

A powerful desktop screenshot application built with Electron, featuring free-form lasso selection and Vision Agent integration.

## Features

- **Free-form Selection**: Create custom-shaped selections using a lasso tool
- **High DPI Support**: Full support for high DPI displays and proper scaling
- **Vision Agent Integration**: Built-in image analysis capabilities (preview)
- **Global Hotkey**: Quick access with `Ctrl+Shift+A` (Windows) or `Cmd+Shift+A` (macOS)
- **Modern UI**: Soft UI design with smooth animations and visual feedback

## Requirements

- Node.js >= 16.0.0
- npm >= 8.0.0

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

## Development

Start the application in development mode:

```bash
npm start
```

For debugging:

```bash
npm start -- --debug
```

## Usage

1. Press `Ctrl+Shift+A` (Windows) or `Cmd+Shift+A` (macOS) to start capturing
2. Draw a free-form selection using the lasso tool
3. Release the mouse button to complete the selection
4. View the analysis results in the Vision Agent dialog
5. Press `Esc` to cancel the capture at any time

## Project Structure

- `main.js`: Electron main process, handles window management and IPC
- `preload.js`: Preload script for secure IPC communication
- `renderer.js`: UI logic and screenshot capture implementation
- `index.html`: Main application window
- `style.css`: Application styling
- `temp/`: Temporary storage for captured screenshots

## Features in Detail

### Lasso Selection Tool

- Smooth drawing with point interpolation
- Real-time preview with size display
- Multi-layer visual feedback
- Automatic path closing

### Vision Agent Integration

- Image size and format detection
- Content analysis preview
- Customizable result display
- Async processing support

### Screenshot Processing

- Automatic temp directory management
- Base64 image encoding/decoding
- Proper cleanup of media streams
- Error handling and recovery

## Technical Details

### Display Handling

- Native resolution detection
- DPI scaling compensation
- Multi-monitor support
- Transparent window management

### Security Features

- Context isolation enabled
- Node integration disabled
- Secure IPC communication
- Sandboxed renderer process

## Error Handling

The application includes comprehensive error handling for:

- Window creation failures
- Screenshot capture errors
- File system operations
- Global shortcut registration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[MIT License](LICENSE)

## Acknowledgments

- Electron team for the excellent framework
- Community contributors and testers
