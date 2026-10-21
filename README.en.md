<p align="center">
  <img src="assets/icon.png" width="96" alt="Kabuk">
</p>

<h1 align="center">Kabuk</h1>

<p align="center">
  A themed Windows terminal with split panes, built for working comfortably with AI coding tools.
</p>

<p align="center">
  <a href="README.md">Türkçe</a> · <b>English</b>
</p>

<p align="center">
  <a href="https://github.com/ysft1rt-art/kabuk/releases/latest"><b>Download (Windows 10/11, 64-bit)</b></a>
</p>

---

*Kabuk* means "shell" in Turkish.

## Contents

- [Features](#features)
- [Installation](#installation)
- [Updates](#updates)
- [Usage](#usage)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Context menu: "Open in Kabuk"](#context-menu-open-in-kabuk)
- [Notifications (Claude Code, Codex)](#notifications-claude-code-codex)
- [Settings](#settings)
- [Building from source](#building-from-source)
- [Publishing a new version](#publishing-a-new-version)
- [Project structure](#project-structure)
- [License](#license)

## Features

- **Split panes:** Split right, left, up and down as much as you like; drag the borders to resize.
- **Tabs:** Reorder by dragging, switch with Ctrl+Tab.
- **Hidden terminals:** Hide a pane without closing it. It keeps running in the background and comes back from the "Hidden" button in the top bar.
- **Undo with Ctrl+Z:** Opened a new pane by mistake? If you haven't typed in it yet, Ctrl+Z closes it.
- **26 themes:** Each with a dark and a light variant (Kar, Catppuccin, Nord, Rosé Pine, Kanagawa, Solarized, One Dark / Light and more). Dark/light can follow Windows.
- **Frosted glass:** A blurred, translucent window background with adjustable intensity.
- **Fonts:** JetBrains Mono, Geist Mono, Fira Code and Source Code Pro are bundled; installed fonts such as Cascadia can be selected too.
- **Shells:** PowerShell 7, Windows PowerShell, Command Prompt and Git Bash are detected automatically; add any other program (Python, Node, SSH, WSL…) as a shell.
- **Made for AI tools:** Open a folder straight into Claude Code, Codex, Gemini CLI and others from the right-click menu. Kabuk lets you know when a tool finishes or waits for your approval.
- **Fast, clean rendering:** Terminals are drawn with WebGL; block characters (like the Claude Code mascot) render without gaps.
- **Command suggestions and fun mode:** A new terminal shows example commands on the empty prompt until you start typing. In fun mode, words like `cat`, `dog` or `snow` play small animations.
- **Turkish and English:** The interface language follows Windows and can be changed in Settings.
- **Automatic updates:** Kabuk finds new versions by itself, downloads them in the background and installs them with one click.

## Installation

1. Download `Kabuk-Kurulum-<version>.exe` from the [Releases](https://github.com/ysft1rt-art/kabuk/releases/latest) page (*Kurulum* means "setup").
2. Run it. It is a one-click install that needs no administrator rights: Kabuk is installed for the current user in `%LOCALAPPDATA%\Programs\kabuk`, with Start menu and desktop shortcuts.
3. The installer is not code-signed, so on first run Windows may say **"Windows protected your PC"**. Click **More info → Run anyway**.

To uninstall: Windows Settings → Apps → Installed apps → Kabuk → Uninstall. This also removes "Open in Kabuk" from the right-click menu. Your settings stay in `%APPDATA%\Kabuk`.

## Updates

- While Kabuk is open, it checks GitHub for a new version shortly after starting and then every few hours.
- When it finds one, it downloads it in the background. A button with the download percentage appears in the top bar; once the download is done it turns into **Update**.
- Click it to see what's new. **Restart and update** closes Kabuk, installs the new version and reopens Kabuk.
- No rush: if you don't click it, the new version installs by itself when you close Kabuk.
- In **Settings → Updates** you can check manually or turn automatic checks off.

## Usage

- **New tab:** The `+` button in the top bar. The arrow next to it opens a tab with a different shell and lets you pick the default shell.
- **Split the screen:** The split buttons in the top bar or `Alt` + arrow keys. The new pane opens in the folder you are in.
- **Copy / paste:** Right-click copies when there is a selection and pastes when there isn't. `Ctrl+C` copies a selection, otherwise it stops the running program. `Ctrl+V` pastes.
- **Links:** Click an address shown in the terminal to open it in your browser. For links whose address a program hides, Kabuk shows the address first and opens it only if you confirm. Web pages never open inside Kabuk.
- **Font size:** `Ctrl` + mouse wheel, or `Ctrl +` / `Ctrl -`.

## Keyboard shortcuts

All shortcuts can be changed in **Settings → Shortcuts**, and an action can have a second shortcut. The `?` button in the top bar shows the current list.

| Action | Default |
|---|---|
| Open terminal to the right / below | `Alt+→` / `Alt+↓` (or `Ctrl+Shift+D` / `Ctrl+Shift+E`) |
| Open terminal to the left / above | `Alt+←` / `Alt+↑` |
| Undo the newly opened terminal | `Ctrl+Z` (if nothing was typed in it yet) |
| Move between panes | `Ctrl+Alt` + arrow keys |
| New tab | `Ctrl+Shift+T` |
| Close pane | `Ctrl+Shift+W` |
| Hide pane | `Ctrl+Shift+H` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Settings | `Ctrl+,` |
| Copy | `Ctrl+Shift+C` |
| Paste | `Ctrl+V` / `Ctrl+Shift+V` |
| Bigger / smaller / reset font | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |

## Context menu: "Open in Kabuk"

Right-click a folder (or the empty space inside an open folder) in File Explorer and choose **Open in Kabuk**.

- If no AI command-line tool is installed, it is a single item that opens a terminal in that folder.
- If tools are installed, it becomes a submenu: **Terminal** plus the tools found. Pick a tool and Kabuk opens in that folder and starts it.
- Recognized tools: Claude Code, Codex, Gemini CLI, OpenCode, Pi, GitHub Copilot CLI, Cursor CLI, Qwen Code, Amp, Crush, Factory Droid, Cline, Kimi CLI, Kiro CLI, Auggie, Goose, Aider. The list lives in [`contextmenu/clis.txt`](contextmenu/clis.txt).
- If Kabuk is already open, it opens a new tab instead of a new window.

**Windows 11's compact menu:** At first the item appears under "Show more options". To show it in the compact (new) menu too, click **Settings → Startup → "Add to Windows 11 menu"** once. Windows asks for administrator approval one time: Kabuk's menu extension is signed with its own certificate, and Windows has to trust it. The certificate's private key is deleted right after signing, so nothing else can ever be signed with it.

You can turn the menu off in **Settings → Startup**.

## Notifications (Claude Code, Codex)

When a program needs your attention (work finished, approval needed), Kabuk lets you know:

- If you are already looking at that terminal, nothing happens.
- If it is another pane in the same tab, that pane's border flashes.
- If it is in another tab, a dot appears on the tab; if Kabuk is in the background, a Windows notification appears and the taskbar icon lights up. Clicking the notification takes you to that terminal.

Programs need a one-time setting to send notifications:

- **Claude Code:** Type `/config` in Claude Code and set **Notifications** to **Ghostty**.
- **Codex:** Add this to `.codex\config.toml` in your user folder:

  ```toml
  [tui]
  notifications = true
  notification_method = "osc9"
  ```

If no Windows notification shows up, make sure Kabuk is allowed in Windows Settings → System → Notifications. **Settings → Notifications** can send a test notification.

## Settings

Press `Ctrl+,` or the gear button in the top bar. Changes apply immediately.

| Section | What's there |
|---|---|
| Startup | Default shell, start folder, open split panes in the same folder, window size on start, confirm on close, right-click menu |
| Appearance | Language, theme, dark/light, pure black background, frosted glass and its intensity, fun mode, command suggestions |
| Font | Font, weight, size |
| Terminal | Cursor shape and blinking, line spacing, scrollback length, copy on select, right-click copy/paste |
| Notifications | Notifications, Windows notifications, taskbar flashing, bell signal |
| Shortcuts | Change every shortcut |
| Shells | Detected shells, add a new shell |
| Updates | Version, manual check, automatic checks |

## Building from source

Requirements: [Node.js](https://nodejs.org/) 22 or newer, Windows 10/11.

```bash
git clone https://github.com/ysft1rt-art/kabuk.git
cd kabuk
npm install
npm start
```

To build the installer:

```bash
npm run dist
```

The output is `dist\Kabuk-Kurulum-<version>.exe`. The context menu extension (`contextmenu\KabukMenu.dll` and its packages) is committed prebuilt; you only need `contextmenu\build.ps1` if you change the C++ code (requires Visual Studio C++ tools and the Windows SDK).

## Publishing a new version

1. Bump `version` in `package.json` (e.g. `1.0.1`) and commit.
2. Create and push a tag with the same version:

   ```bash
   git tag v1.0.1
   git push origin main v1.0.1
   ```

3. GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)) builds the installer on Windows and publishes it on the Releases page. Installed copies of Kabuk pick up the new version within a few hours.

## Project structure

| Path | What |
|---|---|
| `main.js` | Main process: window, terminals (node-pty), notifications, context menu setup |
| `updater.js` | Automatic updates (electron-updater, GitHub Releases) |
| `preload.js` | The safe bridge between the interface and the main process |
| `renderer/` | Interface: tabs, panes, settings, themes, shortcuts, translations |
| `contextmenu/` | Windows context menu extension (C++), menu packages and the tool list |
| `build/installer.nsh` | Extra steps for the installer |
| `assets/` | App icons |

Built with [Electron](https://www.electronjs.org/), [xterm.js](https://xtermjs.org/), [node-pty](https://github.com/microsoft/node-pty) and [electron-builder](https://www.electron.build/).

Code comments and commit messages are in Turkish.

## License

[MIT](LICENSE)
