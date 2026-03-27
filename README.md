# Run'n Gun 4 Players

`Run'n Gun 4 Players` is a browser-based turn-based tactical board game prototype built with plain JavaScript, HTML, and CSS.

This version extends the original 2-player project into a 4-player format with:

- `Blue` moving left to right
- `Red` moving bottom to top
- `Yellow` moving right to left
- `Green` moving top to bottom

The game supports human players, multiple AI policies, hidden identities, powers, resurrection, scoring, tutorial flow, sound, and UI-driven play directly in the browser.

## Current Features

- 4-player board and turn system
- Hidden-information gameplay
- 5 unique soldier IDs per team
- Placement phase, main phase, and game over phase
- Powers for IDs `2`, `3`, `4`, and `5`
- Resurrection and scoring system
- Human, `main4`, `greedy`, `random`, and `none` player assignment
- Tutorial and rules screens
- AI vs AI, human vs AI, all-human, and mixed setups
- Sound effects and looping background music

## Project Structure

- [index.html](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/index.html)  
  Redirects to the UI entry point.

- [game.js](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/game.js)  
  Main engine. This is the game source of truth.

- [ui/index.html](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/ui/index.html)  
  Main browser UI shell.

- [ui/main.js](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/ui/main.js)  
  UI state, input handling, menus, tutorial flow, audio, and overlay logic.

- [ui/renderer.js](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/ui/renderer.js)  
  Canvas rendering for board, soldiers, panels, effects, and previews.

- [ui/style.css](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/ui/style.css)  
  UI styling.

- [test.js](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/test.js)  
  Lightweight simulation/test engine used for isolated experiments.

- `music/`  
  Background music and sound effects.

- `pics/`  
  Tutorial art, icon, and UI image assets.

## How To Run

Use a local web server. This avoids browser `file://` issues with audio and asset loading.

### Option 1: Python

```powershell
cd "E:\lets code\grid game\Run n Gun 4 players"
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

### Option 2: VS Code Live Server

If you use the Live Server extension, open the `Run n Gun 4 players` folder and launch the site from [index.html](E:/lets%20code/grid%20game/Run%20n%20Gun%204%20players/index.html).

## Controls

- Click soldiers in your `Inventory` to place them on your start line
- Click `ROLL DICE` to roll movement
- Click a legal soldier, then click its highlighted destination
- Click `USE POWER` to enter power selection mode
- Follow on-screen prompts for resurrection, freeze timing, and tutorial steps

## AI Policies

From the Play setup menu, each team can be assigned one of:

- `Human`
- `Main` -> maps to engine policy `main4`
- `Greedy`
- `Random`
- `None`

This allows:

- 2-player games
- 3-player games
- 4-player games
- mixed human/AI matches
- full AI simulations

## Notes

- `game.js` is the engine and should be treated as the source of truth.
- The UI is built around `handleCommand(...)` style engine interaction.
- `test.js` is intentionally separate so experimental balance testing does not leak into the main engine.

## Status

This is an actively iterated prototype. The current repo is focused on:

- stable 4-player gameplay
- AI experimentation and balance testing
- browser playability
- tutorial and rules support

Future work may include stronger AI, additional polish, and platform-specific packaging.

## License

This project is licensed under `GPL-3.0-or-later`.
See [LICENSE](E:/lets%20code%20grid%20game/Run%20n%20Gun%204%20players/LICENSE).
