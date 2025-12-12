(() => {
	// Configuration
	const THRESHOLD_MS = 95; // Bars become red if interval > THRESHOLD_MS (visual only; see class logic)
	const DEFAULT_TAP_INDEX = 0; // A / Cross
	const DEFAULT_RESTART_INDEX = 1; // B / Circle
	const DEFAULT_AUDIO_INDEX = -1; // Unbound by default
	const DEFAULT_KBM_TAP = 2; // Right click (Tap)
	const DEFAULT_KBM_RESTART = 0; // Left click (Restart)

	// DOM elements
	const startBtn = document.getElementById('startBtn'); // may be null (removed)
	const pauseBtn = document.getElementById('pauseBtn'); // may be null (removed)
	const resetBtn = document.getElementById('resetBtn');
	const padNameEl = document.getElementById('padName');
	const thresholdValueEl = document.getElementById('thresholdValue');
	const tapCountEl = document.getElementById('tapCount');
	const barChartEl = document.getElementById('barChart');
	const bestPairEl = document.getElementById('bestPair');
	const worstPairEl = document.getElementById('worstPair');
	const avgPairEl = document.getElementById('avgPair');
	const avgAllEl = document.getElementById('avgAll');
	const parityEl = document.getElementById('parity'); // may be null (removed)
	const pairCountEl = document.getElementById('pairCount');
	const tapButtonLabelEl = document.getElementById('tapButtonLabel');
	const restartButtonLabelEl = document.getElementById('restartButtonLabel');
	const bindTapBtn = document.getElementById('bindTapBtn');
	const bindRestartBtn = document.getElementById('bindRestartBtn');
	const bindAudioBtn = document.getElementById('bindAudioBtn');
	const bindTapText = document.getElementById('bindTapText');
	const bindRestartText = document.getElementById('bindRestartText');
	const bindAudioText = document.getElementById('bindAudioText');
	const toggleSoundBtn = document.getElementById('toggleSoundBtn');
	const play85Btn = document.getElementById('play85Btn');
	const stop85Btn = document.getElementById('stop85Btn');
	const gapMsInput = document.getElementById('gapMsInput');
	const seriesInput = document.getElementById('seriesInput');
	const openOverlayBtn = document.getElementById('openOverlayBtn');
	const kbmModeBtn = document.getElementById('kbmModeBtn');
	const multiPadsChk = document.getElementById('multiPadsChk');
	const ignoreBlackBtn = document.getElementById('ignoreBlackBtn');
	const scrollWheelBtn = document.getElementById('scrollWheelBtn');
	const fancyDuckLink = document.getElementById('fancyDuckLink');
	const linktreeOverlay = document.getElementById('linktreeOverlay');
	const madeByAvatar = document.querySelector('.made-by-avatar');
	const madeByContainer = document.querySelector('.made-by');
	const aboutBtn = document.getElementById('aboutBtn');
	const aboutOverlay = document.getElementById('aboutOverlay');
	const kbmWarnOverlay = document.getElementById('kbmWarnOverlay');
	const kbmWarnOkBtn = document.getElementById('kbmWarnOk');
	const unbindBtn = document.getElementById('unbindBtn');
	const welcomeOverlay = document.getElementById('welcomeOverlay');
	const welcomeVideo = document.getElementById('welcomeVideo');
	const vjStick = document.getElementById('vjStick');
	const joyXEl = document.getElementById('joyX');
	const joyYEl = document.getElementById('joyY');
	const joyClearBtn = document.getElementById('joyClearBtn');

	if (thresholdValueEl) thresholdValueEl.textContent = String(THRESHOLD_MS);

	// State
	let isRunning = false;
	let rafId = 0;
	let activeGamepadIndex = null;
	let prevButtonStates = [];
	let startTimeMs = null;
	const pressTimes = []; // absolute ms since performance.now() at first press
	let tapButtonIndex = Number(localStorage.getItem('tapButtonIndex') ?? DEFAULT_TAP_INDEX);
	let restartButtonIndex = Number(localStorage.getItem('restartButtonIndex') ?? DEFAULT_RESTART_INDEX);
	let audioButtonIndex = Number(localStorage.getItem('audioButtonIndex') ?? DEFAULT_AUDIO_INDEX);
	let bindingMode = null; // 'tap' | 'restart' | 'audio' | null
	let lastMapping = 'standard';
	let tapSoundEnabled = true;
	let audioCtx = null;
	let interval85Id = 0;
	const DEFAULT_GAP_MS = 85;
	const DEFAULT_SERIES = 2;
	let benchGapMs = Number(localStorage.getItem('benchGapMs') ?? DEFAULT_GAP_MS);
	let benchSeries = Number(localStorage.getItem('benchSeries') ?? DEFAULT_SERIES);
	let kbmMode = localStorage.getItem('kbmMode') === 'true';
	let kbmTapButton = Number(localStorage.getItem('kbmTapButton') ?? DEFAULT_KBM_TAP);
	let kbmRestartButton = Number(localStorage.getItem('kbmRestartButton') ?? DEFAULT_KBM_RESTART);
	let ignoreNextMouseBindClick = false;
	let kbmTapKey = localStorage.getItem('kbmTapKey') ?? '';
	let kbmRestartKey = localStorage.getItem('kbmRestartKey') ?? '';
	let ignoreNextKeyBindPress = false;
	let kbmTapBindType = localStorage.getItem('kbmTapBindType') || ''; // 'mouse' | 'key'
	let kbmRestartBindType = localStorage.getItem('kbmRestartBindType') || ''; // 'mouse' | 'key'
	let kbmAudioBindType = localStorage.getItem('kbmAudioBindType') || ''; // 'mouse' | 'key'
	let kbmAudioButton = Number(localStorage.getItem('kbmAudioButton') ?? -1);
	let kbmAudioKey = localStorage.getItem('kbmAudioKey') ?? '';
	let inputPollId = 0; // high-frequency input polling for gamepad
	let allowMultiGamepads = localStorage.getItem('allowMultiGamepads') === 'true';
	let prevAnyButtonStates = [];
	let scrollWheelMode = localStorage.getItem('scrollWheelMode') === 'true';
	let isPlayStationPad = false; // track if current/primary gamepad appears to be PlayStation
	let isXboxPad = true; // default to Xbox so startup shows Xbox icons until detection
	let ignoreBlackBars = localStorage.getItem('ignoreBlackBars') === 'true';
	const JOY_GRID = 48; // lower resolution → larger cells
	let joyHist = new Uint32Array(JOY_GRID * JOY_GRID);
	let joySumX = 0, joySumY = 0, joyCount = 0;
	let lastJoyX = 0, lastJoyY = 0;
	let joyHeatMax = 0; // smoothed max for stable normalization
	let joyAutoCapture = false; // capture stick from first tap until cleared
	const joyHeatCanvas = document.createElement('canvas');
	joyHeatCanvas.width = 160;
	joyHeatCanvas.height = 160;
	joyHeatCanvas.style.border = '1px solid var(--card-stroke)';
	joyHeatCanvas.style.borderRadius = '8px';
	joyHeatCanvas.style.background = 'rgba(255,255,255,0.03)';
	// attach heatmap canvas under joystick display
	(function attachHeatCanvas(){
		const container = document.querySelector('.vj-container');
		if (container) {
			const wrap = document.createElement('div');
			wrap.style.display = 'flex';
			wrap.style.flexDirection = 'column';
			wrap.style.gap = '6px';
			// row: [heatmap][controls]
			const heatRow = document.createElement('div');
			heatRow.style.display = 'flex';
			heatRow.style.gap = '12px';
			heatRow.appendChild(joyHeatCanvas);
			const ctrlCol = document.createElement('div');
			ctrlCol.style.display = 'flex';
			ctrlCol.style.flexDirection = 'column';
			ctrlCol.style.gap = '8px';
			ctrlCol.style.justifyContent = 'center';
			ctrlCol.style.height = joyHeatCanvas.height + 'px';
			const clearBtn = document.getElementById('joyClearBtn');
			if (clearBtn) {
				clearBtn.style.alignSelf = 'center';
				clearBtn.style.display = 'inline-flex';
				ctrlCol.appendChild(clearBtn);
			}
			heatRow.appendChild(ctrlCol);
			const avgEl = document.createElement('div');
			avgEl.id = 'joyAvg';
			avgEl.style.fontSize = '12px';
			avgEl.style.color = 'var(--muted)';
			avgEl.textContent = 'Avg X: 0.00  •  Avg Y: 0.00';
			wrap.appendChild(heatRow);
			wrap.appendChild(avgEl);
			container.appendChild(wrap);
		}
	})();

	function joyIndex(x, y) {
		// map [-1,1] to [0, JOY_GRID-1]
		const ix = Math.max(0, Math.min(JOY_GRID - 1, Math.floor(((x + 1) / 2) * JOY_GRID)));
		const iy = Math.max(0, Math.min(JOY_GRID - 1, Math.floor(((y + 1) / 2) * JOY_GRID)));
		return iy * JOY_GRID + ix;
	}
	function clearJoyData() {
		joyHist.fill(0);
		joySumX = 0; joySumY = 0; joyCount = 0;
		joyHeatMax = 0;
		joyAutoCapture = false;
		renderJoyHeatmap();
		updateJoyAverages();
		if (joyClearBtn) joyClearBtn.disabled = true;
	}
	function updateJoyAverages() {
		const avg = document.getElementById('joyAvg');
		if (avg) {
			const ax = joyCount ? (joySumX / joyCount) : 0;
			const ay = joyCount ? (joySumY / joyCount) : 0;
			avg.textContent = `Avg X: ${ax.toFixed(3)}  •  Avg Y: ${ay.toFixed(3)}`;
		}
		// mirror into overlay if present
		if (overlayJoyAvgEl) {
			const ax = joyCount ? (joySumX / joyCount) : 0;
			const ay = joyCount ? (joySumY / joyCount) : 0;
			overlayJoyAvgEl.textContent = `Avg X: ${ax.toFixed(3)}  •  Avg Y: ${ay.toFixed(3)}`;
		}
	}
	function renderJoyHeatmap() {
		const ctx = joyHeatCanvas.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0,0,joyHeatCanvas.width, joyHeatCanvas.height);
		// find max for normalization
		let currentMax = 0;
		for (let i=0;i<joyHist.length;i++) if (joyHist[i] > currentMax) currentMax = joyHist[i];
		// Lock-in the max so the map never visually "cools down" during a session
		joyHeatMax = Math.max(joyHeatMax, currentMax);
		const normMax = Math.max(1, Math.max(joyHeatMax, currentMax));
		if (normMax === 0) return;
		const cellW = joyHeatCanvas.width / JOY_GRID;
		const cellH = joyHeatCanvas.height / JOY_GRID;
		// Build a list of active cells so we can draw low→high (hot red on top)
		const cells = [];
		for (let y=0;y<JOY_GRID;y++){
			for (let x=0;x<JOY_GRID;x++){
				const c = joyHist[y*JOY_GRID + x];
				if (!c) continue;
				const tLin = c / normMax;
				const t = Math.pow(tLin, 0.25); // much faster ramp to red
				cells.push({ x, y, t });
			}
		}
		// sort ascending so hottest (red) draw last on top
		cells.sort((a,b) => a.t - b.t);
		for (const cell of cells) {
			const {x, y, t} = cell;
			// green (#00FF00) → bright red (#FF0000)
			const r = Math.min(255, Math.round(255 * Math.pow(t, 0.25))); // reach full red sooner
			const g = Math.max(0, Math.round(255 * Math.pow(1 - t, 0.4)));
			const b = 0;
			const a = 0.5 + 0.5 * t; // hotter alpha
			ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
			const pad = -0.5;
			ctx.fillRect(x*cellW + pad, y*cellH + pad, cellW - 2*pad, cellH - 2*pad);
			// soft halo on top for hot cells
			if (t > 0.45) {
				const haloA = 0.25 * (t - 0.45) * (1/0.55); // up to ~0.25
				ctx.fillStyle = `rgba(${r},${g},${b},${haloA.toFixed(2)})`;
				const haloPad = -1.6;
				ctx.fillRect(x*cellW + haloPad, y*cellH + haloPad, cellW - 2*haloPad, cellH - 2*haloPad);
			}
		}
	}
	joyClearBtn?.addEventListener('click', clearJoyData);

	function updateJoystickUI(x, y) {
		// Clamp to [-1,1]
		const cx = Math.max(-1, Math.min(1, x || 0));
		const cy = Math.max(-1, Math.min(1, y || 0));
		if (joyXEl) joyXEl.textContent = cx.toFixed(2);
		if (joyYEl) joyYEl.textContent = cy.toFixed(2);
		if (vjStick) {
			const range = 64; // half travel in px for 160 base, 32 stick
			// Y axis: positive down; gamepad y positive is usually down already
			vjStick.style.transform = `translate(${(cx*range).toFixed(1)}px, ${(cy*range).toFixed(1)}px)`;
		}
		// overlay joystick mirror
		if (overlayJoyStickEl) {
			const rangeOv = 48; // half travel in px for 120 base, 24 stick
			overlayJoyStickEl.style.transform = `translate(${(cx*rangeOv).toFixed(1)}px, ${(cy*rangeOv).toFixed(1)}px)`;
		}
		// Record stick positions after first tap until cleared
		if (joyAutoCapture) {
			const idx = joyIndex(cx, cy);
			// Increase weight per sample to heat faster
			joyHist[idx] += 6;
			joySumX += cx;
			joySumY += cy;
			joyCount += 1;
			updateJoyAverages();
			renderJoyHeatmap();
			if (joyClearBtn) joyClearBtn.disabled = false;
		}
		// Mirror heatmap into overlay by copying the main canvas
		if (overlayHeatCanvasEl && joyHeatCanvas) {
			const octx = overlayHeatCanvasEl.getContext('2d');
			if (octx) {
				octx.clearRect(0,0,overlayHeatCanvasEl.width, overlayHeatCanvasEl.height);
				octx.drawImage(joyHeatCanvas, 0, 0, overlayHeatCanvasEl.width, overlayHeatCanvasEl.height);
			}
		}
		lastJoyX = cx; lastJoyY = cy;
	}

	// Overlay
	let overlayWin = null;
	let overlayBarsEl = null;
	let overlayStatsEl = null;
	let overlayHeatCanvasEl = null;
	let overlayJoyStickEl = null;
	let overlayJoyAvgEl = null;

	// Utilities
	function formatMs(value) {
		if (value == null || Number.isNaN(value)) return '—';
		return `${Math.round(value)} ms`;
	}

	function getActiveGamepad() {
		const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
		if (!gamepads) return null;
		if (activeGamepadIndex != null && gamepads[activeGamepadIndex]) {
			return gamepads[activeGamepadIndex];
		}
		// Pick the first connected one
		for (let i = 0; i < gamepads.length; i++) {
			if (gamepads[i]) {
				activeGamepadIndex = i;
				return gamepads[i];
			}
		}
		return null;
	}

	function buttonIndexToName(index, mapping) {
		if (mapping !== 'standard') return `Button ${index}`;
		const names = [
			'A', 'B', 'X', 'Y',
			'LB', 'RB', 'LT', 'RT',
			'Back', 'Start', 'LS', 'RS',
			'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
			'Home'
		];
		return names[index] ?? `Button ${index}`;
	}

	function mouseButtonIndexToName(index) {
		if (index == null || Number.isNaN(index) || index < 0) return '';
		if (index === 0) return 'Left Click';
		if (index === 1) return 'Middle Click';
		if (index === 2) return 'Right Click';
		return `Mouse ${index}`;
	}

	function keyCodeToName(code) {
		if (!code) return '';
		if (code.startsWith('Key')) return code.slice(3);
		if (code.startsWith('Digit')) return code.slice(5);
		return code;
	}

	function updateKbmModeBtn() {
		if (!kbmModeBtn) return;
		kbmModeBtn.textContent = `KB/M mode: ${kbmMode ? 'On' : 'Off'}`;
	}

	function updatePadNameDisplay() {
		if (kbmMode) {
			padNameEl.textContent = 'KB/M';
		}
	}

	function cleanPadName(name) {
		if (!name) return '';
		// Remove any parenthetical sections like " (Vendor 1234)"
		return String(name).replace(/\s*\([^)]*\)/g, '').trim();
	}

	function updateScrollWheelBtn() {
		if (!scrollWheelBtn) return;
		scrollWheelBtn.textContent = `Scroll Wheel: ${scrollWheelMode ? 'On' : 'Off'}`;
	}

	function updateInputModeButton() {
		if (!kbmModeBtn) return;
		kbmModeBtn.textContent = `Input Mode: ${kbmMode ? 'KBM' : 'Gamepad'}`;
	}

	function updateBindingLabels() {
		// While in binding mode, force prompt text and avoid rendering icons
		if (bindingMode) {
			if (bindingMode === 'tap' && bindTapText) {
				bindTapText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press A Button';
			}
			if (bindingMode === 'restart' && bindRestartText) {
				bindRestartText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press A Button';
			}
			if (bindingMode === 'audio' && bindAudioText) {
				bindAudioText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press A Button';
			}
			// Do not proceed to icon/text rendering while awaiting a bind
			return;
		}
		let tapName, restartName, audioName;
		if (kbmMode) {
			tapName =
				kbmTapBindType === 'mouse' ? (mouseButtonIndexToName(kbmTapButton) || 'Unbound')
				: kbmTapBindType === 'key' ? (keyCodeToName(kbmTapKey) || 'Unbound')
				: 'Unbound';
			restartName =
				kbmRestartBindType === 'mouse' ? (mouseButtonIndexToName(kbmRestartButton) || 'Unbound')
				: kbmRestartBindType === 'key' ? (keyCodeToName(kbmRestartKey) || 'Unbound')
				: 'Unbound';
			audioName =
				kbmAudioBindType === 'mouse' ? (mouseButtonIndexToName(kbmAudioButton) || 'Unbound')
				: kbmAudioBindType === 'key' ? (keyCodeToName(kbmAudioKey) || 'Unbound')
				: 'Unbound';
			if (bindTapText) bindTapText.textContent = tapName;
			if (bindRestartText) bindRestartText.textContent = restartName;
			if (bindAudioText) bindAudioText.textContent = audioName;
		} else {
			tapName = tapButtonIndex != null && tapButtonIndex >= 0 ? buttonIndexToName(tapButtonIndex, lastMapping) : 'Unbound';
			restartName = restartButtonIndex != null && restartButtonIndex >= 0 ? buttonIndexToName(restartButtonIndex, lastMapping) : 'Unbound';
			audioName = audioButtonIndex != null && audioButtonIndex >= 0 ? buttonIndexToName(audioButtonIndex, lastMapping) : 'Unbound';
			// If PlayStation pad detected, render SVG icons for known buttons
			if (bindTapText) {
				if (isPlayStationPad && tapButtonIndex != null && tapButtonIndex >= 0) {
					const icon = getPsIconForIndex(tapButtonIndex);
					if (icon) {
						bindTapText.innerHTML = `<img class="btn-icon" src="${icon.src}" alt="${icon.alt}">`;
					} else {
						bindTapText.textContent = tapName;
					}
				} else if (isXboxPad && tapButtonIndex != null && tapButtonIndex >= 0) {
					const icon = getXboxIconForIndex(tapButtonIndex);
					if (icon) {
						bindTapText.innerHTML = `<img class="btn-icon" src="${icon.src}" alt="${icon.alt}">`;
					} else {
						bindTapText.textContent = tapName;
					}
				} else {
					bindTapText.textContent = tapName;
				}
			}
			if (bindRestartText) {
				if (isPlayStationPad && restartButtonIndex != null && restartButtonIndex >= 0) {
					const icon = getPsIconForIndex(restartButtonIndex);
					if (icon) {
						bindRestartText.innerHTML = `<img class="btn-icon" src="${icon.src}" alt="${icon.alt}">`;
					} else {
						bindRestartText.textContent = restartName;
					}
				} else if (isXboxPad && restartButtonIndex != null && restartButtonIndex >= 0) {
					const icon = getXboxIconForIndex(restartButtonIndex);
					if (icon) {
						bindRestartText.innerHTML = `<img class="btn-icon" src="${icon.src}" alt="${icon.alt}">`;
					} else {
						bindRestartText.textContent = restartName;
					}
				} else {
					bindRestartText.textContent = restartName;
				}
			}
			if (bindAudioText) {
				if (isPlayStationPad && audioButtonIndex != null && audioButtonIndex >= 0) {
					const icon = getPsIconForIndex(audioButtonIndex);
					if (icon) {
						bindAudioText.innerHTML = `<img class="btn-icon" src="${icon.src}" alt="${icon.alt}">`;
					} else {
						bindAudioText.textContent = audioName;
					}
				} else if (isXboxPad && audioButtonIndex != null && audioButtonIndex >= 0) {
					const icon = getXboxIconForIndex(audioButtonIndex);
					if (icon) {
						bindAudioText.innerHTML = `<img class="btn-icon" src="${icon.src}" alt="${icon.alt}">`;
					} else {
						bindAudioText.textContent = audioName;
					}
				} else {
					bindAudioText.textContent = audioName;
				}
			}
		}
		if (tapButtonLabelEl) tapButtonLabelEl.textContent = tapName;
		if (restartButtonLabelEl) restartButtonLabelEl.textContent = restartName;
	}

	function sanitizeKbmBindTypes() {
		// If no explicit type stored (older saves), infer:
		// Prefer key if present, otherwise mouse if present, otherwise default mouse.
		if (kbmTapBindType !== 'mouse' && kbmTapBindType !== 'key') {
			if (kbmTapKey) kbmTapBindType = 'key';
			else if (kbmTapButton >= 0) kbmTapBindType = 'mouse';
			else kbmTapBindType = 'mouse';
			localStorage.setItem('kbmTapBindType', kbmTapBindType);
		}
		if (kbmRestartBindType !== 'mouse' && kbmRestartBindType !== 'key') {
			if (kbmRestartKey) kbmRestartBindType = 'key';
			else if (kbmRestartButton >= 0) kbmRestartBindType = 'mouse';
			else kbmRestartBindType = 'mouse';
			localStorage.setItem('kbmRestartBindType', kbmRestartBindType);
		}
		// Enforce exclusivity: if type is mouse, clear key; if type is key, clear mouse.
		if (kbmTapBindType === 'mouse') {
			if (kbmTapKey) {
				kbmTapKey = '';
				localStorage.removeItem('kbmTapKey');
			}
		} else {
			if (kbmTapButton >= 0) {
				kbmTapButton = -1;
				localStorage.removeItem('kbmTapButton');
			}
		}
		if (kbmRestartBindType === 'mouse') {
			if (kbmRestartKey) {
				kbmRestartKey = '';
				localStorage.removeItem('kbmRestartKey');
			}
		} else {
			if (kbmRestartButton >= 0) {
				kbmRestartButton = -1;
				localStorage.removeItem('kbmRestartButton');
			}
		}

		// Audio KB/M bind (exclusive)
		if (kbmAudioBindType !== 'mouse' && kbmAudioBindType !== 'key') {
			if (kbmAudioKey) kbmAudioBindType = 'key';
			else if (kbmAudioButton >= 0) kbmAudioBindType = 'mouse';
			else kbmAudioBindType = '';
			if (kbmAudioBindType) localStorage.setItem('kbmAudioBindType', kbmAudioBindType);
		}
		if (kbmAudioBindType === 'mouse') {
			if (kbmAudioKey) {
				kbmAudioKey = '';
				localStorage.removeItem('kbmAudioKey');
			}
		} else if (kbmAudioBindType === 'key') {
			if (kbmAudioButton >= 0) {
				kbmAudioButton = -1;
				localStorage.removeItem('kbmAudioButton');
			}
		}
	}

	function detectPlayStationFromId(id) {
		const s = String(id || '').toLowerCase();
		// Common DualShock/DualSense identifiers
		return (
			s.includes('dualshock') ||
			s.includes('dualsense') ||
			s.includes('sony') ||
			s.includes('playstation') ||
			s.includes('ps') ||
			s.includes('wireless controller') ||
			s.includes('054c')
		);
	}

	// Map standard Gamepad button indices to PlayStation SVGs
	function getPsIconForIndex(index) {
		const map = {
			0: { src: 'PS_Assets/PS-Cross.svg', alt: 'Cross' },
			1: { src: 'PS_Assets/PS-Circle.svg', alt: 'Circle' },
			2: { src: 'PS_Assets/PS-Square.svg', alt: 'Square' },
			3: { src: 'PS_Assets/PS-Triangle.svg', alt: 'Triangle' },
			4: { src: 'PS_Assets/PS-L1.svg', alt: 'L1' },
			5: { src: 'PS_Assets/PS-R1.svg', alt: 'R1' },
			6: { src: 'PS_Assets/PS-L2.svg', alt: 'L2' },
			7: { src: 'PS_Assets/PS-R2.svg', alt: 'R2' },
			8: { src: 'PS_Assets/PS-Share.svg', alt: 'Share' },
			9: { src: 'PS_Assets/PS-Options.svg', alt: 'Options' },
			10: { src: 'PS_Assets/PS-L3.svg', alt: 'L3' },
			11: { src: 'PS_Assets/PS-R3.svg', alt: 'R3' },
			12: { src: 'PS_Assets/PS-Dpadup.svg', alt: 'DPad Up' },
			13: { src: 'PS_Assets/PS-Dpaddown.svg', alt: 'DPad Down' },
			14: { src: 'PS_Assets/PS-Dpadleft.svg', alt: 'DPad Left' },
			15: { src: 'PS_Assets/PS-Dpadright.svg', alt: 'DPad Right' },
			16: { src: 'PS_Assets/PS-Home.svg', alt: 'Home' }
		};
		return map[index] || null;
	}

	function detectXboxFromId(id) {
		const s = String(id || '').toLowerCase();
		return s.includes('xbox') || s.includes('xinput') || s.includes('microsoft');
	}

	// Map standard Gamepad button indices to Xbox SVGs
	function getXboxIconForIndex(index) {
		const map = {
			0: { src: 'Xbox_Assets/XBOX-A.svg', alt: 'A' },
			1: { src: 'Xbox_Assets/XBOX-B.svg', alt: 'B' },
			2: { src: 'Xbox_Assets/XBOX-X.svg', alt: 'X' },
			3: { src: 'Xbox_Assets/XBOX-Y.svg', alt: 'Y' },
			4: { src: 'Xbox_Assets/XBOX-LB.svg', alt: 'LB' },
			5: { src: 'Xbox_Assets/XBOX-RB.svg', alt: 'RB' },
			6: { src: 'Xbox_Assets/XBOX-LT.svg', alt: 'LT' },
			7: { src: 'Xbox_Assets/XBOX-RT.svg', alt: 'RT' },
			8: { src: 'Xbox_Assets/button_xbox_digital_view_1.svg', alt: 'View' },
			9: { src: 'Xbox_Assets/XBOX-START.svg', alt: 'Menu' },
			10: { src: 'Xbox_Assets/XBOX-LEFT-STICK.svg', alt: 'LS' },
			11: { src: 'Xbox_Assets/XBOX-RIGHT-S.svg', alt: 'RS' },
			12: { src: 'Xbox_Assets/XBOX-DPAD-UP.svg', alt: 'DPad Up' },
			13: { src: 'Xbox_Assets/XBOX-DPAD-DOWN.svg', alt: 'DPad Down' },
			14: { src: 'Xbox_Assets/XBOX-DPAD-LEFT.svg', alt: 'DPad Left' },
			15: { src: 'Xbox_Assets/XBOX-DPAD-RIGHT.svg', alt: 'DPad Right' },
			16: { src: 'Xbox_Assets/button_xbox_digital_home_green.svg', alt: 'Home' }
		};
		return map[index] || null;
	}

	// Disable all buttons while binding to prevent UI handlers from firing.
	function setBindingUIState(active) {
		const allButtons = document.querySelectorAll('button');
		allButtons.forEach((btn) => {
			if (active) {
				// Preserve current state
				btn.dataset.prevDisabled = btn.disabled ? 'true' : 'false';
				// Keep bind controls usable so user can cancel/switch bindings
				if (btn === bindTapBtn || btn === bindRestartBtn || btn === bindAudioBtn || btn === unbindBtn) {
					btn.disabled = false;
				} else {
					btn.disabled = true;
				}
			} else {
				if (btn.dataset.prevDisabled) {
					btn.disabled = btn.dataset.prevDisabled === 'true';
					delete btn.dataset.prevDisabled;
				}
			}
		});
		// Restore known runtime states
		if (!isRunning && startBtn) startBtn.disabled = false;
		if (pauseBtn) pauseBtn.disabled = !isRunning;
	}

	function ensureAudio() {
		if (!audioCtx) {
			const Ctor = window.AudioContext || window.webkitAudioContext;
			if (!Ctor) return null;
			audioCtx = new Ctor();
		}
		if (audioCtx.state === 'suspended') {
			// Resume on next user gesture
			audioCtx.resume?.();
		}
		return audioCtx;
	}

	function playBlip(durationMs = 30, frequency = 1000, volume = 0.15) {
		const ctx = ensureAudio();
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.value = frequency;
		gain.gain.setValueAtTime(0, ctx.currentTime);
		gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
		const endTime = ctx.currentTime + durationMs / 1000;
		gain.gain.linearRampToValueAtTime(0, endTime);
		osc.connect(gain).connect(ctx.destination);
		osc.start();
		osc.stop(endTime + 0.01);
	}

	// Tap sound logic with tone variants on second tap in a pair
	function getSecondTapFrequencyForInterval(intervalMs) {
		// Match bar coloring thresholds: ≤95 green, 96–120 yellow, 121–150 red, 151+ black
		if (intervalMs >= 151) return 600; // black → even lower
		if (intervalMs >= 121) return 800; // red → lower
		if (intervalMs >= 96) return 1000; // yellow → mid
		return 1200; // green → slightly higher
	}
	function maybePlayTapSound() {
		if (!tapSoundEnabled) return;
		// If this is the second tap of a pair, vary the tone based on the interval
		if (pressTimes.length >= 2 && pressTimes.length % 2 === 0) {
			const last = pressTimes[pressTimes.length - 1];
			const prev = pressTimes[pressTimes.length - 2];
			const intervalMs = last - prev;
			const freq = getSecondTapFrequencyForInterval(intervalMs);
			playBlip(30, freq);
			return;
		}
		// First tap of a pair gets default tone
		playBlip();
	}

	function start85Loop() {
		if (interval85Id) return;
		const ctx = ensureAudio();
		if (!ctx) return;
		// One loop consists of N blips spaced by benchGapMs.
		const fire = () => {
			const seriesCount = Math.max(1, benchSeries);
			for (let i = 0; i < seriesCount; i++) {
				const delay = i * benchGapMs;
				setTimeout(() => {
					// For every second tap in a pair (odd index), adjust tone based on gap
					if (i % 2 === 1) {
						const freq = getSecondTapFrequencyForInterval(benchGapMs);
						playBlip(30, freq);
					} else {
						playBlip(); // default tone
					}
				}, delay);
			}
		};
		// Start immediately, and schedule next loop only after current loop has finished (period = seriesCount * benchGapMs)
		fire();
		const period = (Math.max(1, benchGapMs) * Math.max(1, benchSeries)) + 1000; // add fixed 1000ms gap between loops
		interval85Id = setTimeout(function schedule() {
			// if stopped, don't continue
			if (!interval85Id) return;
			fire();
			interval85Id = setTimeout(schedule, (Math.max(1, benchGapMs) * Math.max(1, benchSeries)) + 1000);
		}, period);
		play85Btn?.setAttribute('disabled', 'true');
		stop85Btn?.removeAttribute('disabled');
	}

	function stop85Loop() {
		if (interval85Id) {
			clearTimeout(interval85Id);
			interval85Id = 0;
		}
		play85Btn?.removeAttribute('disabled');
		stop85Btn?.setAttribute('disabled', 'true');
	}

	function restart85IfPlaying() {
		if (interval85Id) {
			stop85Loop();
			start85Loop();
		}
	}

	function computePairIntervals(times) {
		const out = [];
		for (let i = 1; i < times.length; i += 2) {
			out.push(times[i] - times[i - 1]);
		}
		return out;
	}

	function computeAllIntervals(times) {
		const out = [];
		for (let i = 1; i < times.length; i++) {
			out.push(times[i] - times[i - 1]);
		}
		return out;
	}

	function computeBetweenPairGaps(times) {
		// Gap from end of pair k to start of pair k+1:
		// For pairs (0,1), (2,3), (4,5), ... we want times[2] - times[1], times[4] - times[3], ...
		const out = [];
		for (let i = 1; i + 1 < times.length; i += 2) {
			// i is the end of current pair; i+1 is the start of next pair (if it exists)
			out.push(times[i + 1] - times[i]);
		}
		return out;
	}

	function average(values) {
		if (!values.length) return null;
		const sum = values.reduce((a, b) => a + b, 0);
		return sum / values.length;
	}

	// Rendering
	function render() {
		const nowAbs = performance.now();
		const nowRel = startTimeMs == null ? 0 : nowAbs - startTimeMs;
		// Pairwise (double-tap) intervals
		const pairIntervals = computePairIntervals(pressTimes);
		const consideredPairs = ignoreBlackBars ? pairIntervals.filter((v) => v <= 150) : pairIntervals;
		const lastPair = pairIntervals.length ? pairIntervals[pairIntervals.length - 1] : null;
		const bestPair = consideredPairs.length ? Math.min(...consideredPairs) : null;
		const worstPair = consideredPairs.length ? Math.max(...consideredPairs) : null;

		// Average double-tap speed (pairwise)
		const avgPair = average(consideredPairs);
		// Average time between double-tap pairs
		const betweenPairGaps = computeBetweenPairGaps(pressTimes);
		const avgAll = average(betweenPairGaps);

		// Update scalar UI
		if (tapCountEl) tapCountEl.textContent = String(pressTimes.length);
		pairCountEl.textContent = String(pairIntervals.length);
		bestPairEl.textContent = formatMs(bestPair);
		worstPairEl.textContent = formatMs(worstPair);
		if (avgPairEl) avgPairEl.textContent = avgPair == null ? '—' : formatMs(avgPair);
		avgAllEl.textContent = avgAll == null ? '—' : formatMs(avgAll);

		// Parity pill removed; guard in case element exists
		const even = pressTimes.length % 2 === 0;
		if (parityEl) {
		parityEl.textContent = even ? 'Even' : 'Odd';
		parityEl.classList.toggle('good', even);
		parityEl.classList.toggle('bad', !even);
		}

		// Bars: show all completed pairs and, if odd, a growing in-progress pair
		let barValues = pairIntervals;
		let inProgressLast = false;
		if (!even && startTimeMs != null && pressTimes.length > 0) {
			const lastTapRel = pressTimes[pressTimes.length - 1];
			const progress = Math.max(0, nowRel - lastTapRel);
			barValues = pairIntervals.concat(progress);
			inProgressLast = true;
		}
		renderBars(barValues, inProgressLast);
		renderOverlay(barValues, inProgressLast, avgPair, avgAll);
	}

	function renderBars(values, inProgressLast = false) {
		renderBarsInto(barChartEl, values, inProgressLast);
	}

	function renderBarsInto(targetEl, values, inProgressLast = false) {
		// Clean slate
		targetEl.innerHTML = '';
		if (!values.length) return;

		const containerHeight = targetEl.clientHeight || 240;
		// Determine how many bars can fit (no horizontal scroll). Approx width: 26px bar + 8px gap.
		const containerWidth = targetEl.clientWidth || 360;
		const approxBarTotal = 26 + 8;
		const capacity = Math.max(1, Math.floor((containerWidth - 16) / approxBarTotal));
		const slice = values.slice(-capacity);

		// Use a fixed scale so bars never shrink when later bars are higher
		const msScaleMax = 150; // 150 ms maps to maxBarHeight
		const usableHeight = containerHeight - 18; // bottom padding reserved for labels
		const maxBarHeight = Math.max(20, Math.round(usableHeight * 2 / 3)); // cap bar height to ~2/3

		slice.forEach((v, idx) => {
			let cls = 'ok';
			if (v >= 151) cls = 'black';
			else if (v >= 121) cls = 'red';
			else if (v >= 96) cls = 'yellow';

			const bar = document.createElement('div');
			const isLast = idx === slice.length - 1;
			bar.className = `bar ${cls}` + (inProgressLast && isLast ? ' progress' : '');

			const col = document.createElement('div');
			col.className = 'col';
			const vHeight = Math.min(v, 150);
			const h = Math.max(16, Math.round((vHeight / msScaleMax) * maxBarHeight));
			col.style.height = `${h}px`;

			const label = document.createElement('div');
			label.className = 'label';
			{
				const r = Math.round(v);
				label.textContent = `${r < 10 ? '0' : ''}${r} ms`;
			}

			bar.appendChild(col);
			bar.appendChild(label);
			targetEl.appendChild(bar);
		});
	}

	// Loop
	function tick() {
		if (kbmMode) {
			// KB/M mode display
			updatePadNameDisplay();
		}

		// While an odd tap count is active, render each frame so the last bar grows smoothly
		if (isRunning && startTimeMs != null && (pressTimes.length % 2 === 1)) {
			render();
		}
		rafId = requestAnimationFrame(tick);
	}

	// High precision gamepad polling (aims for ~4ms; browsers clamp setInterval)
	function pollInputs() {
		let skipActionsThisPoll = false;
		const kbmWarnOpen = Boolean(kbmWarnOverlay && kbmWarnOverlay.classList.contains('open'));
		// Auto-enable multi-pad mode if more than one gamepad is detected
		try {
			const padsProbe = (navigator.getGamepads?.() || []).filter(Boolean);
			if (padsProbe.length > 1 && !allowMultiGamepads) {
				allowMultiGamepads = true;
				localStorage.setItem('allowMultiGamepads', 'true');
				if (multiPadsChk) multiPadsChk.checked = true;
			}
		} catch {}
		// When in KB/M mode, we still poll minimally to auto-switch on gamepad press
		if (kbmMode) {
			if (allowMultiGamepads) {
				const pads = (navigator.getGamepads?.() || []).filter(Boolean);
				let maxButtons = 0;
				for (const p of pads) maxButtons = Math.max(maxButtons, (p.buttons || []).length);
				const currAny = new Array(maxButtons).fill(false);
				let firstPressedPadIndex = -1;
				// Update joystick from first pad if present
				if (pads[0]) {
					const ax = pads[0].axes || [];
					updateJoystickUI(ax[0] || 0, ax[1] || 0);
				} else {
					updateJoystickUI(0, 0);
				}
				for (const p of pads) {
					const buttons = p.buttons || [];
					for (let i = 0; i < buttons.length; i++) {
						const pressed = Boolean(buttons[i] && (buttons[i].pressed || buttons[i].value > 0.5));
						if (pressed) currAny[i] = true;
						if (pressed && firstPressedPadIndex === -1) firstPressedPadIndex = p.index ?? -1;
					}
				}
				// If KB/M warning is open, ANY gamepad button press should close it (and not switch modes)
				if (kbmWarnOpen) {
					for (let i = 0; i < currAny.length; i++) {
						if (currAny[i] && !prevAnyButtonStates[i]) {
							// Close warning and switch back to Gamepad mode
							kbmMode = false;
							localStorage.setItem('kbmMode', 'false');
							if (firstPressedPadIndex >= 0) activeGamepadIndex = firstPressedPadIndex;
							updateInputModeButton();
							updatePadNameDisplay();
							updateBindingLabels();
							closeKbmWarn();
							prevAnyButtonStates = currAny;
							return;
						}
					}
				}
				// Allow binding the audio benchmark button even while in KB/M mode
				if (bindingMode === 'audio') {
					for (let i = 0; i < currAny.length; i++) {
						if (currAny[i] && !prevAnyButtonStates[i]) {
							audioButtonIndex = i;
							localStorage.setItem('audioButtonIndex', String(i));
							bindingMode = null;
							bindAudioBtn?.classList.remove('active');
							updateBindingLabels();
							setBindingUIState(false);
							prevAnyButtonStates = currAny;
							return;
						}
					}
				}
				// rising edge across any pad
				for (let i = 0; i < currAny.length; i++) {
					if (currAny[i] && !prevAnyButtonStates[i]) {
						kbmMode = false;
						localStorage.setItem('kbmMode', 'false');
						updateInputModeButton();
						updatePadNameDisplay();
						updateBindingLabels();
						if (welcomeOverlay && welcomeOverlay.classList.contains('open')) {
							closeWelcome();
						}
						break;
					}
				}
				prevAnyButtonStates = currAny;
			} else {
				const gp = getActiveGamepad();
				if (gp) {
					const buttons = gp.buttons || [];
					const currPressed = buttons.map((b) => Boolean(b && (b.pressed || b.value > 0.5)));
					// Update joystick from this pad
					const ax = gp.axes || [];
					updateJoystickUI(ax[0] || 0, ax[1] || 0);
					if (prevButtonStates.length !== currPressed.length) {
						prevButtonStates = new Array(currPressed.length).fill(false);
					}
					// If KB/M warning is open, ANY gamepad button press should close it (and not switch modes)
					if (kbmWarnOpen) {
						for (let i = 0; i < currPressed.length; i++) {
							if (currPressed[i] && !prevButtonStates[i]) {
								// Close warning and switch back to Gamepad mode
								kbmMode = false;
								localStorage.setItem('kbmMode', 'false');
								activeGamepadIndex = gp.index ?? activeGamepadIndex;
								updateInputModeButton();
								updatePadNameDisplay();
								updateBindingLabels();
								closeKbmWarn();
								prevButtonStates = currPressed;
								return;
							}
						}
					}
					// Allow binding the audio benchmark button even while in KB/M mode
					if (bindingMode === 'audio') {
						for (let i = 0; i < currPressed.length; i++) {
							if (currPressed[i] && !prevButtonStates[i]) {
								audioButtonIndex = i;
								localStorage.setItem('audioButtonIndex', String(i));
								bindingMode = null;
								bindAudioBtn?.classList.remove('active');
								updateBindingLabels();
								setBindingUIState(false);
								prevButtonStates = currPressed;
								return;
							}
						}
					}
					for (let i = 0; i < currPressed.length; i++) {
						if (currPressed[i] && !prevButtonStates[i]) {
							kbmMode = false;
							localStorage.setItem('kbmMode', 'false');
							updateInputModeButton();
							updatePadNameDisplay();
							updateBindingLabels();
							if (welcomeOverlay && welcomeOverlay.classList.contains('open')) {
								closeWelcome();
							}
							break;
						}
					}
					prevButtonStates = currPressed;
				}
			}
			return;
		}
		if (allowMultiGamepads) {
			const pads = (navigator.getGamepads?.() || []).filter(Boolean);
			if (!pads.length) {
				padNameEl.textContent = 'Press Any Button';
				updateJoystickUI(0, 0);
				prevAnyButtonStates = [];
				return;
			}
			padNameEl.textContent = pads.length > 1 ? 'Multiple gamepads' : (cleanPadName(pads[0].id) || 'Gamepad 0');
			// detect PS from first pad id
			isPlayStationPad = pads.length === 1 ? detectPlayStationFromId(pads[0].id) : false;
			isXboxPad = pads.length === 1 ? detectXboxFromId(pads[0].id) : (!isPlayStationPad);
			if (!kbmMode) updateBindingLabels();
			// Update joystick from first pad
			const ax0 = (pads[0]?.axes) || [];
			updateJoystickUI(ax0[0] || 0, ax0[1] || 0);
			// OR buttons across all pads
			let maxButtons = 0;
			for (const p of pads) maxButtons = Math.max(maxButtons, (p.buttons || []).length);
			const currAny = new Array(maxButtons).fill(false);
			let firstPressedPadIndex = -1;
			for (const p of pads) {
				const buttons = p.buttons || [];
				for (let i = 0; i < buttons.length; i++) {
					const pressed = Boolean(buttons[i] && (buttons[i].pressed || buttons[i].value > 0.5));
					if (pressed) currAny[i] = true;
					if (pressed && firstPressedPadIndex === -1) firstPressedPadIndex = p.index ?? -1;
				}
			}
			if (prevAnyButtonStates.length !== currAny.length) {
				prevAnyButtonStates = new Array(currAny.length).fill(false);
			}
			// Welcome: close on first rising edge and set active pad
			if (welcomeOverlay && welcomeOverlay.classList.contains('open')) {
				for (let i = 0; i < currAny.length; i++) {
					if (currAny[i] && !prevAnyButtonStates[i]) {
						if (firstPressedPadIndex >= 0) activeGamepadIndex = firstPressedPadIndex;
						closeWelcome();
						break;
					}
				}
			}
			// Binding mode: capture first rising edge across any pad
			if (bindingMode) {
				for (let i = 0; i < currAny.length; i++) {
					if (currAny[i] && !prevAnyButtonStates[i]) {
						if (bindingMode === 'tap') {
							tapButtonIndex = i;
							localStorage.setItem('tapButtonIndex', String(i));
						} else if (bindingMode === 'restart') {
							restartButtonIndex = i;
							localStorage.setItem('restartButtonIndex', String(i));
						} else if (bindingMode === 'audio') {
							audioButtonIndex = i;
							localStorage.setItem('audioButtonIndex', String(i));
						}
						bindingMode = null;
						bindTapBtn?.classList.remove('active');
						bindRestartBtn?.classList.remove('active');
						bindAudioBtn?.classList.remove('active');
						updateBindingLabels();
						setBindingUIState(false);
						skipActionsThisPoll = true;
						break;
					}
				}
			}
			// Actions on rising edges
			if (!skipActionsThisPoll) {
				if (audioButtonIndex >= 0 && currAny[audioButtonIndex] && !prevAnyButtonStates[audioButtonIndex]) {
					if (interval85Id) stop85Loop(); else start85Loop();
				}
				if (currAny[restartButtonIndex] && !prevAnyButtonStates[restartButtonIndex]) {
					reset(false);
					start();
				}
				if (currAny[tapButtonIndex] && !prevAnyButtonStates[tapButtonIndex]) {
					joyAutoCapture = true;
					if (!isRunning) start();
					if (isRunning) {
						const now = performance.now();
						if (startTimeMs == null) startTimeMs = now;
						pressTimes.push(now - startTimeMs);
						render();
						maybePlayTapSound();
					}
				}
			}
			prevAnyButtonStates = currAny;
		} else {
			const gp = getActiveGamepad();
			if (gp) {
				padNameEl.textContent = cleanPadName(gp.id) || `Gamepad ${activeGamepadIndex}`;
				lastMapping = gp.mapping || 'standard';
				isPlayStationPad = detectPlayStationFromId(gp.id);
				isXboxPad = detectXboxFromId(gp.id) || !isPlayStationPad;
				if (!kbmMode) updateBindingLabels();
				// Update joystick from this pad
				const ax1 = gp.axes || [];
				updateJoystickUI(ax1[0] || 0, ax1[1] || 0);
				const buttons = gp.buttons || [];
				const currPressed = buttons.map((b) => Boolean(b && (b.pressed || b.value > 0.5)));
				if (prevButtonStates.length !== currPressed.length) {
					prevButtonStates = new Array(currPressed.length).fill(false);
				}
				// Welcome: close on first rising edge and set active pad
				if (welcomeOverlay && welcomeOverlay.classList.contains('open')) {
					for (let i = 0; i < currPressed.length; i++) {
						if (currPressed[i] && !prevButtonStates[i]) {
							activeGamepadIndex = gp.index ?? activeGamepadIndex;
							closeWelcome();
							break;
						}
					}
				}
				// Binding mode (single)
			if (bindingMode) {
				for (let i = 0; i < currPressed.length; i++) {
					if (currPressed[i] && !prevButtonStates[i]) {
						if (bindingMode === 'tap') {
							tapButtonIndex = i;
							localStorage.setItem('tapButtonIndex', String(i));
						} else if (bindingMode === 'restart') {
							restartButtonIndex = i;
							localStorage.setItem('restartButtonIndex', String(i));
						} else if (bindingMode === 'audio') {
							audioButtonIndex = i;
							localStorage.setItem('audioButtonIndex', String(i));
						}
						bindingMode = null;
						bindTapBtn?.classList.remove('active');
						bindRestartBtn?.classList.remove('active');
						bindAudioBtn?.classList.remove('active');
						updateBindingLabels();
							setBindingUIState(false);
						skipActionsThisPoll = true;
						break;
					}
				}
			}
				// Actions
			if (!skipActionsThisPoll) {
				if (audioButtonIndex >= 0 && currPressed[audioButtonIndex] && !prevButtonStates[audioButtonIndex]) {
					if (interval85Id) stop85Loop(); else start85Loop();
				}
				if (currPressed[restartButtonIndex] && !prevButtonStates[restartButtonIndex]) {
					reset(false);
					start();
				}
				if (currPressed[tapButtonIndex] && !prevButtonStates[tapButtonIndex]) {
					joyAutoCapture = true;
					if (!isRunning) start();
					if (isRunning) {
						const now = performance.now();
						if (startTimeMs == null) startTimeMs = now;
						pressTimes.push(now - startTimeMs);
						render();
							maybePlayTapSound();
					}
				}
			}
			prevButtonStates = currPressed;
			} else {
				padNameEl.textContent = 'Press Any Button';
			prevButtonStates = [];
		}
		}
	}

	function startInputPolling() {
		if (inputPollId) return;
		inputPollId = setInterval(pollInputs, 4);
	}
	function stopInputPolling() {
		if (!inputPollId) return;
		clearInterval(inputPollId);
		inputPollId = 0;
	}

	// Controls
	function start() {
		if (isRunning) return;
		isRunning = true;
		if (startBtn) startBtn.disabled = true;
		if (pauseBtn) {
		pauseBtn.disabled = false;
			pauseBtn.textContent = 'Pause';
		}
		resetBtn.disabled = false;
	}

	function pauseOrResume() {
		if (!isRunning) {
			// resume
			isRunning = true;
			if (pauseBtn) pauseBtn.textContent = 'Pause';
			return;
		}
		// pause
		isRunning = false;
		if (pauseBtn) pauseBtn.textContent = 'Resume';
	}

	function reset(stopRaf = true) {
		isRunning = false;
		if (startBtn) startBtn.disabled = false;
		if (pauseBtn) pauseBtn.disabled = true;
		resetBtn.disabled = true;
		if (pauseBtn) pauseBtn.textContent = 'Pause';

		activeGamepadIndex = null;
		prevButtonStates = [];
		startTimeMs = null;
		pressTimes.length = 0;
		barChartEl.innerHTML = '';
		if (tapCountEl) tapCountEl.textContent = '0';
		pairCountEl.textContent = '0';
		if (avgPairEl) avgPairEl.textContent = '—';
		bestPairEl.textContent = '—';
		worstPairEl.textContent = '—';
		avgAllEl.textContent = '—';
		if (parityEl) {
		parityEl.textContent = 'Even';
		parityEl.classList.remove('good', 'bad');
		}
		// Also clear joystick heatmap and averages
		clearJoyData();
		// Ensure both main and overlay UIs clear immediately
		render();
	}

	// Events
	startBtn?.addEventListener('click', start);
	pauseBtn?.addEventListener('click', pauseOrResume);
	resetBtn.addEventListener('click', reset);

	window.addEventListener('gamepadconnected', (e) => {
		// Prefer the connected gamepad
		const gp = e.gamepad;
		activeGamepadIndex = gp.index;
		padNameEl.textContent = cleanPadName(gp.id) || `Gamepad ${gp.index}`;
		lastMapping = gp.mapping || 'standard';
		isPlayStationPad = detectPlayStationFromId(gp.id);
		isXboxPad = detectXboxFromId(gp.id) || !isPlayStationPad;
		// Auto-enable multi-pad mode if multiple are connected
		try {
			const padsNow = (navigator.getGamepads?.() || []).filter(Boolean);
			if (padsNow.length > 1 && !allowMultiGamepads) {
				allowMultiGamepads = true;
				localStorage.setItem('allowMultiGamepads', 'true');
				if (multiPadsChk) multiPadsChk.checked = true;
			}
		} catch {}
		updateBindingLabels();
	});
	window.addEventListener('gamepaddisconnected', () => {
		padNameEl.textContent = 'Press Any Button';
	});

	// Initial render
	render();
	// Always run RAF so A/B presses are recognized for start/restart
	rafId = requestAnimationFrame(tick);
	// Re-render on resize to adjust sliding window capacity
	window.addEventListener('resize', render);
	// Open welcome on load
	openWelcome();

	// Binding buttons
	function toggleBinding(which) {
		if (bindingMode === which) {
			bindingMode = null;
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			bindAudioBtn?.classList.remove('active');
			updateBindingLabels();
			setBindingUIState(false);
			return;
		}
		bindingMode = which;
		if (which === 'tap') {
			bindTapBtn?.classList.add('active');
			bindRestartBtn?.classList.remove('active');
			bindAudioBtn?.classList.remove('active');
			if (bindTapText) bindTapText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press A Button';
		} else if (which === 'restart') {
			bindRestartBtn?.classList.add('active');
			bindTapBtn?.classList.remove('active');
			bindAudioBtn?.classList.remove('active');
			if (bindRestartText) bindRestartText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press A Button';
		} else if (which === 'audio') {
			bindAudioBtn?.classList.add('active');
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			if (bindAudioText) bindAudioText.textContent = 'Press A Button';
		}
		// Do not suppress next mouse/key press; binding should register on first press/click
		// Ensure window has focus so key events are received
		try { window.focus(); } catch {}
		setBindingUIState(true);
	}
	bindTapBtn?.addEventListener('click', () => toggleBinding('tap'));
	bindRestartBtn?.addEventListener('click', () => toggleBinding('restart'));
	bindAudioBtn?.addEventListener('click', () => toggleBinding('audio'));
	// Ensure older saved states don’t have both a mouse and key set for the same bind
	sanitizeKbmBindTypes();
	updateBindingLabels();

	// KB/M mode toggle
	kbmModeBtn?.addEventListener('click', () => {
		const wasKbm = kbmMode;
		kbmMode = !kbmMode;
		localStorage.setItem('kbmMode', String(kbmMode));
		updateInputModeButton();
		updatePadNameDisplay();
		updateBindingLabels();
		// If user explicitly switched into KB/M mode, warn about browser focus limitations
		if (!wasKbm && kbmMode) openKbmWarn();
	});
	updateInputModeButton();
	updatePadNameDisplay();
	startInputPolling();

	// Multiple gamepads toggle
	if (multiPadsChk) {
		multiPadsChk.checked = allowMultiGamepads;
		multiPadsChk.addEventListener('change', () => {
			allowMultiGamepads = Boolean(multiPadsChk.checked);
			localStorage.setItem('allowMultiGamepads', String(allowMultiGamepads));
			// reset edge tracking when switching modes
			prevAnyButtonStates = [];
			prevButtonStates = [];
		});
	}
	// Ignore black bars in stats toggle button
	function updateIgnoreBlackBtn() {
		if (!ignoreBlackBtn) return;
		ignoreBlackBtn.textContent = `Ignore Black Bars: ${ignoreBlackBars ? 'On' : 'Off'}`;
	}
	ignoreBlackBtn?.addEventListener('click', () => {
		ignoreBlackBars = !ignoreBlackBars;
		localStorage.setItem('ignoreBlackBars', String(ignoreBlackBars));
		updateIgnoreBlackBtn();
		render();
	});
	updateIgnoreBlackBtn();
	// Scroll wheel toggle
	scrollWheelBtn?.addEventListener('click', () => {
		scrollWheelMode = !scrollWheelMode;
		localStorage.setItem('scrollWheelMode', String(scrollWheelMode));
		updateScrollWheelBtn();
	});
	updateScrollWheelBtn();

	// Unbind all binds
	function unbindAll() {
		// Gamepad
		tapButtonIndex = -1;
		restartButtonIndex = -1;
		audioButtonIndex = -1;
		localStorage.removeItem('tapButtonIndex');
		localStorage.removeItem('restartButtonIndex');
		localStorage.removeItem('audioButtonIndex');
		// KB/M
		kbmTapButton = -1;
		kbmRestartButton = -1;
		kbmTapKey = '';
		kbmRestartKey = '';
		kbmTapBindType = '';
		kbmRestartBindType = '';
		kbmAudioButton = -1;
		kbmAudioKey = '';
		kbmAudioBindType = '';
		localStorage.removeItem('kbmTapButton');
		localStorage.removeItem('kbmRestartButton');
		localStorage.removeItem('kbmTapKey');
		localStorage.removeItem('kbmRestartKey');
		localStorage.removeItem('kbmTapBindType');
		localStorage.removeItem('kbmRestartBindType');
		localStorage.removeItem('kbmAudioButton');
		localStorage.removeItem('kbmAudioKey');
		localStorage.removeItem('kbmAudioBindType');
		// Exit binding mode and refresh labels
		bindingMode = null;
		bindTapBtn?.classList.remove('active');
		bindRestartBtn?.classList.remove('active');
		bindAudioBtn?.classList.remove('active');
		updateBindingLabels();
		setBindingUIState(false);
	}
	unbindBtn?.addEventListener('click', unbindAll);

	// KB/M input handling
	// Linktree modal handlers
	function openLinktree() {
		if (!linktreeOverlay) return;
		linktreeOverlay.classList.remove('closing');
		linktreeOverlay.classList.add('open');
		linktreeOverlay.setAttribute('aria-hidden', 'false');
	}
	function closeLinktree() {
		if (!linktreeOverlay) return;
		// Play closing animation, then hide
		linktreeOverlay.classList.remove('open');
		linktreeOverlay.classList.add('closing');
		const done = () => {
			linktreeOverlay?.classList.remove('closing');
			linktreeOverlay?.setAttribute('aria-hidden', 'true');
		};
		// Fallback timer in case animationend isn't fired
		let timeoutId = setTimeout(done, 300);
		linktreeOverlay.addEventListener('animationend', function handler(e) {
			if (e.target !== linktreeOverlay.querySelector('.lt-sheet')) return;
			clearTimeout(timeoutId);
			linktreeOverlay.removeEventListener('animationend', handler);
			done();
		});
	}
	fancyDuckLink?.addEventListener('click', (e) => {
		e.preventDefault();
		openLinktree();
	});
	madeByAvatar?.addEventListener('click', (e) => {
		e.preventDefault();
		openLinktree();
	});
	linktreeOverlay?.addEventListener('click', (e) => {
		if (e.target === linktreeOverlay) closeLinktree();
	});
	madeByContainer?.addEventListener('click', (e) => {
		e.preventDefault();
		openLinktree();
	});

	// About modal handlers
	function openAbout() {
		if (!aboutOverlay) return;
		aboutOverlay.classList.remove('closing');
		aboutOverlay.classList.add('open');
		aboutOverlay.setAttribute('aria-hidden', 'false');
	}
	function closeAbout() {
		if (!aboutOverlay) return;
		aboutOverlay.classList.remove('open');
		aboutOverlay.classList.add('closing');
		const done = () => {
			aboutOverlay?.classList.remove('closing');
			aboutOverlay?.setAttribute('aria-hidden', 'true');
		};
		let timeoutId = setTimeout(done, 300);
		aboutOverlay.addEventListener('animationend', function handler(e) {
			if (e.target !== aboutOverlay.querySelector('.lt-sheet')) return;
			clearTimeout(timeoutId);
			aboutOverlay.removeEventListener('animationend', handler);
			done();
		});
	}
	aboutBtn?.addEventListener('click', openAbout);
	aboutOverlay?.addEventListener('click', (e) => {
		if (e.target === aboutOverlay) closeAbout();
	});

	// KB/M warning modal handlers
	function openKbmWarn() {
		if (!kbmWarnOverlay) return;
		kbmWarnOverlay.classList.remove('closing');
		kbmWarnOverlay.classList.add('open');
		kbmWarnOverlay.setAttribute('aria-hidden', 'false');
	}
	function shakeKbmWarn() {
		if (!kbmWarnOverlay) return;
		const inner = kbmWarnOverlay.querySelector('.kbm-warn-inner');
		if (!inner) return;
		inner.classList.remove('shake');
		// Force reflow so the animation can retrigger
		void inner.offsetWidth;
		inner.classList.add('shake');
		inner.addEventListener('animationend', () => inner.classList.remove('shake'), { once: true });
	}
	function closeKbmWarn() {
		if (!kbmWarnOverlay) return;
		kbmWarnOverlay.classList.remove('open');
		kbmWarnOverlay.classList.add('closing');
		const done = () => {
			kbmWarnOverlay?.classList.remove('closing');
			kbmWarnOverlay?.setAttribute('aria-hidden', 'true');
		};
		let timeoutId = setTimeout(done, 300);
		kbmWarnOverlay.addEventListener('animationend', function handler(e) {
			if (e.target !== kbmWarnOverlay.querySelector('.lt-sheet')) return;
			clearTimeout(timeoutId);
			kbmWarnOverlay.removeEventListener('animationend', handler);
			done();
		});
	}
	kbmWarnOverlay?.addEventListener('click', (e) => {
		// Clicking outside should not close; it should shake until acknowledged.
		if (e.target === kbmWarnOverlay) shakeKbmWarn();
	});
	kbmWarnOkBtn?.addEventListener('click', () => closeKbmWarn());

	// Welcome modal handlers (open on load, close on first gamepad press)
	function openWelcome() {
		if (!welcomeOverlay) return;
		welcomeOverlay.classList.remove('closing');
		welcomeOverlay.classList.add('open');
		welcomeOverlay.setAttribute('aria-hidden', 'false');
		// Initialize welcome video volume on open
		if (welcomeVideo) {
			try { welcomeVideo.volume = 0.35; } catch {}
			// Attempt autoplay with sound; fall back to muted autoplay if blocked
			try {
				welcomeVideo.muted = false;
				const p = welcomeVideo.play();
				if (p && typeof p.then === 'function') {
					p.catch(() => {
						try {
							welcomeVideo.muted = true;
							welcomeVideo.play().catch(() => {});
						} catch {}
					});
				}
			} catch {
				try {
					welcomeVideo.muted = true;
					welcomeVideo.play().catch(() => {});
				} catch {}
			}
		}
	}
	// Click outside welcome: set KB/M input mode and close
	welcomeOverlay?.addEventListener('click', (e) => {
		// Clicking outside the welcome sheet should only close it (do not auto-switch input modes)
		if (e.target === welcomeOverlay) closeWelcome();
	});
	function closeWelcome() {
		if (!welcomeOverlay) return;
		welcomeOverlay.classList.remove('open');
		welcomeOverlay.classList.add('closing');
		// Stop and reset video when closing
		if (welcomeVideo) {
			try { welcomeVideo.pause(); } catch {}
			try { welcomeVideo.currentTime = 0; } catch {}
		}
		const done = () => {
			welcomeOverlay?.classList.remove('closing');
			welcomeOverlay?.setAttribute('aria-hidden', 'true');
		};
		let timeoutId = setTimeout(done, 300);
		welcomeOverlay.addEventListener('animationend', function handler(e) {
			if (e.target !== welcomeOverlay.querySelector('.lt-sheet')) return;
			clearTimeout(timeoutId);
			welcomeOverlay.removeEventListener('animationend', handler);
			done();
		});
	}
	function handleWheel(e) {
		// Treat as tap whenever scroll wheel mode is enabled (independent of KB/M mode)
		if (!scrollWheelMode) return;
		// Treat this event as a tap
		e.preventDefault();
		joyAutoCapture = true;
		if (!isRunning) start();
		if (isRunning) {
			const now = performance.now();
			if (startTimeMs == null) startTimeMs = now;
			pressTimes.push(now - startTimeMs);
			render();
			maybePlayTapSound();
		}
	}
	function handleMouseDown(e) {
		if (!kbmMode) return;
		// When not binding, ignore clicks on interactive UI so they don't trigger actions
		if (!bindingMode && e.target && (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('.lt-sheet'))) {
			return;
		}
		// Rebinding
		if (bindingMode) {
			const btn = e.button;
			if (bindingMode === 'tap') {
				kbmTapBindType = 'mouse';
				localStorage.setItem('kbmTapBindType', 'mouse');
				kbmTapButton = btn;
				localStorage.setItem('kbmTapButton', String(btn));
				// Exclusivity: clear key bind
				kbmTapKey = '';
				localStorage.removeItem('kbmTapKey');
			} else if (bindingMode === 'restart') {
				kbmRestartBindType = 'mouse';
				localStorage.setItem('kbmRestartBindType', 'mouse');
				kbmRestartButton = btn;
				localStorage.setItem('kbmRestartButton', String(btn));
				// Exclusivity: clear key bind
				kbmRestartKey = '';
				localStorage.removeItem('kbmRestartKey');
			} else if (bindingMode === 'audio') {
				kbmAudioBindType = 'mouse';
				localStorage.setItem('kbmAudioBindType', 'mouse');
				kbmAudioButton = btn;
				localStorage.setItem('kbmAudioButton', String(btn));
				// Exclusivity: clear key bind
				kbmAudioKey = '';
				localStorage.removeItem('kbmAudioKey');
			}
			bindingMode = null;
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			bindAudioBtn?.classList.remove('active');
			updateBindingLabels();
			setBindingUIState(false);
			e.preventDefault();
			return;
		}
		// Actions
		if (kbmRestartBindType === 'mouse' && e.button === kbmRestartButton) {
			e.preventDefault();
			reset(false);
			start();
			return;
		}
		if (kbmAudioBindType === 'mouse' && e.button === kbmAudioButton) {
			e.preventDefault();
			if (interval85Id) stop85Loop(); else start85Loop();
			return;
		}
		if (kbmTapBindType === 'mouse' && e.button === kbmTapButton) {
			e.preventDefault();
		joyAutoCapture = true;
			if (!isRunning) start();
			if (isRunning) {
				const now = performance.now();
				if (startTimeMs == null) startTimeMs = now;
				pressTimes.push(now - startTimeMs);
				render();
				maybePlayTapSound();
			}
			return;
		}
	}
	window.addEventListener('mousedown', handleMouseDown, true);
	window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
	// Disable context menu while in KB/M mode to let right-click be a clean bind/action
	window.addEventListener('contextmenu', (e) => {
		if (kbmMode) e.preventDefault();
	});
	// Toggle mute/unmute on video click without pausing playback
	welcomeVideo?.addEventListener('click', (e) => {
		e.stopPropagation();
		e.preventDefault();
		try {
			// If muted (or volume 0), unmute and ensure it keeps playing
			if (welcomeVideo.muted || welcomeVideo.volume === 0) {
				welcomeVideo.muted = false;
				try { welcomeVideo.volume = 0.35; } catch {}
				welcomeVideo.play().catch(() => {});
			} else {
				// Otherwise mute, but do not pause
				welcomeVideo.muted = true;
			}
		} catch {}
	});

	// Any key press while welcome is open switches to KB/M and closes
	window.addEventListener('keydown', (e) => {
		if (welcomeOverlay && welcomeOverlay.classList.contains('open')) {
			kbmMode = true;
			localStorage.setItem('kbmMode', 'true');
			updateInputModeButton();
			updatePadNameDisplay();
			updateBindingLabels();
			closeWelcome();
		}
	}, true);

	function handleKeyDown(e) {
		if (!kbmMode) return;
		if (ignoreNextKeyBindPress) {
			ignoreNextKeyBindPress = false;
			return;
		}
		if (e.repeat) return;
		const code = e.code;
		// Rebinding
		if (bindingMode) {
			if (bindingMode === 'tap') {
				kbmTapBindType = 'key';
				localStorage.setItem('kbmTapBindType', 'key');
				kbmTapKey = code;
				localStorage.setItem('kbmTapKey', code);
				// Exclusivity: clear mouse bind
				kbmTapButton = -1;
				localStorage.removeItem('kbmTapButton');
			} else if (bindingMode === 'restart') {
				kbmRestartBindType = 'key';
				localStorage.setItem('kbmRestartBindType', 'key');
				kbmRestartKey = code;
				localStorage.setItem('kbmRestartKey', code);
				// Exclusivity: clear mouse bind
				kbmRestartButton = -1;
				localStorage.removeItem('kbmRestartButton');
			} else if (bindingMode === 'audio') {
				kbmAudioBindType = 'key';
				localStorage.setItem('kbmAudioBindType', 'key');
				kbmAudioKey = code;
				localStorage.setItem('kbmAudioKey', code);
				// Exclusivity: clear mouse bind
				kbmAudioButton = -1;
				localStorage.removeItem('kbmAudioButton');
			}
			bindingMode = null;
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			bindAudioBtn?.classList.remove('active');
			updateBindingLabels();
			setBindingUIState(false);
			e.preventDefault();
			return;
		}
		// Actions
		if (kbmRestartBindType === 'key' && code && kbmRestartKey && code === kbmRestartKey) {
			e.preventDefault();
			reset(false);
			start();
			return;
		}
		if (kbmAudioBindType === 'key' && code && kbmAudioKey && code === kbmAudioKey) {
			e.preventDefault();
			if (interval85Id) stop85Loop(); else start85Loop();
			return;
		}
		if (kbmTapBindType === 'key' && code && kbmTapKey && code === kbmTapKey) {
			e.preventDefault();
			joyAutoCapture = true;
			if (!isRunning) start();
			if (isRunning) {
				const now = performance.now();
				if (startTimeMs == null) startTimeMs = now;
				pressTimes.push(now - startTimeMs);
				render();
				maybePlayTapSound();
			}
			return;
		}
	}
	window.addEventListener('keydown', handleKeyDown, true);

	// Sound toggle + benchmark controls
	function updateSoundToggle() {
		if (!toggleSoundBtn) return;
		toggleSoundBtn.textContent = `Tap Sound: ${tapSoundEnabled ? 'On' : 'Off'}`;
	}
	toggleSoundBtn?.addEventListener('click', () => {
		tapSoundEnabled = !tapSoundEnabled;
		updateSoundToggle();
		ensureAudio();
	});
	updateSoundToggle();

	play85Btn?.addEventListener('click', () => {
		start85Loop();
	});

	// Overlay window (Document Picture-in-Picture when available)
	async function openOverlay() {
		try {
			if ('documentPictureInPicture' in window && documentPictureInPicture?.requestWindow) {
				const pipWin = await documentPictureInPicture.requestWindow({
					width: 640,
					height: 520
				});
				setupOverlayWindow(pipWin);
			} else {
				const w = window.open('', 'tap_overlay', 'width=640,height=520,toolbar=no,menubar=no,location=no,status=no,scrollbars=no,resizable=yes');
				if (!w) return;
				setupOverlayWindow(w);
				// Best-effort adjust after content is written
				try { w.resizeTo(640, 520); } catch {}
			}
		} catch (e) {
			console.error('Overlay failed', e);
		}
	}

	function setupOverlayWindow(w) {
		overlayWin = w;
		const doc = w.document;
		doc.open();
		doc.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tap Overlay</title>
		<link rel="preconnect" href="https://fonts.googleapis.com">
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
		<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
		<style>
			*, *::before, *::after { box-sizing: border-box; }
			:root {
				--bg-1: #0f1226;
				--bg-2: #121a3a;
				--card: rgba(255, 255, 255, 0.07);
				--card-stroke: rgba(255, 255, 255, 0.12);
				--text: #eaf1ff;
				--muted: #a8b2d8;
				--good: #37e0a2;
				--bad: #ff647c;
				--warn: #ffd166;
			}
			html, body { margin:0; padding:0; background: linear-gradient(135deg, var(--bg-1), var(--bg-2)); color: var(--text); font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; overflow: hidden; }
			.wrap { padding: 10px; }
			.card {
				background: var(--card);
				border: 1px solid var(--card-stroke);
				border-radius: 14px;
				padding: 10px;
				box-shadow: 0 10px 30px rgba(0,0,0,0.35);
			}
			.title { margin: 0 0 6px 0; font-size: 14px; font-weight: 800; letter-spacing: -0.01em; color: var(--text); }
			.bar-chart { position: relative; height: 200px; width: 100%; display: flex; align-items: flex-end; gap: 8px; padding: 10px; border-radius: 10px; border: 1px dashed rgba(255,255,255,0.15); background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); overflow: hidden; }
			.bar { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; width: 20px; min-width:20px; border-radius:6px; }
			.bar .col { width:100%; border-radius:6px; background: linear-gradient(180deg, rgba(90,230,180,0.9), rgba(40,170,120,0.9)); box-shadow: 0 6px 16px rgba(55,224,162,0.30); }
			.bar.yellow .col { background: linear-gradient(180deg, rgba(255, 220, 120, 0.9), rgba(230, 160, 40, 0.9)); box-shadow: 0 6px 16px rgba(255, 210, 100, 0.30); }
			.bar.red .col { background: linear-gradient(180deg, rgba(255, 120, 140, 0.8), rgba(200, 30, 60, 0.8)); box-shadow: 0 6px 16px rgba(255, 70, 100, 0.30); }
			.bar.black .col { background: linear-gradient(180deg, rgba(20,20,24,0.95), rgba(8,8,12,0.95)); box-shadow: 0 6px 16px rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); }
			.bar .label { margin-top:4px; font-size: 10px; color: var(--muted); }
			.stats { margin-top: 8px; font-weight: 700; font-size: 13px; text-align: center; color: var(--text); }
			.vj-ov { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:10px; }
			.vj-base-ov { position: relative; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); box-shadow: inset 0 0 8px rgba(0,0,0,0.25); }
			.vj-stick-ov { position:absolute; width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(180deg, rgba(130,220,255,0.9), rgba(90,190,255,0.7)); border: 1px solid rgba(255,255,255,0.25); left: 48px; top: 48px; pointer-events:none; transition: transform 0.03s linear; }
			.vj-avg-ov { font-size: 11px; color: var(--muted); }
		</style></head><body>
		<div class="wrap">
			<div class="card">
				<div id="overlayBars" class="bar-chart"></div>
				<div id="overlayStats" class="stats">—</div>
				<div class="vj-ov">
					<div class="vj-base-ov"><div id="ovJoyStick" class="vj-stick-ov"></div></div>
					<canvas id="ovHeat" width="120" height="120" style="border:1px solid rgba(255,255,255,0.15); border-radius:8px; background: rgba(255,255,255,0.03)"></canvas>
				</div>
				<div id="ovJoyAvg" class="vj-avg-ov" style="text-align:center; margin-top:6px;">Avg X: 0.00  •  Avg Y: 0.00</div>
			</div>
		</div>
		</body></html>`);
		doc.close();
		overlayBarsEl = doc.getElementById('overlayBars');
		overlayStatsEl = doc.getElementById('overlayStats');
		overlayHeatCanvasEl = doc.getElementById('ovHeat');
		overlayJoyStickEl = doc.getElementById('ovJoyStick');
		overlayJoyAvgEl = doc.getElementById('ovJoyAvg');
		// Mirror KB/M listeners within overlay window as well
		try {
			w.addEventListener('mousedown', handleMouseDown, true);
			w.addEventListener('keydown', handleKeyDown, true);
			w.addEventListener('wheel', handleWheel, { capture: true, passive: false });
			// Any interaction inside the overlay should bring the main window to the foreground
			const refocusParent = () => {
				try { window.focus(); } catch {}
				try { w.opener && w.opener.focus(); } catch {}
			};
			w.addEventListener('mousedown', refocusParent, true);
			w.addEventListener('pointerdown', refocusParent, true);
			w.addEventListener('keydown', refocusParent, true);
			w.addEventListener('contextmenu', (e) => {
				if (kbmMode) e.preventDefault();
			});
		} catch {}
		w.addEventListener('beforeunload', () => {
			overlayWin = null;
			overlayBarsEl = null;
			overlayStatsEl = null;
		});
		// Initial paint
		render();
		// After initial render, size the overlay window so the bottom edge hugs the card bottom
		try {
			const adjust = () => {
				const card = doc.querySelector('.card');
				if (!card) return;
				const cardRect = card.getBoundingClientRect();
				const chrome = (w.outerHeight && w.innerHeight) ? (w.outerHeight - w.innerHeight) : 0;
				const desiredHeight = Math.ceil(cardRect.bottom + chrome);
				const desiredWidth = Math.max(640, w.outerWidth || 640);
				if (typeof w.resizeTo === 'function') {
					w.resizeTo(desiredWidth, desiredHeight);
				}
			};
			// Run after layout settles
			w.requestAnimationFrame?.(adjust);
			setTimeout(adjust, 50);
		} catch {}
	}

	function renderOverlay(values, inProgressLast, avgPair, avgBetween) {
		if (!overlayWin || !overlayBarsEl) return;
		renderBarsInto(overlayBarsEl, values, inProgressLast);
		if (overlayStatsEl) overlayStatsEl.textContent = `Avg: ${avgPair == null ? '—' : Math.round(avgPair) + ' ms'}  •  AvgBDTP: ${avgBetween == null ? '—' : Math.round(avgBetween) + ' ms'}`;
	}

	openOverlayBtn?.addEventListener('click', openOverlay);
	stop85Btn?.addEventListener('click', () => {
		stop85Loop();
	});

	// Initialize and handle inputs for benchmark
	function syncAudioInputs() {
		if (gapMsInput) gapMsInput.value = String(benchGapMs || DEFAULT_GAP_MS);
		if (seriesInput) seriesInput.value = String(benchSeries || DEFAULT_SERIES);
	}
	syncAudioInputs();
	gapMsInput?.addEventListener('change', () => {
		const v = Math.max(1, Math.min(5000, Math.round(Number(gapMsInput.value) || DEFAULT_GAP_MS)));
		benchGapMs = v;
		localStorage.setItem('benchGapMs', String(v));
		restart85IfPlaying();
		syncAudioInputs();
	});
	seriesInput?.addEventListener('change', () => {
		const v = Math.max(1, Math.min(32, Math.round(Number(seriesInput.value) || DEFAULT_SERIES)));
		benchSeries = v;
		localStorage.setItem('benchSeries', String(v));
		restart85IfPlaying();
		syncAudioInputs();
	});
})(); 


