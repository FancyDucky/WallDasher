(() => {
	// Configuration
	const THRESHOLD_MS = 85; // Bars become red if interval > THRESHOLD_MS
	const DEFAULT_TAP_INDEX = 0; // A / Cross
	const DEFAULT_RESTART_INDEX = 1; // B / Circle
	const DEFAULT_KBM_TAP = 0; // Left click
	const DEFAULT_KBM_RESTART = 2; // Right click

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
	const bindTapText = document.getElementById('bindTapText');
	const bindRestartText = document.getElementById('bindRestartText');
	const toggleSoundBtn = document.getElementById('toggleSoundBtn');
	const play85Btn = document.getElementById('play85Btn');
	const stop85Btn = document.getElementById('stop85Btn');
	const gapMsInput = document.getElementById('gapMsInput');
	const seriesInput = document.getElementById('seriesInput');
	const openOverlayBtn = document.getElementById('openOverlayBtn');
	const kbmModeBtn = document.getElementById('kbmModeBtn');
	const multiPadsChk = document.getElementById('multiPadsChk');
	const scrollWheelBtn = document.getElementById('scrollWheelBtn');
	const fancyDuckLink = document.getElementById('fancyDuckLink');
	const linktreeOverlay = document.getElementById('linktreeOverlay');
	const madeByAvatar = document.querySelector('.made-by-avatar');
	const aboutBtn = document.getElementById('aboutBtn');
	const aboutOverlay = document.getElementById('aboutOverlay');

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
	let bindingMode = null; // 'tap' | 'restart' | null
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
	let inputPollId = 0; // high-frequency input polling for gamepad
	let allowMultiGamepads = localStorage.getItem('allowMultiGamepads') === 'true';
	let prevAnyButtonStates = [];
	let scrollWheelMode = localStorage.getItem('scrollWheelMode') === 'true';

	// Overlay
	let overlayWin = null;
	let overlayBarsEl = null;
	let overlayStatsEl = null;

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

	function updateScrollWheelBtn() {
		if (!scrollWheelBtn) return;
		scrollWheelBtn.textContent = `Scroll Wheel: ${scrollWheelMode ? 'On' : 'Off'}`;
	}

	function updateBindingLabels() {
		const tapName = kbmMode
			? [mouseButtonIndexToName(kbmTapButton), keyCodeToName(kbmTapKey)].filter(Boolean).join(', ')
			: buttonIndexToName(tapButtonIndex, lastMapping);
		const restartName = kbmMode
			? [mouseButtonIndexToName(kbmRestartButton), keyCodeToName(kbmRestartKey)].filter(Boolean).join(', ')
			: buttonIndexToName(restartButtonIndex, lastMapping);
		if (tapButtonLabelEl) tapButtonLabelEl.textContent = `${tapName} (${tapButtonIndex})`;
		if (restartButtonLabelEl) restartButtonLabelEl.textContent = `${restartName} (${restartButtonIndex})`;
		if (bindTapText) bindTapText.textContent = kbmMode ? `${tapName || 'Unbound'}` : `${tapName} (${tapButtonIndex})`;
		if (bindRestartText) bindRestartText.textContent = kbmMode ? `${restartName || 'Unbound'}` : `${restartName} (${restartButtonIndex})`;
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
		// Match bar coloring thresholds
		if (intervalMs > 150) return 600; // black → even lower
		if (intervalMs > 100) return 800; // red → lower
		if (intervalMs >= 86) return 1000; // yellow → as is now
		return 1200; // ok/green → slightly higher
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
		const lastPair = pairIntervals.length ? pairIntervals[pairIntervals.length - 1] : null;
		const bestPair = pairIntervals.length ? Math.min(...pairIntervals) : null;
		const worstPair = pairIntervals.length ? Math.max(...pairIntervals) : null;

		// Average double-tap speed (pairwise)
		const avgPair = average(pairIntervals);
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
			if (v > 150) cls = 'black';
			else if (v > 100) cls = 'red';
			else if (v >= 86) cls = 'yellow';

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
		if (kbmMode) return; // mouse/keyboard are event-driven
		if (allowMultiGamepads) {
			const pads = (navigator.getGamepads?.() || []).filter(Boolean);
			if (!pads.length) {
				padNameEl.textContent = 'Not connected';
				prevAnyButtonStates = [];
				return;
			}
			padNameEl.textContent = pads.length > 1 ? 'Multiple gamepads' : (pads[0].id || 'Gamepad 0');
			// OR buttons across all pads
			let maxButtons = 0;
			for (const p of pads) maxButtons = Math.max(maxButtons, (p.buttons || []).length);
			const currAny = new Array(maxButtons).fill(false);
			for (const p of pads) {
				const buttons = p.buttons || [];
				for (let i = 0; i < buttons.length; i++) {
					const pressed = Boolean(buttons[i] && (buttons[i].pressed || buttons[i].value > 0.5));
					if (pressed) currAny[i] = true;
				}
			}
			if (prevAnyButtonStates.length !== currAny.length) {
				prevAnyButtonStates = new Array(currAny.length).fill(false);
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
						}
						bindingMode = null;
						bindTapBtn?.classList.remove('active');
						bindRestartBtn?.classList.remove('active');
						updateBindingLabels();
						break;
					}
				}
			}
			// Actions on rising edges
			if (currAny[restartButtonIndex] && !prevAnyButtonStates[restartButtonIndex]) {
				reset(false);
				start();
			}
			if (currAny[tapButtonIndex] && !prevAnyButtonStates[tapButtonIndex]) {
				if (!isRunning) start();
				if (isRunning) {
					const now = performance.now();
					if (startTimeMs == null) startTimeMs = now;
					pressTimes.push(now - startTimeMs);
					render();
					maybePlayTapSound();
				}
			}
			prevAnyButtonStates = currAny;
		} else {
			const gp = getActiveGamepad();
			if (gp) {
				padNameEl.textContent = gp.id || `Gamepad ${activeGamepadIndex}`;
				lastMapping = gp.mapping || 'standard';
				const buttons = gp.buttons || [];
				const currPressed = buttons.map((b) => Boolean(b && (b.pressed || b.value > 0.5)));
				if (prevButtonStates.length !== currPressed.length) {
					prevButtonStates = new Array(currPressed.length).fill(false);
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
							}
							bindingMode = null;
							bindTapBtn?.classList.remove('active');
							bindRestartBtn?.classList.remove('active');
							updateBindingLabels();
							break;
						}
					}
				}
				// Actions
				if (currPressed[restartButtonIndex] && !prevButtonStates[restartButtonIndex]) {
					reset(false);
					start();
				}
				if (currPressed[tapButtonIndex] && !prevButtonStates[tapButtonIndex]) {
					if (!isRunning) start();
					if (isRunning) {
						const now = performance.now();
						if (startTimeMs == null) startTimeMs = now;
						pressTimes.push(now - startTimeMs);
						render();
						maybePlayTapSound();
					}
				}
				prevButtonStates = currPressed;
			} else {
				padNameEl.textContent = 'Not connected';
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
		padNameEl.textContent = gp.id || `Gamepad ${gp.index}`;
		lastMapping = gp.mapping || 'standard';
		updateBindingLabels();
	});
	window.addEventListener('gamepaddisconnected', () => {
		padNameEl.textContent = 'Not connected';
	});

	// Initial render
	render();
	// Always run RAF so A/B presses are recognized for start/restart
	rafId = requestAnimationFrame(tick);
	// Re-render on resize to adjust sliding window capacity
	window.addEventListener('resize', render);

	// Binding buttons
	function toggleBinding(which) {
		if (bindingMode === which) {
			bindingMode = null;
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			updateBindingLabels();
			return;
		}
		bindingMode = which;
		if (which === 'tap') {
			bindTapBtn?.classList.add('active');
			bindRestartBtn?.classList.remove('active');
			if (bindTapText) bindTapText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press a gamepad button...';
		} else if (which === 'restart') {
			bindRestartBtn?.classList.add('active');
			bindTapBtn?.classList.remove('active');
			if (bindRestartText) bindRestartText.textContent = kbmMode ? 'Click a mouse button or press a key...' : 'Press a gamepad button...';
		}
		// Prevent the very click that enabled binding from being captured as the bind in KB/M
		ignoreNextMouseBindClick = true;
		ignoreNextKeyBindPress = true;
	}
	bindTapBtn?.addEventListener('click', () => toggleBinding('tap'));
	bindRestartBtn?.addEventListener('click', () => toggleBinding('restart'));
	updateBindingLabels();

	// KB/M mode toggle
	kbmModeBtn?.addEventListener('click', () => {
		kbmMode = !kbmMode;
		localStorage.setItem('kbmMode', String(kbmMode));
		updateKbmModeBtn();
		updatePadNameDisplay();
		updateBindingLabels();
		// Switch polling based on mode
		if (kbmMode) {
			stopInputPolling();
		} else {
			startInputPolling();
		}
	});
	updateKbmModeBtn();
	updatePadNameDisplay();
	if (!kbmMode) startInputPolling();

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
	// Scroll wheel toggle
	scrollWheelBtn?.addEventListener('click', () => {
		scrollWheelMode = !scrollWheelMode;
		localStorage.setItem('scrollWheelMode', String(scrollWheelMode));
		updateScrollWheelBtn();
	});
	updateScrollWheelBtn();

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
	function handleWheel(e) {
		// Treat as tap whenever scroll wheel mode is enabled (independent of KB/M mode)
		if (!scrollWheelMode) return;
		// Treat this event as a tap
		e.preventDefault();
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
		// Avoid using the initial click that toggled binding mode
		if (ignoreNextMouseBindClick) {
			ignoreNextMouseBindClick = false;
			return;
		}
		// Rebinding
		if (bindingMode) {
			const btn = e.button;
			if (bindingMode === 'tap') {
				kbmTapButton = btn;
				localStorage.setItem('kbmTapButton', String(btn));
			} else if (bindingMode === 'restart') {
				kbmRestartButton = btn;
				localStorage.setItem('kbmRestartButton', String(btn));
			}
			bindingMode = null;
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			updateBindingLabels();
			e.preventDefault();
			return;
		}
		// Actions
		if (e.button === kbmRestartButton) {
			e.preventDefault();
			reset(false);
			start();
			return;
		}
		if (e.button === kbmTapButton) {
			e.preventDefault();
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
				kbmTapKey = code;
				localStorage.setItem('kbmTapKey', code);
			} else if (bindingMode === 'restart') {
				kbmRestartKey = code;
				localStorage.setItem('kbmRestartKey', code);
			}
			bindingMode = null;
			bindTapBtn?.classList.remove('active');
			bindRestartBtn?.classList.remove('active');
			updateBindingLabels();
			e.preventDefault();
			return;
		}
		// Actions
		if (code && kbmRestartKey && code === kbmRestartKey) {
			e.preventDefault();
			reset(false);
			start();
			return;
		}
		if (code && kbmTapKey && code === kbmTapKey) {
			e.preventDefault();
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
					width: 420,
					height: 300
				});
				setupOverlayWindow(pipWin);
			} else {
				const w = window.open('', 'tap_overlay', 'width=420,height=300,toolbar=no,menubar=no,location=no,status=no,scrollbars=no,resizable=yes');
				if (!w) return;
				setupOverlayWindow(w);
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
		</style></head><body>
		<div class="wrap">
			<div class="card">
				<div id="overlayBars" class="bar-chart"></div>
				<div id="overlayStats" class="stats">—</div>
			</div>
		</div>
		</body></html>`);
		doc.close();
		overlayBarsEl = doc.getElementById('overlayBars');
		overlayStatsEl = doc.getElementById('overlayStats');
		// Mirror KB/M listeners within overlay window as well
		try {
			w.addEventListener('mousedown', handleMouseDown, true);
			w.addEventListener('keydown', handleKeyDown, true);
			w.addEventListener('wheel', handleWheel, { capture: true, passive: false });
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


