# DeepSeek Research Bot - Features

## ✅ Implemented Features

### 1. **Query Set Management (Options Page)**
- Create multiple named query sets (e.g., "Technical Dive", "Market Research")
- Add, edit, and delete individual questions within each set
- Delete entire query sets
- **Drag-and-drop reordering**: Reorder both sets and questions within sets
- Light/Dark theme toggle
- Auto-save to Chrome sync storage

### 2. **Sidepanel Interface**
- **Query Set Selector**: Dropdown menu to choose which set to use
- **Live Preview**: See all questions in the selected set before running
- **Theme Sync**: Theme automatically syncs between Options and Sidepanel
- Auto-adjusts max iterations based on selected set size
- Clean dark/light mode with smooth transitions

### 3. **Smart Deep Research Loop**
- Uses the selected query set's questions as iteration prompts
- Progress tracking with visual progress bar
- Real-time activity logging
- Session statistics (messages sent, iterations completed)

## 🎨 Theme System

**Default**: Dark mode
**Toggle**: 🌓 button in sidepanel, checkbox in options
**Sync**: Changes in one place reflect everywhere instantly

## 📂 File Structure

```
chrome_extension_deepseek/
├── src/                    # Source files
│   ├── sidepanel.html      # Sidepanel UI with theme & query selector
│   ├── sidepanel.js        # Controller with theme sync & query loading
│   ├── options.html        # Query set manager with drag-drop
│   ├── options.js          # Set management logic
│   ├── content.js          # DeepSeek page interaction
│   └── background.js       # Service worker
├── dist/                   # Built extension (load this in Chrome)
├── icons/                  # Extension icons
├── manifest.json           # Extension manifest
└── build.sh               # Build script
```

## 🚀 How to Use

### Setup
1. Run `bash build.sh --clean` to build
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" → select `dist/` folder

### Creating Query Sets
1. Click extension icon → "Options"
2. Create new sets or edit existing ones
3. Drag to reorder sets or questions
4. Click "Save All Sets"

### Running Research
1. Open `chat.deepseek.com`
2. Open extension sidepanel
3. Choose a Query Set from the dropdown
4. Enter your initial question
5. Adjust iterations and delay
6. Click "Start Deep Research"

## 🎯 Storage Keys

- `nextQuerySets`: Object mapping set names to question arrays
  ```json
  {
    "Technical Dive": ["Question 1", "Question 2"],
    "Market Research": ["Question A", "Question B"]
  }
  ```
- `theme`: `"dark"` (default) or `"light"`

## 🔄 Build & Deploy

```bash
# Clean build
bash build.sh --clean

# Build + create zip for Chrome Web Store
bash build.sh --clean --zip
```

---

**Version**: 1.0.0  
**Built**: 2026-06-03  
**Total Size**: ~60KB
