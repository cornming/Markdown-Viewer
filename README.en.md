# Markdown Viewer

[繁體中文](README.md)

A Chrome extension (Manifest V3) that renders and edits Markdown files directly in your browser — drag-and-drop local `.md` files for instant preview, or open a dedicated editor tab.

![Markdown Viewer preview (partial screenshot)](docs/screenshot.jpg)

## Features

- **Drag & drop** `.md`, `.markdown`, `.txt` files for instant preview
- **Split view** — editor + preview side by side, with draggable resizer
- **Three view modes** — split, editor-only, preview-only
- **Live rendering** powered by marked.js (GitHub Flavored Markdown)
- **XSS protection** via DOMPurify
- **Mermaid diagram** support
- **Dark / Light theme** toggle with automatic preference memory
- **Auto-save drafts** to Chrome storage
- **Save / Save As** — overwrite original or download as new `.md` file
- **Fullscreen mode**
- **Open local files** via file picker
- **Image loading** (requires folder access permission)

## Installation

### Manual Installation (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/cornming/Markdown-Viewer.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the cloned project folder

### Important: Enable File Access

To use the drag-and-drop feature with local files (`file://` URLs):

1. Go to `chrome://extensions/`
2. Find **Markdown Viewer** and click **Details**
3. Enable **Allow access to file URLs**

## Usage

### Option 1: Drag & Drop

Drag any local `.md` file into Chrome. The extension automatically intercepts `file://*.md` URLs and renders the Markdown with the full editor UI.

### Option 2: Extension Popup

Click the Markdown Viewer extension icon in the toolbar to open a dedicated editor/preview tab.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + O` | Open file |
| `Ctrl + S` | Save (overwrite) |
| `Ctrl + Shift + S` | Save as new file |
| `F` | Toggle fullscreen |
| `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` | While hovering a Mermaid diagram: zoom in / out / reset to 100% |

## Tech Stack

- Chrome Extension Manifest V3
- [marked.js](https://github.com/markedjs/marked) — Markdown parsing (GFM)
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSS sanitization
- [mermaid.js](https://github.com/mermaid-js/mermaid) — Diagram rendering
- Vanilla JavaScript / CSS (no frameworks)

## License

No license has been specified yet.
