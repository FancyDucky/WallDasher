# Wall Dasher

A lightweight, browser-based tool to measure Rocket League wall-dash “double tap” timing.

## Features

- Double-Tap Graph with color-coded bars:
  - Green ≤ 95 ms, Yellow 96–120 ms, Red 121–150 ms, Black > 150 ms
  - Summary in-graph: Average double tap speed, Average time between double tap pairs (AvgBDTP), Total pairs, Best/Worst pairs
- Input support:
  - Gamepad via the Web Gamepad API (bind Tap/Restart to any buttons)
  - KB/M mode: bind mouse buttons and keyboard keys
  - Optional Scroll Wheel mode (each wheel event counts as a tap)
  - Optional “Allow Multiple Game Pad Inputs” to accept inputs from any connected pad
- Audio benchmark:
  - Plays a configurable series (count) with a gap between blips (ms) Helpful for hearing the rhythm.
- Overlay window:
  - Popout Window that is always ontop.

## Notes and Limitations

- Browser focus: standard web pages cannot capture inputs globally when unfocused.
- Timing: small (≤ 10 ms) differences vs in-game plugins are normal due to:
  - Controller report cadence/driver quantization (often 4–8 ms steps)
  - Browser event loop/timer scheduling
  - Analog-to-digital thresholds vs true digital flags
  - OS/connection path differences (wired vs Bluetooth)

## Development

- Core files:
  - `index.html`: markup and UI
  - `styles.css`: visual design
  - `script.js`: logic for inputs, rendering, audio, overlays
- No build step is required; open `index.html` to run.

## Assets

- Avatar: `DuckSmall.jpg` / `Duck.jpg`
- Icons: `youtube.png`, `Twitch.png`, `discord.png`

## License

This project is provided as-is for personal use and community practice.





