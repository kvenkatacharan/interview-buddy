# Interview Buddy

A desktop app for practicing coding interviews with an AI interviewer, and for finding out what keeps going wrong.

1. **Pick a setup.** Language, difficulty, topic and length.
2. **Do the interview.** The interviewer (Claude) presents a problem and responds like a real one. It answers clarifying questions, pushes back on shaky approaches, gives graduated hints only when you ask, and asks you to test your code and state its complexity when you submit. It sees your editor each time you send a message.
3. **Get a debrief.** You're scored 1–4 on problem understanding, approach, correctness, code quality, complexity analysis, testing and communication, with evidence from the transcript. You also get concrete issues with how to fix them, what to practice next, and a reference solution.
4. **Track weak spots.** Issues are tagged from a fixed list and tallied across sessions on the home screen. With "Target my weak spots" on, the next interviewer picks a problem that tests them.

## Running it

```bash
npm install
npm run electron:dev     # dev mode with hot reload
npm run dist:mac         # build a .dmg
```

On first launch, open **Settings** and paste an Anthropic API key. It's encrypted with the system keychain (Electron `safeStorage`) and kept in the app's user-data folder. If no key is saved, the app falls back to `ANTHROPIC_API_KEY` from the environment.

Sessions are stored in `sessions.json` in the same folder (`~/Library/Application Support/interview-buddy` on macOS).

## Layout

- `electron/interviewer.js`: interviewer prompt, turn handling and the debrief (structured JSON output)
- `electron/taxonomy.js`: score dimensions, issue tags and weak-spot aggregation (shared with the UI)
- `electron/store.js`: API key and session persistence
- `src/screens/`: Home, Interview, Report, Settings
