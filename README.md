# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


---

## Interview Buddy — Development & Build

```bash
# Run in development mode
npm run electron:dev

# Build macOS .dmg and .app (output in dist/)
npm run dist:mac
```

### Features & Toolbar Controls

1. **Zero-Click 1-Shot Workflow (`Cmd + Shift + C / I / B`)**:
   - Captures the screen (`< 3 MB` lossless PNG), pastes it into the chat input, inserts the selected prompt (`c` Coding, `i` Technical, `b` Behavioral STAR), waits for the attachment to finish uploading, and automatically sends the message—without touching the mouse.
   - Use **`Cmd + Shift + Up` / `Cmd + Shift + Down`** to scroll the AI response up or down hands-free while keeping focus in your IDE.
2. **Copy-to-Ask Clipboard Listener (`Cmd + Shift + L` or Clipboard button)**:
   - When toggled ON, copying any text (`Cmd + C` on a question or problem description) automatically combines it with your active prompt preset (`c`, `i`, or `b`), inserts it into the chat, and auto-sends.
3. **Teleprompter Eye-Line Mode (`Cmd + Shift + T` or Monitor button)**:
   - Resizes the widget to `540×300` and centers it at the top of the screen directly below the MacBook webcam while hiding sidebar clutter for natural eye-level reading. Toggling OFF restores your previous window size.
4. **Click-Through Ghost Mode (`Cmd + Shift + \` or Ghost button)**:
   - Lets mouse clicks pass directly through Interview Buddy into the IDE or browser underneath while keeping the window visible on screen. Press **`Cmd + Shift + \`** again to interact with the widget.
5. **Toolbar Button Order (Left → Right)**:
   - Navigation (`‹`, `›`, `↻`) → Address Bar → Transparency Slider → **Screenshot Camera** → **Copy-to-Ask** → **Teleprompter** → **Ghost Mode** → Prompt Presets (**`c`**, **`i`**, **`b`**).

### Keyboard Shortcuts
- `Cmd + \`: Hide / Unhide window
- `Cmd + Shift + C`: **1-Shot Coding** (Screenshot + Paste + Coding Prompt + Auto-Send)
- `Cmd + Shift + I`: **1-Shot Technical** (Screenshot + Paste + Technical Prompt + Auto-Send)
- `Cmd + Shift + B`: **1-Shot Behavioral** (Screenshot + Paste + STAR Behavioral Prompt + Auto-Send)
- `Cmd + Shift + Up` / `Cmd + Shift + Down`: Scroll AI response up / down hands-free
- `Cmd + Shift + L`: Toggle **Copy-to-Ask Clipboard Listener** (any `Cmd + C` text auto-sends with active preset)
- `Cmd + Shift + T`: Toggle **Teleprompter Eye-Line Mode** (compact top-center under webcam)
- `Cmd + Shift + \`: Toggle **Click-Through Ghost Mode** (mouse clicks pass through to IDE underneath)
- `Cmd + Option + [` / `Cmd + Option + ]`: Decrease / Increase window opacity by 10%
- `Cmd + Option + Right`: Snap Left / Right
- `Cmd + Option + Down`: Snap Top / Bottom
- `Cmd + R` / `Cmd + Shift + R`: Reload browser view

## Delete / Uninstall Existing Interview Buddy Apps

Run these commands in Terminal to stop any running instances and remove installed `.app` and `.dmg` builds:

```bash
# 1. Stop any running instance of Interview Buddy
killall "Interview Buddy" 2>/dev/null

# 2. Eject any mounted DMG volume
hdiutil detach "/Volumes/Interview Buddy 0.0.0-arm64" 2>/dev/null

# 3. Remove installed app from Applications folders
rm -rf "/Applications/Interview Buddy.app"
rm -rf "$HOME/Applications/Interview Buddy.app"

# 4. Remove old built .app / .dmg inside the project's dist folder
rm -rf dist/mac-arm64 dist/*.dmg dist/*.zip dist/*.blockmap
```

*(Optional)* Clear saved app data / cache / login sessions:
```bash
rm -rf "$HOME/Library/Application Support/interview-buddy"
```
