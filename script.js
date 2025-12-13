// Rocket League Speedflip Trainer
// Uses the browser Gamepad API and assumes default Xbox-style Rocket League bindings.

const STATE = {
  gamepadIndex: null,
  prevButtons: [],
  prevAxes: [],
  animationFrame: null,
  attempts: [], // history
  attemptCounter: 0,
  currentAttempt: null,
  bindingMode: null, // { actionKey: string }
  liveAngleDeg: null, // current dodge angle shown on gauge
  jumpGapAnim: {
    startTime: null,
    rafId: null,
    col: null,
    label: null,
  },
  config: {
    deadzone: 0.3,
    dodgeDeadzone: 0.5,
  },
  gamepadInfo: {
    isXbox: true,
    isPlayStation: false,
  },
  playback: {
    active: false,
    startedAt: 0,
    samples: [],
    duration: 0,
    lastIndex: -1,
    speedMultiplier: 1,
    lastJumpState: false,
    isPaused: true,
    elapsedAtPause: 0,
    atEnd: false,
  },
  pendingStickMarker: false,
};

// Default mapping for an Xbox-style controller with Rocket League default bindings
const MAPPING = {
  jumpButton: null,
  boostButton: null,
  neutralAirRollButton: null,
  dirAirRollLeftButton: null,
  dirAirRollRightButton: null,
  reverseButton: null,
  throttleButton: null,
  resetShotButton: null, // user bound; used to start attempts
  playbackToggleButton: null, // user bound; toggles playback
  playbackSpeedUpButton: null, // user bound; +10% speed
  playbackSpeedDownButton: null, // user bound; -10% speed
  leftStickXAxis: 0,
  leftStickYAxis: 1,
};

const BINDING_KEYS = [
  "resetShotButton",
  "jumpButton",
  "boostButton",
  "throttleButton",
  "reverseButton",
  "neutralAirRollButton",
  "dirAirRollLeftButton",
  "dirAirRollRightButton",
  "playbackToggleButton",
  "playbackSpeedUpButton",
  "playbackSpeedDownButton",
];

const CONSTANTS = {
  stickActiveThreshold: 0.2,
  flipCancelDownThreshold: 0.35, // stick y > this (down) counts as flip cancel
  settleMinMs: 150,
  maxHistory: 20,
  recordingMaxDurationMs: 6000, // cap recording length to 6s for playback
};

const PLAYBACK_MIN_PCT = 5;
const PLAYBACK_MAX_PCT = 100;

function $(id) {
  return document.getElementById(id);
}

const els = {
  gamepadStatus: $("gamepad-status"),
  attemptStatus: $("attempt-status"),
  startAttemptBtn: $("start-attempt-btn"),
  // current stats
  settleTime: $("stat-settle-time"),
  settleGrade: $("stat-settle-grade"),
  boostBeforeThrottle: $("stat-boost-before-throttle"),
  jumpDelayMs: $("stat-jump-delay-ms"),
  jumpDelayGrade: $("stat-jump-delay-grade"),
  angleDeg: $("stat-angle-deg"),
  angleGrade: $("stat-angle-grade"),
  jumpGapMs: $("stat-jump-gap-ms"),
  jumpGapGrade: $("stat-jump-gap-grade"),
  cancelMs: $("stat-cancel-ms"),
  cancelGrade: $("stat-cancel-grade"),
  overlaySettle: $("overlay-settle"),
  overlayBoost: $("overlay-boost"),
  overlayFirstJump: $("overlay-first-jump"),
  overlayAngle: $("overlay-angle"),
  overlayFlipCancel: $("overlay-flip-cancel"),
  jumpGapIndicator: $("jump-gap-indicator"),
  attemptHistory: $("attempt-history"),
  // live angle debug
  liveStickX: $("live-stick-x"),
  liveStickY: $("live-stick-y"),
  liveAngleDeg: $("live-angle-deg"),
  deadzoneSlider: $("deadzone-slider"),
  deadzoneValue: $("deadzone-value"),
  // timeline
  timelineCanvas: $("timeline-canvas"),
  // bindings
  bindingStatus: $("binding-status"),
  bindingResetLabel: $("binding-reset-label"),
  bindingJumpLabel: $("binding-jump-label"),
  bindingBoostLabel: $("binding-boost-label"),
  bindingThrottleLabel: $("binding-throttle-label"),
  bindingReverseLabel: $("binding-reverse-label"),
  bindingNeutralRollLabel: $("binding-neutral-roll-label"),
  bindingDirRollLeftLabel: $("binding-dir-roll-left-label"),
  bindingDirRollRightLabel: $("binding-dir-roll-right-label"),
  bindingPlaybackLabel: $("binding-playback-label"),
  bindingPlaybackUpLabel: $("binding-playback-up-label"),
  bindingPlaybackDownLabel: $("binding-playback-down-label"),
  // playback / overlay
  playbackToggleBtn: $("playback-toggle-btn"),
  playbackTimeline: $("playback-timeline"),
  playbackTimeLabel: $("playback-time-label"),
  timelineMarkers: $("timeline-markers"),
  playbackSpeedRange: $("playback-speed-range"),
  playbackSpeedValue: $("playback-speed-value"),
  overlayStick: $("overlay-stick"),
  stickMarkers: $("stick-markers"),
  popoutOverlayBtn: $("popout-overlay-btn"),
  controllerOverlay: $("controller-overlay"),
  angleNeedle: $("angle-needle"),
  angleTrack: document.querySelector(".angle-bar-track"),
  // modals
  linktreeOverlay: $("linktreeOverlay"),
  welcomeOverlay: $("welcomeOverlay"),
  welcomeVideo: $("welcomeVideo"),
  fancyDuckLink: $("fancyDuckLink"),
  madeByContainer: document.getElementById("made-by"),
  howToOverlay: $("howToOverlay"),
  howToBtn: $("howto-btn"),
};

function setBindingStatus(message) {
  if (els.bindingStatus) {
    els.bindingStatus.textContent = message;
  }
}

function setAttemptStatus(message, variantClass = "status-good") {
  const el = els.attemptStatus;
  if (!el) return;
  el.textContent = message;
  el.classList.remove("status-bad", "status-warn", "status-good");
  if (variantClass) el.classList.add(variantClass);
}

let timelineCtx = null;
let overlayPopout = null;

function ensurePopoutBaseTag(targetDoc) {
  try {
    const head = targetDoc.head || targetDoc.getElementsByTagName("head")[0];
    if (!head) return;
    // Avoid adding duplicates.
    if (head.querySelector("base")) return;
    const base = targetDoc.createElement("base");
    // Make relative URLs (style.css, Assets/...) resolve against the main document.
    base.href = document.baseURI || window.location.href;
    head.prepend(base);
  } catch {
    // ignore
  }
}

async function hydratePopoutStyles(targetDoc) {
  const head = targetDoc.head || targetDoc.getElementsByTagName("head")[0];
  if (!head) return;

  ensurePopoutBaseTag(targetDoc);

  // Avoid duplicating our injected CSS if the popout is reused.
  const styleId = "sf-popout-inline-css";
  if (head.querySelector(`#${styleId}`)) return;

  // Copy font links / preconnects (small + helps match main rendering).
  try {
    document
      .querySelectorAll(
        'link[rel="preconnect"], link[rel="dns-prefetch"], link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]'
      )
      .forEach((node) => head.appendChild(node.cloneNode(true)));
  } catch {
    // ignore
  }

  // Prefer inlining CSS on http(s) to avoid PiP/about:blank relative URL issues.
  const canFetch = /^https?:$/.test(window.location.protocol);
  if (canFetch) {
    try {
      const cssUrl = new URL("style.css", document.baseURI || window.location.href);
      const res = await fetch(cssUrl, { cache: "force-cache" });
      if (res.ok) {
        const cssText = await res.text();
        const styleEl = targetDoc.createElement("style");
        styleEl.id = styleId;
        styleEl.textContent = cssText;
        head.appendChild(styleEl);
        return;
      }
    } catch {
      // fall back below
    }
  }

  // Fallback: clone link/style nodes as-is.
  try {
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      head.appendChild(node.cloneNode(true));
    });
  } catch {
    // ignore
  }
}

function injectPopoutRefocusScript(targetDoc) {
  try {
    const head = targetDoc.head || targetDoc.getElementsByTagName("head")[0];
    if (!head) return;
    if (head.querySelector("#sf-popout-refocus-script")) return;
    const script = targetDoc.createElement("script");
    script.id = "sf-popout-refocus-script";
    // IMPORTANT: This script runs in the popout window's realm so the browser
    // treats the pointer/key events as user-activation within that window.
    script.textContent = `
      (() => {
        const refocus = () => {
          try { window.focus?.(); } catch {}
          try { window.opener?.focus?.(); } catch {}
        };
        window.addEventListener('pointerdown', refocus, true);
        window.addEventListener('mousedown', refocus, true);
        window.addEventListener('keydown', refocus, true);
      })();
    `;
    head.appendChild(script);
  } catch {
    // ignore
  }
}

function getPopoutCapabilityInfo() {
  const isSecure = Boolean(window.isSecureContext) || /^https:$/.test(window.location.protocol);
  const hasDocPiP = Boolean(window.documentPictureInPicture?.requestWindow);
  return { isSecure, hasDocPiP };
}

function explainPopoutLimitationsIfNeeded() {
  const { isSecure, hasDocPiP } = getPopoutCapabilityInfo();

  // The "always on top" behavior users expect is Document Picture-in-Picture.
  // In Chromium-based browsers this generally requires a secure context (HTTPS).
  if (!isSecure) {
    alert(
      "Pop Out Overlay note:\n\n" +
        "This page is not running over HTTPS. In Brave/Chrome, the always-on-top overlay (Picture-in-Picture) typically requires HTTPS.\n\n" +
        "Open the HTTPS version of this site (if available) to get the always-on-top overlay. Otherwise we'll fall back to a normal popup window."
    );
    return;
  }

  // Secure but no API: give the user a clue (Brave sometimes disables/flags features).
  if (isSecure && !hasDocPiP) {
    // Keep this as a non-blocking hint.
    console.warn(
      "Document Picture-in-Picture is not available in this browser/context; falling back to window popup."
    );
  }
}

function init() {
  window.addEventListener("gamepadconnected", (e) => {
    if (STATE.gamepadIndex === null) {
      STATE.gamepadIndex = e.gamepad.index;
      // IMPORTANT:
      // The first time many browsers surface a gamepad is *on the first button press*.
      // If we snapshot "prevButtons" from that event, the pressed button becomes "already pressed",
      // so edge detection won't fire until the *second* press. Initialize to all-zero so the
      // first press can be detected and used to close the welcome overlay immediately.
      STATE.prevButtons = e.gamepad.buttons.map(() => 0);
      STATE.prevAxes = e.gamepad.axes.slice();
      updateGamepadStatus(e.gamepad, true);
      startLoop();

      // Close welcome immediately on the first detected gamepad interaction.
      if (els.welcomeOverlay && els.welcomeOverlay.classList.contains("open")) {
        typeof STATE.closeWelcome === "function" && STATE.closeWelcome();
      }
    }
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    if (STATE.gamepadIndex === e.gamepad.index) {
      updateGamepadStatus(null, false);
      STATE.gamepadIndex = null;
      if (STATE.animationFrame != null) {
        cancelAnimationFrame(STATE.animationFrame);
        STATE.animationFrame = null;
      }
    }
  });

  if (els.startAttemptBtn) {
    els.startAttemptBtn.addEventListener("click", () => {
      startNewAttempt();
    });
  }

  // Load persisted config and bindings
  loadConfigFromStorage();
  loadBindingsFromStorage();

  // Bindings: press-to-bind flow
  document.querySelectorAll("[data-bind-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const actionKey = btn.getAttribute("data-bind-action");
      if (!actionKey) return;
      STATE.bindingMode = { actionKey };
      setBindingStatus(
        "Rebinding " +
          describeActionKey(actionKey) +
          ". Press the button you use for this action on your controller."
      );

      // Highlight active binding button
      document.querySelectorAll("[data-bind-action]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-bind-action") === actionKey);
      });
    });
  });

  // Deadzone sliders (Rocket League style)
  if (els.deadzoneSlider && els.deadzoneValue) {
    els.deadzoneSlider.value = Math.round(STATE.config.deadzone * 100);
    els.deadzoneValue.value = STATE.config.deadzone.toFixed(2);
    els.deadzoneSlider.addEventListener("input", () => {
      STATE.config.deadzone = Number(els.deadzoneSlider.value) / 100;
      els.deadzoneValue.value = STATE.config.deadzone.toFixed(2);
      saveConfigToStorage();
    });
    els.deadzoneValue.addEventListener("change", () => {
      let dz = parseFloat(els.deadzoneValue.value);
      if (!Number.isFinite(dz)) {
        dz = STATE.config.deadzone;
      }
      dz = Math.max(0, Math.min(1, dz));
      STATE.config.deadzone = dz;
      els.deadzoneValue.value = dz.toFixed(2);
      els.deadzoneSlider.value = String(Math.round(dz * 100));
      saveConfigToStorage();
    });
  }

  // Unbind all button
  const unbindAllBtn = document.getElementById("unbind-all-btn");
  if (unbindAllBtn) {
    unbindAllBtn.addEventListener("click", () => {
      MAPPING.resetShotButton = null;
      MAPPING.jumpButton = null;
      MAPPING.boostButton = null;
      MAPPING.throttleButton = null;
      MAPPING.reverseButton = null;
      MAPPING.neutralAirRollButton = null;
      MAPPING.dirAirRollLeftButton = null;
      MAPPING.dirAirRollRightButton = null;
      MAPPING.playbackSpeedUpButton = null;
      MAPPING.playbackSpeedDownButton = null;
      MAPPING.playbackToggleButton = null;
      setBindingStatus("All bindings cleared.");
      STATE.bindingMode = null;
      renderBindings();
      saveBindingsToStorage();
    });
  }

  // ESC while in binding mode: cancel & clear binding
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && STATE.bindingMode) {
      const { actionKey } = STATE.bindingMode;
      if (actionKey && actionKey in MAPPING) {
        MAPPING[actionKey] = null;
      }
      setBindingStatus("Binding for " + describeActionKey(actionKey) + " cleared.");
      STATE.bindingMode = null;
      renderBindings();
      document
        .querySelectorAll("[data-bind-action]")
        .forEach((b) => b.classList.remove("active"));
      saveBindingsToStorage();
    }
  });

  // Playback controls
  if (els.playbackToggleBtn) {
    els.playbackToggleBtn.addEventListener("click", () => togglePlayback());
  }
  if (els.playbackTimeline) {
    els.playbackTimeline.addEventListener("input", onPlaybackScrub);
  }
  setupPlaybackSpeedControls();

  if (els.popoutOverlayBtn) {
    els.popoutOverlayBtn.addEventListener("click", () => openOverlayPopout());
  }

  // Linktree / welcome modals
  setupModals();

  renderBindings();

  // Try to grab an already-connected gamepad (user may have pressed a button already)
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (gp) {
      STATE.gamepadIndex = gp.index;
      STATE.prevButtons = gp.buttons.map((b) => b.pressed || b.value > 0.5);
      STATE.prevAxes = gp.axes.slice();
      updateGamepadStatus(gp, true);
      startLoop();
      break;
    }
  }
}

function updateGamepadStatus(gamepad, connected) {
  if (!connected || !gamepad) {
    els.gamepadStatus.textContent = "Not connected";
    els.gamepadStatus.classList.remove("status-good");
    els.gamepadStatus.classList.add("status-bad");
    STATE.gamepadInfo.isXbox = true;
    STATE.gamepadInfo.isPlayStation = false;
    return;
  }
  els.gamepadStatus.textContent = gamepad.id || "Controller connected";
  els.gamepadStatus.classList.remove("status-bad");
  els.gamepadStatus.classList.add("status-good");

  const id = (gamepad.id || "").toLowerCase();
  const isXbox =
    id.includes("xbox") || id.includes("xinput") || id.includes("microsoft");
  const isPs =
    id.includes("dualshock") ||
    id.includes("dualsense") ||
    id.includes("playstation") ||
    id.includes("wireless controller") ||
    id.includes("sony");
  STATE.gamepadInfo.isXbox = isXbox || !isPs;
  STATE.gamepadInfo.isPlayStation = isPs;
  renderBindings();
}

function startLoop() {
  if (STATE.animationFrame != null) return;

  const loop = () => {
    STATE.animationFrame = requestAnimationFrame(loop);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = STATE.gamepadIndex != null ? pads[STATE.gamepadIndex] : null;
    if (!gp) return;
    processGamepad(gp);
  };

  loop();
}

function createEmptyAttempt() {
  const now = performance.now();
  STATE.attemptCounter += 1;
  return {
    id: STATE.attemptCounter,
    startedAt: now,
    firstInputTime: null,
    settleTime: null,
    boostOnTime: null,
    throttleOnTime: null,
    boostBeforeThrottle: null,
    firstJumpTime: null,
    secondJumpTime: null,
    jumpDelayMs: null,
    jumpDelayGrade: null,
    angleDeg: null,
    angleGrade: null,
    jumpGapMs: null,
    jumpGapGrade: null,
    flipCancelTime: null,
    flipCancelMs: null,
    flipCancelGrade: null,
    stickMarkerCount: 0,
    lastStick: { x: 0, y: 0, active: false },
    completed: false,
    samples: [], // timeline samples
  };
}

function startNewAttempt(failCarSettled = false) {
  // Optionally archive previous attempt if it had any data
  if (STATE.currentAttempt && !STATE.currentAttempt.completed) {
    finalizeAttempt(STATE.currentAttempt);
  }

  stopJumpGapAnimation();
  // Reset playback/timeline state so live view resumes
  stopPlayback(true);
  STATE.playback.samples = [];
  STATE.playback.duration = 0;
  STATE.playback.elapsedAtPause = 0;
  STATE.playback.lastIndex = -1;
  STATE.playback.lastJumpState = false;
  STATE.playback.isPaused = true;
  STATE.playback.active = false;
  updateTimelineMarkers();

  STATE.currentAttempt = createEmptyAttempt();
  if (failCarSettled && STATE.currentAttempt) {
    STATE.currentAttempt.firstInputTime = STATE.currentAttempt.startedAt;
    STATE.currentAttempt.settleTime = 0;
  }
  setAttemptStatus("Recording… (attempt " + STATE.currentAttempt.id + ")", "status-good");

  // Reset on-screen stats
  renderCurrentAttempt();
  // Clear overlay bar and angle markers for new attempt
  renderJumpGapGraph();
  clearAngleMarkers();
  clearStickMarkers();
  clearTimelineMarkers();
  STATE.pendingStickMarker = false;
}

function markInputSeen(type, time) {
  const att = STATE.currentAttempt;
  if (!att) return;

  if (att.firstInputTime == null) {
    att.firstInputTime = time;
    att.settleTime = time - att.startedAt;
  }

  if (type === "boost") {
    if (att.boostOnTime == null) {
      att.boostOnTime = time;
    }
  } else if (type === "throttle") {
    if (att.throttleOnTime == null) {
      att.throttleOnTime = time;
    }
    if (att.boostOnTime != null) {
      att.boostBeforeThrottle = att.boostOnTime <= att.throttleOnTime;
    } else {
      att.boostBeforeThrottle = false;
    }
  }
}

function onJumpPressed(time) {
  const att = STATE.currentAttempt;
  if (!att) return;

  markInputSeen("jump", time);
  // Place a marker at the current needle position when Jump is pressed
  if (STATE.liveAngleDeg != null && Number.isFinite(STATE.liveAngleDeg)) {
    addAngleMarker(STATE.liveAngleDeg);
  }

  if (att.firstJumpTime == null) {
    att.firstJumpTime = time;
    if (att.firstInputTime != null) {
      const dt = time - att.firstInputTime;
      att.jumpDelayMs = dt;
      att.jumpDelayGrade = gradeFirstInputToJump(dt);
    }
    startJumpGapAnimation(time);
  } else if (att.secondJumpTime == null) {
    att.secondJumpTime = time;
    // Angle at second jump (Rocket League dodge angle using deadzone + dodge deadzone)
    const { x, y } = att.lastStick; // x: raw, y: up-positive
    const mag = Math.hypot(x, y);
    if (mag >= CONSTANTS.stickActiveThreshold) {
      const gameVec = toGameCoordinatesRL(x, y, STATE.config.deadzone);
      const dodgeVec = toDodgeCoordinatesRL(
        gameVec.x,
        gameVec.y,
        STATE.config.dodgeDeadzone
      );
      const rlAngle = angleDodgeRL(dodgeVec);
      if (rlAngle != null) {
        const signed = rlAngle > 180 ? rlAngle - 360 : rlAngle;
        att.angleDeg = signed;
        att.angleGrade = gradeSpeedflipAngle(signed);
      } else {
        att.angleDeg = null;
        att.angleGrade = { label: "No dodge", level: "bad" };
      }
    } else {
      att.angleDeg = null;
      att.angleGrade = { label: "No stick input", level: "bad" };
    }

    if (att.firstJumpTime != null) {
      const gap = time - att.firstJumpTime;
      att.jumpGapMs = gap;
      att.jumpGapGrade = gradeJumpGap(gap);
      // Update double-jump graph live as soon as we have the gap
      stopJumpGapAnimation();
      renderJumpGapGraph();
    }
  }
}

function onFlipCancelDetected(time) {
  const att = STATE.currentAttempt;
  if (!att || att.secondJumpTime == null || att.flipCancelTime != null) return;

  att.flipCancelTime = time;
  const dt = time - att.secondJumpTime;
  att.flipCancelMs = dt;
  att.flipCancelGrade = gradeFlipCancel(dt);
}

function processGamepad(gp) {
  const now = performance.now();

  // Process buttons for edge detection
  const newPrevButtons = [];
  for (let i = 0; i < gp.buttons.length; i++) {
    const b = gp.buttons[i];
    const value = typeof b.value === "number" ? b.value : b.pressed ? 1 : 0;
    const pressed = b.pressed || value > 0.5;
    const prevValue = STATE.prevButtons[i] ?? 0;
    const wasPressed = prevValue > 0.5;

    if (pressed && !wasPressed) {
      // Close welcome overlay on first button press
      if (els.welcomeOverlay && els.welcomeOverlay.classList.contains("open")) {
        typeof STATE.closeWelcome === "function" && STATE.closeWelcome();
      }
      // If we're in binding mode, use the first button press for rebinding instead of gameplay
      if (STATE.bindingMode) {
        handleBindingButtonPress(i);
      } else {
        handleButtonDown(i, now, gp.buttons);
      }
    }

    newPrevButtons[i] = value;
  }

  // Process axes for stick movement and flip cancel
  const x = gp.axes[MAPPING.leftStickXAxis] || 0;
  const y = gp.axes[MAPPING.leftStickYAxis] || 0;

  const prevX = STATE.prevAxes[MAPPING.leftStickXAxis] ?? 0;
  const prevY = STATE.prevAxes[MAPPING.leftStickYAxis] ?? 0;

  const mag = Math.hypot(x, y);
  const prevMag = Math.hypot(prevX, prevY);
  const stickActive = mag >= CONSTANTS.stickActiveThreshold;
  const prevStickActive = prevMag >= CONSTANTS.stickActiveThreshold;

  // Live angle debug (Rocket League-style deadzone + dodge deadzone)
  const rawX = x;
  const rawYUp = -y; // invert: RL math expects +Y up
  const gameVec = toGameCoordinatesRL(rawX, rawYUp, STATE.config.deadzone);
  const dodgeVec = toDodgeCoordinatesRL(
    gameVec.x,
    gameVec.y,
    STATE.config.dodgeDeadzone
  );
  const rlDodgeAngle = angleDodgeRL(dodgeVec);
  const signedAngle =
    rlDodgeAngle != null
      ? rlDodgeAngle > 180
        ? rlDodgeAngle - 360
        : rlDodgeAngle
      : null;
  STATE.liveAngleDeg = signedAngle;

  els.liveStickX.textContent = "Raw X: " + rawX.toFixed(2);
  els.liveStickY.textContent = "Raw Y: " + rawYUp.toFixed(2);
  els.liveAngleDeg.textContent =
    signedAngle != null ? "Dodge angle: " + signedAngle.toFixed(1) + "°" : "Dodge angle: –";

  // Live overlay joystick & angle gauge when not in playback
  if (!STATE.playback.active && els.overlayStick) {
    const cx = Math.max(-1, Math.min(1, rawX));
    const cy = Math.max(-1, Math.min(1, rawYUp));
    const range = 60;
    els.overlayStick.style.transform = `translate(${(cx * range).toFixed(
      1
    )}px, ${(-cy * range).toFixed(1)}px`;
    setAngleGauge(signedAngle);
  }

  if (STATE.pendingStickMarker) {
    addStickMarker(rawX, rawYUp);
    STATE.pendingStickMarker = false;
  }

  if (STATE.currentAttempt) {
    const att = STATE.currentAttempt;
    att.lastStick = { x: rawX, y: rawYUp, active: stickActive };

    // First stick input counts toward "car settled"
    if (stickActive && !prevStickActive) {
      markInputSeen("stick", now);
    }

    // Flip cancel: after second jump, look for stick pushed downward
    if (att.secondJumpTime != null && att.flipCancelTime == null) {
      if (y > CONSTANTS.flipCancelDownThreshold) {
        onFlipCancelDetected(now);
      }
    }

    // Record sample for playback (only while Boost is held)
    const t = now - att.startedAt;
    const boostPressed =
      gp.buttons[MAPPING.boostButton] &&
      (gp.buttons[MAPPING.boostButton].pressed ||
        gp.buttons[MAPPING.boostButton].value > 0.5);
    const throttlePressed =
      gp.buttons[MAPPING.throttleButton] &&
      (gp.buttons[MAPPING.throttleButton].pressed ||
        gp.buttons[MAPPING.throttleButton].value > 0.5);
    const jumpPressed =
      gp.buttons[MAPPING.jumpButton] &&
      (gp.buttons[MAPPING.jumpButton].pressed ||
        gp.buttons[MAPPING.jumpButton].value > 0.5);

    const angleSample = mag >= CONSTANTS.stickActiveThreshold ? signedAngle : null;

    // Record samples continuously (includes button states for playback) up to max duration
    if (t <= CONSTANTS.recordingMaxDurationMs) {
      const triggerL = gp.buttons[6]?.value ?? 0;
      const triggerR = gp.buttons[7]?.value ?? 0;
      att.samples.push({
        t,
        angleDeg: angleSample,
        boost: Boolean(boostPressed),
        throttle: Boolean(throttlePressed),
        jump: Boolean(jumpPressed),
        stickX: rawX,
        stickY: rawYUp,
        triggerL,
        triggerR,
      });
    }

    // Keep full attempt data so playback still works even if the player pauses
    // and waits before hitting Play (no trimming by wall-clock time).
  }

  STATE.prevButtons = newPrevButtons;
  STATE.prevAxes = gp.axes.slice();

  renderCurrentAttempt();
  // When not playing back, show live overlay + binding button presses
  if (!STATE.playback.active) {
    updateLiveOverlayButtons(newPrevButtons);
    updateBindingIcons(newPrevButtons);
  }
  updatePlaybackOverlay();
}

function handleButtonDown(buttonIndex, time, buttonStates) {
  const mapping = MAPPING;

  if (mapping.resetShotButton != null && buttonIndex === mapping.resetShotButton) {
    const failSettled = isHoldingOtherBoundButtons(buttonStates, mapping.resetShotButton);
    startNewAttempt(failSettled);
  } else if (
    mapping.playbackToggleButton != null &&
    buttonIndex === mapping.playbackToggleButton
  ) {
    togglePlayback();
  } else if (
    mapping.playbackSpeedUpButton != null &&
    buttonIndex === mapping.playbackSpeedUpButton
  ) {
    nudgePlaybackSpeed(10);
  } else if (
    mapping.playbackSpeedDownButton != null &&
    buttonIndex === mapping.playbackSpeedDownButton
  ) {
    nudgePlaybackSpeed(-10);
  } else if (buttonIndex === mapping.jumpButton) {
    STATE.pendingStickMarker = true;
    onJumpPressed(time);
  } else if (buttonIndex === mapping.boostButton) {
    markInputSeen("boost", time);
  } else if (buttonIndex === mapping.throttleButton) {
    markInputSeen("throttle", time);
  } else if (buttonIndex === mapping.reverseButton) {
    markInputSeen("reverse", time);
  }
}

function isHoldingOtherBoundButtons(buttonStates, resetIndex) {
  if (!buttonStates) return false;
  const keys = [
    "jumpButton",
    "boostButton",
    "throttleButton",
    "reverseButton",
    "neutralAirRollButton",
    "dirAirRollLeftButton",
    "dirAirRollRightButton",
    "playbackToggleButton",
    "playbackSpeedUpButton",
    "playbackSpeedDownButton",
  ];
  return keys.some((key) => {
    const idx = MAPPING[key];
    if (idx == null || idx === resetIndex) return false;
    const btn = buttonStates[idx];
    if (!btn) return false;
    const val =
      typeof btn.value === "number"
        ? btn.value
        : typeof btn.pressed === "boolean"
          ? btn.pressed
          : 0;
    return Number(val) > 0.5;
  });
}

function setupModals() {
  const {
    linktreeOverlay,
    welcomeOverlay,
    welcomeVideo,
    fancyDuckLink,
    madeByContainer,
    howToOverlay,
    howToBtn,
  } = els;

  function openLinktree() {
    if (!linktreeOverlay) return;
    linktreeOverlay.classList.remove("closing");
    linktreeOverlay.classList.add("open");
    linktreeOverlay.setAttribute("aria-hidden", "false");
  }

  function closeLinktree() {
    if (!linktreeOverlay) return;
    linktreeOverlay.classList.remove("open");
    linktreeOverlay.classList.add("closing");
    const done = () => {
      linktreeOverlay?.classList.remove("closing");
      linktreeOverlay?.setAttribute("aria-hidden", "true");
    };
    const timeoutId = setTimeout(done, 300);
    const sheet = linktreeOverlay.querySelector(".lt-sheet");
    if (sheet) {
      const handler = (e) => {
        if (e.target !== sheet) return;
        clearTimeout(timeoutId);
        linktreeOverlay.removeEventListener("animationend", handler);
        done();
      };
      linktreeOverlay.addEventListener("animationend", handler);
    }
  }

  fancyDuckLink?.addEventListener("click", (e) => {
    e.preventDefault();
    openLinktree();
  });
  madeByContainer?.addEventListener("click", (e) => {
    e.preventDefault();
    openLinktree();
  });
  linktreeOverlay?.addEventListener("click", (e) => {
    if (e.target === linktreeOverlay) {
      closeLinktree();
    }
    if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close-overlay")) {
      closeLinktree();
    }
  });

  function openWelcome() {
    if (!welcomeOverlay) return;
    welcomeOverlay.classList.remove("closing");
    welcomeOverlay.classList.add("open");
    welcomeOverlay.setAttribute("aria-hidden", "false");
    if (welcomeVideo) {
      try {
        welcomeVideo.volume = 0.35;
        welcomeVideo.muted = false;
        const p = welcomeVideo.play();
        if (p && typeof p.then === "function") {
          p.catch(() => {
            try {
              welcomeVideo.muted = true;
              welcomeVideo.play().catch(() => {});
            } catch {
              // ignore
            }
          });
        }
      } catch {
        try {
          welcomeVideo.muted = true;
          welcomeVideo.play().catch(() => {});
        } catch {
          // ignore
        }
      }
    }
  }

  function closeWelcome() {
    if (!welcomeOverlay) return;
    welcomeOverlay.classList.remove("open");
    welcomeOverlay.classList.add("closing");
    if (welcomeVideo) {
      try {
        welcomeVideo.pause();
        welcomeVideo.currentTime = 0;
      } catch {
        // ignore
      }
    }
    const done = () => {
      welcomeOverlay?.classList.remove("closing");
      welcomeOverlay?.setAttribute("aria-hidden", "true");
    };
    const timeoutId = setTimeout(done, 300);
    const sheet = welcomeOverlay.querySelector(".lt-sheet");
    if (sheet) {
      const handler = (e) => {
        if (e.target !== sheet) return;
        clearTimeout(timeoutId);
        welcomeOverlay.removeEventListener("animationend", handler);
        done();
      };
      welcomeOverlay.addEventListener("animationend", handler);
    }
  }

  welcomeOverlay?.addEventListener("click", (e) => {
    if (e.target === welcomeOverlay) {
      closeWelcome();
    }
    if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close-welcome")) {
      closeWelcome();
    }
  });

  // Welcome video: click to unmute (and keep playing) like SpeedTap.
  welcomeVideo?.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (welcomeVideo.muted || welcomeVideo.volume === 0) {
        welcomeVideo.muted = false;
        try {
          welcomeVideo.volume = 0.35;
        } catch {
          // ignore
        }
        welcomeVideo.play().catch(() => {});
      } else {
        welcomeVideo.muted = true;
      }
    } catch {
      // ignore
    }
  });

  // Close welcome on first key press
  document.addEventListener(
    "keydown",
    (e) => {
      if (welcomeOverlay && welcomeOverlay.classList.contains("open")) {
        e.preventDefault();
        closeWelcome();
      }
    },
    true
  );

  // Close welcome on first gamepad button (handled in processGamepad)
  STATE.closeWelcome = closeWelcome;
  STATE.openWelcome = openWelcome;

  // Open on initial load
  openWelcome();

  // How To Use modal
  function openHowTo() {
    if (!howToOverlay) return;
    howToOverlay.classList.remove("closing");
    howToOverlay.classList.add("open");
    howToOverlay.setAttribute("aria-hidden", "false");
  }

  function closeHowTo() {
    if (!howToOverlay) return;
    howToOverlay.classList.remove("open");
    howToOverlay.classList.add("closing");
    const done = () => {
      howToOverlay?.classList.remove("closing");
      howToOverlay?.setAttribute("aria-hidden", "true");
    };
    const timeoutId = setTimeout(done, 300);
    const sheet = howToOverlay.querySelector(".lt-sheet");
    if (sheet) {
      const handler = (e) => {
        if (e.target !== sheet) return;
        clearTimeout(timeoutId);
        howToOverlay.removeEventListener("animationend", handler);
        done();
      };
      howToOverlay.addEventListener("animationend", handler);
    }
  }

  howToBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openHowTo();
  });

  howToOverlay?.addEventListener("click", (e) => {
    if (e.target === howToOverlay) {
      closeHowTo();
    }
    if (e.target instanceof HTMLElement && e.target.hasAttribute("data-close-howto")) {
      closeHowTo();
    }
  });
}

function setupPlaybackSpeedControls() {
  const range = els.playbackSpeedRange;
  const input = els.playbackSpeedValue;
  const apply = (val) => setPlaybackSpeedPct(val, range, input);

  range?.addEventListener("input", () => apply(Number(range.value)));
  input?.addEventListener("change", () => apply(Number(input.value)));

  apply(range ? Number(range.value) : PLAYBACK_MAX_PCT);
}

function setPlaybackSpeedMultiplier(multiplier) {
  let m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) m = 1;
  const now = performance.now();
  const wasActive = STATE.playback.active && !STATE.playback.isPaused;
  let elapsedScaled = 0;
  if (wasActive) {
    elapsedScaled = (now - STATE.playback.startedAt) * STATE.playback.speedMultiplier;
  } else if (STATE.playback.isPaused) {
    elapsedScaled = STATE.playback.elapsedAtPause;
  }
  STATE.playback.speedMultiplier = m;
  if (wasActive) {
    STATE.playback.startedAt = now - elapsedScaled / m;
  } else if (STATE.playback.isPaused) {
    STATE.playback.elapsedAtPause = elapsedScaled;
  }
  // If we're paused at end, keep label as Play; if playing, keep Restart.
  if (STATE.playback.isPaused) {
    setPlaybackToggleLabel(STATE.playback.atEnd ? "Restart" : "Play");
  } else {
    setPlaybackToggleLabel("Restart");
  }
}

function setPlaybackSpeedPct(val, rangeEl = els.playbackSpeedRange, inputEl = els.playbackSpeedValue) {
  let pct = Number(val);
  if (!Number.isFinite(pct)) pct = PLAYBACK_MAX_PCT;
  pct = Math.max(PLAYBACK_MIN_PCT, Math.min(PLAYBACK_MAX_PCT, pct));
  if (rangeEl) {
    const clampedForSlider = Math.max(
      Number(rangeEl.min) || PLAYBACK_MIN_PCT,
      Math.min(Number(rangeEl.max) || PLAYBACK_MAX_PCT, pct)
    );
    rangeEl.value = String(clampedForSlider);
  }
  if (inputEl) {
    inputEl.value = String(Math.round(pct));
  }
  setPlaybackSpeedMultiplier(pct / 100);
  return pct;
}

function nudgePlaybackSpeed(deltaPct) {
  const currentPct = (STATE.playback.speedMultiplier || 1) * 100;
  setPlaybackSpeedPct(currentPct + deltaPct);
}

function handleBindingButtonPress(buttonIndex) {
  const mode = STATE.bindingMode;
  if (!mode) return;

  MAPPING[mode.actionKey] = buttonIndex;
  setBindingStatus(
    "Bound " + describeActionKey(mode.actionKey) + " to button " + buttonIndex + "."
  );
  STATE.bindingMode = null;
  renderBindings();
  document
    .querySelectorAll("[data-bind-action]")
    .forEach((b) => b.classList.remove("active"));
  saveBindingsToStorage();
}

// Rocket League-style deadzone & dodge math (adapted from HalfwayDead's visualizer)

function toGameCoordinatesRL(rawX, rawYUp, deadzone) {
  let gameX;
  let gameY;

  if (rawX > 0) {
    if (rawX > deadzone) {
      gameX = (rawX - deadzone) / (1 - deadzone);
    } else {
      gameX = 0;
    }
  } else {
    if (Math.abs(rawX) > deadzone) {
      gameX = (rawX + deadzone) / (1 - deadzone);
    } else {
      gameX = 0;
    }
  }

  if (rawYUp > 0) {
    if (rawYUp > deadzone) {
      gameY = (rawYUp - deadzone) / (1 - deadzone);
    } else {
      gameY = 0;
    }
  } else {
    if (Math.abs(rawYUp) > deadzone) {
      gameY = (rawYUp + deadzone) / (1 - deadzone);
    } else {
      gameY = 0;
    }
  }

  return { x: gameX, y: gameY };
}

function toDodgeCoordinatesRL(gameX, gameY, dodgeThreshold) {
  let dodgeX = 0;
  let dodgeY = 0;
  if (Math.abs(gameX) + Math.abs(gameY) >= dodgeThreshold) {
    dodgeX = gameX;
    dodgeY = gameY;
  }
  return { x: dodgeX, y: dodgeY };
}

function angleVectorRL(vec) {
  const { x, y } = vec;
  if (x === 0 && y === 0) return null;

  const deg = (r) => (r * 180) / Math.PI;
  let out = 0;

  if (x >= 0 && y <= 0) {
    // quadrant: up-right
    out = 90 + deg(Math.atan(-y / x));
  } else if (x < 0 && y < 0) {
    // quadrant: up-left
    out = 180 + deg(Math.atan(-x / -y));
  } else if (x < 0) {
    // left-down
    out = 270 + deg(Math.atan(y / -x));
  } else {
    // right-down
    out = deg(Math.atan(x / y));
  }

  return out;
}

function angleDodgeRL(vec) {
  const { x, y } = vec;
  if (x === 0 && y === 0) return null;

  const deg = (r) => (r * 180) / Math.PI;
  let out = 0;

  if (x >= 0 && y <= 0) {
    if (Math.abs(y / x) <= 0.1) {
      out = 90;
    } else if (Math.abs(x / y) <= 0.1) {
      out = 180;
    } else {
      out = 90 + deg(Math.atan(-y / x));
    }
  } else if (x < 0 && y < 0) {
    if (Math.abs(-x / y) <= 0.1) {
      out = 180;
    } else if (Math.abs(y / x) <= 0.1) {
      out = 270;
    } else {
      out = 180 + deg(Math.atan(-x / -y));
    }
  } else if (x < 0) {
    if (Math.abs(y / -x) <= 0.1) {
      out = 270;
    } else if (Math.abs(x / y) <= 0.1) {
      out = 0;
    } else {
      out = 270 + deg(Math.atan(y / -x));
    }
  } else {
    if (Math.abs(x / y) <= 0.1) {
      out = 0;
    } else if (Math.abs(y / x) <= 0.1) {
      out = 90;
    } else {
      out = deg(Math.atan(x / y));
    }
  }

  return out;
}

function gradeFirstInputToJump(ms) {
  if (ms < 414) {
    return { label: "Fast", level: "bad", color: "red" };
  }
  if (ms <= 460) {
    return { label: "Bit Fast", level: "warn", color: "yellow" };
  }
  if (ms <= 630) {
    return { label: "Perfect", level: "good", color: "green" };
  }
  if (ms <= 674) {
    return { label: "Bit Slow", level: "warn", color: "yellow" };
  }
  return { label: "Slow", level: "bad", color: "red" };
}

function gradeSpeedflipAngle(angleDeg) {
  // angleDeg is signed (-180..180) after RL deadzone + dodge deadzone
  if (angleDeg <= -37 && angleDeg >= -23) {
    return { label: "Perfect", level: "good", color: "green" };
  }
  if (
    (angleDeg <= -38 && angleDeg >= -45) ||
    (angleDeg <= -15 && angleDeg >= -22)
  ) {
    return { label: "OK", level: "warn", color: "yellow" };
  }
  return { label: "Bad", level: "bad", color: "red" };
}

function gradeJumpGap(ms) {
  if (ms <= 115) {
    return { label: "Good", level: "good", color: "green" };
  }
  return { label: "Slow", level: "bad", color: "red" };
}

function gradeFlipCancel(ms) {
  if (ms < 50) {
    return { label: "Good", level: "good", color: "green" };
  }
  if (ms < 75) {
    return { label: "OK", level: "warn", color: "yellow" };
  }
  return { label: "Slow", level: "bad", color: "red" };
}

function applyGradePill(el, grade) {
  el.classList.remove("grade-good", "grade-warn", "grade-bad");
  if (!grade || !grade.label) {
    el.textContent = "–";
    return;
  }
  el.textContent = grade.label;
  if (grade.level === "good") el.classList.add("grade-good");
  else if (grade.level === "warn") el.classList.add("grade-warn");
  else if (grade.level === "bad") el.classList.add("grade-bad");
}

function levelFromGrade(level) {
  if (level === "good" || level === "warn" || level === "bad") return level;
  return null;
}

function setMiniValue(el, text, level) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("mini-good", "mini-warn", "mini-bad", "mini-muted");
  if (level === "good") el.classList.add("mini-good");
  else if (level === "warn") el.classList.add("mini-warn");
  else if (level === "bad") el.classList.add("mini-bad");
  else el.classList.add("mini-muted");
}

function renderCurrentAttempt() {
  const att = STATE.currentAttempt;
  if (!att) {
    els.settleTime.textContent = "–";
    els.settleGrade.textContent = "–";
    els.boostBeforeThrottle.textContent = "–";
    els.jumpDelayMs.textContent = "–";
    els.angleDeg.textContent = "–";
    els.jumpGapMs.textContent = "–";
    els.cancelMs.textContent = "–";
    setMiniValue(els.overlaySettle, "–", "muted");
    setMiniValue(els.overlayBoost, "–", "muted");
    setMiniValue(els.overlayFirstJump, "–", "muted");
    setMiniValue(els.overlayAngle, "–", "muted");
    setMiniValue(els.overlayFlipCancel, "–", "muted");
    setMiniValue(els.jumpGapIndicator, "–", "muted");
    return;
  }

  // Car settled
  if (att.settleTime != null) {
    const ms = Math.round(att.settleTime);
    els.settleTime.textContent = ms + " ms";
    const ok = ms >= CONSTANTS.settleMinMs;
    const grade = ok
      ? { label: "OK", level: "good" }
      : { label: "Too Early", level: "bad" };
    applyGradePill(els.settleGrade, grade);
    setMiniValue(els.overlaySettle, ok ? "Yes" : "No", ok ? "good" : "bad");
  } else {
    els.settleTime.textContent = "–";
    els.settleGrade.textContent = "–";
    setMiniValue(els.overlaySettle, "Waiting…", "muted");
  }

  // Boost before throttle
  if (att.boostBeforeThrottle == null) {
    els.boostBeforeThrottle.textContent =
      att.throttleOnTime || att.boostOnTime ? "Pending…" : "No throttle yet";
    setMiniValue(els.overlayBoost, "Pending…", "warn");
  } else {
    els.boostBeforeThrottle.textContent = att.boostBeforeThrottle ? "Yes" : "No";
    els.boostBeforeThrottle.classList.toggle("grade-bad", !att.boostBeforeThrottle);
    els.boostBeforeThrottle.classList.toggle(
      "grade-good",
      Boolean(att.boostBeforeThrottle)
    );
    setMiniValue(
      els.overlayBoost,
      att.boostBeforeThrottle ? "Yes" : "No",
      att.boostBeforeThrottle ? "good" : "bad"
    );
  }

  // First input -> first jump
  if (att.jumpDelayMs != null) {
    const ms = Math.round(att.jumpDelayMs);
    els.jumpDelayMs.textContent = ms + " ms";
    applyGradePill(els.jumpDelayGrade, att.jumpDelayGrade);
    const level = att.jumpDelayGrade?.level || null;
    setMiniValue(els.overlayFirstJump, ms + " ms", levelFromGrade(level));
  } else {
    els.jumpDelayMs.textContent = "–";
    els.jumpDelayGrade.textContent = "–";
    setMiniValue(els.overlayFirstJump, "–", "muted");
  }

  // Angle at second jump
  if (att.angleDeg != null) {
    els.angleDeg.textContent = att.angleDeg.toFixed(1) + "°";
    applyGradePill(els.angleGrade, att.angleGrade);
    const angle = att.angleDeg;
    const inRange = angle <= -23 && angle >= -37;
    const level = inRange ? "good" : levelFromGrade(att.angleGrade?.level);
    setMiniValue(els.overlayAngle, angle.toFixed(1) + "°", level || (inRange ? "good" : "warn"));
  } else if (att.secondJumpTime != null) {
    els.angleDeg.textContent = "–";
    applyGradePill(els.angleGrade, att.angleGrade);
    setMiniValue(els.overlayAngle, "Waiting…", "warn");
  } else {
    els.angleDeg.textContent = "–";
    els.angleGrade.textContent = "–";
    setMiniValue(els.overlayAngle, "–", "muted");
  }

  // Time between jumps
  if (att.jumpGapMs != null) {
    const ms = Math.round(att.jumpGapMs);
    els.jumpGapMs.textContent = ms + " ms";
    applyGradePill(els.jumpGapGrade, att.jumpGapGrade);
    setMiniValue(
      els.jumpGapIndicator,
      ms + " ms",
      levelFromGrade(att.jumpGapGrade?.level) || "warn"
    );
  } else {
    els.jumpGapMs.textContent = "–";
    els.jumpGapGrade.textContent = "–";
    setMiniValue(els.jumpGapIndicator, "–", "muted");
  }

  // Flip cancel timing
  if (att.flipCancelMs != null) {
    const ms = Math.round(att.flipCancelMs);
    els.cancelMs.textContent = ms + " ms";
    applyGradePill(els.cancelGrade, att.flipCancelGrade);
    setMiniValue(
      els.overlayFlipCancel,
      ms + " ms",
      levelFromGrade(att.flipCancelGrade?.level) || "warn"
    );
  } else if (att.secondJumpTime != null) {
    els.cancelMs.textContent = "Waiting…";
    els.cancelGrade.textContent = "–";
    setMiniValue(els.overlayFlipCancel, "Waiting…", "warn");
  } else {
    els.cancelMs.textContent = "–";
    els.cancelGrade.textContent = "–";
    setMiniValue(els.overlayFlipCancel, "–", "muted");
  }
}

function describeActionKey(key) {
  switch (key) {
    case "jumpButton":
      return "Jump";
    case "boostButton":
      return "Boost";
    case "throttleButton":
      return "Throttle";
    case "reverseButton":
      return "Reverse";
    case "neutralAirRollButton":
      return "Neutral Air Roll";
    case "dirAirRollLeftButton":
      return "Directional Air Roll Left";
    case "dirAirRollRightButton":
      return "Directional Air Roll Right";
    case "playbackToggleButton":
      return "Play / Restart Playback";
    case "playbackSpeedUpButton":
      return "Playback Speed +10%";
    case "playbackSpeedDownButton":
      return "Playback Speed -10%";
    default:
      return key;
  }
}

function renderBindings() {
  const labels = [
    ["resetShotButton", els.bindingResetLabel],
    ["jumpButton", els.bindingJumpLabel],
    ["boostButton", els.bindingBoostLabel],
    ["throttleButton", els.bindingThrottleLabel],
    ["reverseButton", els.bindingReverseLabel],
    ["neutralAirRollButton", els.bindingNeutralRollLabel],
    ["dirAirRollLeftButton", els.bindingDirRollLeftLabel],
    ["dirAirRollRightButton", els.bindingDirRollRightLabel],
    ["playbackToggleButton", els.bindingPlaybackLabel],
    ["playbackSpeedUpButton", els.bindingPlaybackUpLabel],
    ["playbackSpeedDownButton", els.bindingPlaybackDownLabel],
  ];

  labels.forEach(([key, el]) => {
    if (!el) return;
    const index = MAPPING[key];
    if (index == null || typeof index === "undefined") {
      el.textContent = "Not bound";
    } else {
      const icon = getGamepadIconForIndex(index);
      if (icon) {
        el.innerHTML = `<img class="btn-icon" src="${icon.normal}" alt="${icon.alt}">`;
      } else {
        el.textContent = "Button " + index;
      }
    }
  });

  // Update overlay button visuals based on bindings and controller type
  const used = new Set(
    Object.values(MAPPING).filter((v) => typeof v === "number" && !Number.isNaN(v))
  );
  const overlay = els.controllerOverlay;
  if (overlay) {
    const btns = overlay.querySelectorAll(".ctrl-btn");
    btns.forEach((btn) => {
      const idx = Number(btn.getAttribute("data-button-index"));
      const isBound = used.has(idx);
      btn.classList.toggle("bound", isBound);
      const icon = Number.isInteger(idx) ? getGamepadIconForIndex(idx) : null;
      if (icon) {
        btn.style.setProperty("--btn-icon", `url(${icon.normal})`);
        if (icon.pressed) {
          btn.style.setProperty("--btn-icon-pressed", `url(${icon.pressed})`);
        } else {
          btn.style.removeProperty("--btn-icon-pressed");
        }
      } else {
        btn.style.removeProperty("--btn-icon");
        btn.style.removeProperty("--btn-icon-pressed");
      }
    });
  }
}

function getGamepadIconForIndex(index) {
  const isPs = STATE.gamepadInfo.isPlayStation;
  const isXbox = STATE.gamepadInfo.isXbox;
  if (isPs) {
    const map = {
      0: {
        normal: "Assets/PS_Assets/PS-Cross.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Cross_pressed.svg",
        alt: "Cross",
      },
      1: {
        normal: "Assets/PS_Assets/PS-Circle.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Circle_pressed.svg",
        alt: "Circle",
      },
      2: {
        normal: "Assets/PS_Assets/PS-Square.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Square_pressed.svg",
        alt: "Square",
      },
      3: {
        normal: "Assets/PS_Assets/PS-Triangle.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Triangle_pressed.svg",
        alt: "Triangle",
      },
      4: {
        normal: "Assets/PS_Assets/PS-L1.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-L1_pressed.svg",
        alt: "L1",
      },
      5: {
        normal: "Assets/PS_Assets/PS-R1.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-R1_pressed.svg",
        alt: "R1",
      },
      6: {
        normal: "Assets/PS_Assets/PS-L2.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-L2_pressed.svg",
        alt: "L2",
      },
      7: {
        normal: "Assets/PS_Assets/PS-R2.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-R2_pressed.svg",
        alt: "R2",
      },
      8: {
        normal: "Assets/PS_Assets/PS-Share.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Share_pressed.svg",
        alt: "Share",
      },
      9: {
        normal: "Assets/PS_Assets/PS-Options.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Options_pressed.svg",
        alt: "Options",
      },
      10: {
        normal: "Assets/PS_Assets/PS-L3.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-L3_pressed.svg",
        alt: "L3",
      },
      11: {
        normal: "Assets/PS_Assets/PS-R3.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-R3_pressed.svg",
        alt: "R3",
      },
      12: {
        normal: "Assets/PS_Assets/PS-Dpadup.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Dpadup_pressed.svg",
        alt: "DPad Up",
      },
      13: {
        normal: "Assets/PS_Assets/PS-Dpaddown.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Dpaddown_pressed.svg",
        alt: "DPad Down",
      },
      14: {
        normal: "Assets/PS_Assets/PS-Dpadleft.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Dpadleft_pressed.svg",
        alt: "DPad Left",
      },
      15: {
        normal: "Assets/PS_Assets/PS-Dpadright.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Dpadright_pressed.svg",
        alt: "DPad Right",
      },
      16: {
        normal: "Assets/PS_Assets/PS-Home.svg",
        pressed: "Assets/Pressed_Assets/PS_Pressed/PS-Home_pressed.svg",
        alt: "Home",
      },
    };
    const entry = map[index];
    if (!entry) return null;
    return entry;
  }

  // Default to Xbox-style icons
  const map = {
    0: {
      normal: "Assets/XBox_Assets/XBOX-A.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-A_pressed.svg",
      alt: "A",
    },
    1: {
      normal: "Assets/XBox_Assets/XBOX-B.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-B_pressed.svg",
      alt: "B",
    },
    2: {
      normal: "Assets/XBox_Assets/XBOX-X.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-X_pressed.svg",
      alt: "X",
    },
    3: {
      normal: "Assets/XBox_Assets/XBOX-Y.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-Y_pressed.svg",
      alt: "Y",
    },
    4: {
      normal: "Assets/XBox_Assets/XBOX-LB.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-LB_pressed.svg",
      alt: "LB",
    },
    5: {
      normal: "Assets/XBox_Assets/XBOX-RB.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-RB_pressed.svg",
      alt: "RB",
    },
    6: {
      normal: "Assets/XBox_Assets/XBOX-LT.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-LT_pressed.svg",
      alt: "LT",
    },
    7: {
      normal: "Assets/XBox_Assets/XBOX-RT.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-RT_pressed.svg",
      alt: "RT",
    },
    8: {
      normal: "Assets/XBox_Assets/button_xbox_digital_view_1.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-Share_pressed.svg",
      alt: "View",
    },
    9: {
      normal: "Assets/XBox_Assets/XBOX-START.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-START_pressed.svg",
      alt: "Menu",
    },
    10: {
      normal: "Assets/XBox_Assets/XBOX-LEFT-STICK.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-LEFT-STICK_pressed.svg",
      alt: "LS",
    },
    11: {
      normal: "Assets/XBox_Assets/XBOX-RIGHT-S.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-RIGHT-S_pressed.svg",
      alt: "RS",
    },
    12: {
      normal: "Assets/XBox_Assets/XBOX-DPAD-UP.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-DPAD-UP_pressed.svg",
      alt: "DPad Up",
    },
    13: {
      normal: "Assets/XBox_Assets/XBOX-DPAD-DOWN.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-DPAD-DOWN_pressed.svg",
      alt: "DPad Down",
    },
    14: {
      normal: "Assets/XBox_Assets/XBOX-DPAD-LEFT.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-DPAD-LEFT_pressed.svg",
      alt: "DPad Left",
    },
    15: {
      normal: "Assets/XBox_Assets/XBOX-DPAD-RIGHT.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-DPAD-RIGHT_pressed.svg",
      alt: "DPad Right",
    },
    16: {
      normal: "Assets/XBox_Assets/button_xbox_digital_home_green.svg",
      pressed: "Assets/Pressed_Assets/Xbox_Pressed/XBOX-HOME_pressed.svg",
      alt: "Home",
    },
  };
  const entry = map[index];
  if (!entry) return null;
  return entry;
}

function renderTimeline() {
  if (!timelineCtx || !els.timelineCanvas) return;

  const ctx = timelineCtx;
  const canvas = els.timelineCanvas;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const att = STATE.currentAttempt;
  if (!att || !att.samples || att.samples.length === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("Start an attempt to see the timeline.", 12, h / 2);
    return;
  }

  const paddingLeft = 40;
  const paddingRight = 10;
  const paddingTop = 18;
  const paddingBottom = 38;

  const usableWidth = w - paddingLeft - paddingRight;
  const usableHeight = h - paddingTop - paddingBottom;

  const lastT = att.samples[att.samples.length - 1].t;
  const maxT = Math.max(lastT, 400); // min range

  // Axes
  ctx.strokeStyle = "rgba(55,65,81,0.9)";
  ctx.lineWidth = 1;

  // Time axis (bottom)
  const xAxisY = h - paddingBottom + 10;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, xAxisY);
  ctx.lineTo(w - paddingRight, xAxisY);
  ctx.stroke();

  // Zero angle line (center)
  const midY = paddingTop + usableHeight / 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(75,85,99,0.9)";
  ctx.beginPath();
  ctx.moveTo(paddingLeft, midY);
  ctx.lineTo(w - paddingRight, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("Angle (°)", 6, paddingTop + 8);

  // Draw angle line
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#60a5fa";
  ctx.beginPath();
  let started = false;
  att.samples.forEach((s) => {
    const x = paddingLeft + (s.t / maxT) * usableWidth;
    if (s.angleDeg == null) return;
    const y = midY - (s.angleDeg / 90) * (usableHeight / 2);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (started) ctx.stroke();

  // Boost / Throttle bars (bottom zone)
  const barHeight = 6;
  const boostY = h - paddingBottom + 18;
  const throttleY = boostY + barHeight + 3;

  att.samples.forEach((s) => {
    const x = paddingLeft + (s.t / maxT) * usableWidth;
    const wBar = 2;
    if (s.boost) {
      ctx.fillStyle = "#f97316"; // orange
      ctx.fillRect(x, boostY, wBar, barHeight);
    }
    if (s.throttle) {
      ctx.fillStyle = "#22c55e"; // green
      ctx.fillRect(x, throttleY, wBar, barHeight);
    }
  });

  // Event markers
  function drawMarker(time, color, label) {
    if (time == null) return;
    const t = time - att.startedAt;
    const x = paddingLeft + (t / maxT) * usableWidth;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, h - paddingBottom);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(label, x + 2, paddingTop + 10);
  }

  drawMarker(att.firstInputTime, "#e5e7eb", "First Input");
  drawMarker(att.firstJumpTime, "#22c55e", "Jump 1");
  drawMarker(att.secondJumpTime, "#a855f7", "Jump 2");
  drawMarker(att.flipCancelTime, "#f97316", "Cancel");

  // Time ticks
  const stepMs = 100;
  for (let t = 0; t <= maxT; t += stepMs) {
    const x = paddingLeft + (t / maxT) * usableWidth;
    ctx.strokeStyle = "rgba(55,65,81,0.7)";
    ctx.beginPath();
    ctx.moveTo(x, xAxisY);
    ctx.lineTo(x, xAxisY + 4);
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText(String(t), x - 6, xAxisY + 14);
  }
}

function finalizeAttempt(att) {
  att.completed = true;
  STATE.attempts.unshift(att);
  if (STATE.attempts.length > CONSTANTS.maxHistory) {
    STATE.attempts.length = CONSTANTS.maxHistory;
  }
  stopJumpGapAnimation();
  renderJumpGapGraph();
}

function getJumpGapClass(ms) {
  if (ms >= 151) return "black";
  if (ms >= 131) return "red";
  if (ms >= 116) return "yellow";
  return "ok";
}

function computeJumpGapBarHeight(ms, chartEl) {
  const containerHeight = (chartEl && chartEl.clientHeight) || 180;
  const msScaleMax = 150;
  const usableHeight = containerHeight - 18;
  const maxBarHeight = Math.max(20, Math.round((usableHeight * 2) / 3));
  const vHeight = Math.min(ms, msScaleMax);
  return Math.max(16, Math.round((vHeight / msScaleMax) * maxBarHeight));
}

function stopJumpGapAnimation() {
  const anim = STATE.jumpGapAnim;
  if (anim && anim.rafId) {
    cancelAnimationFrame(anim.rafId);
  }
  STATE.jumpGapAnim = { startTime: null, rafId: null, col: null, label: null };
}

function startJumpGapAnimation(startTimeMs) {
  const chart = els.jumpGapChart;
  if (!chart) return;

  stopJumpGapAnimation();
  chart.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "bar ok live";
  const col = document.createElement("div");
  col.className = "col";
  col.style.height = "0px";
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = "00 ms";

  bar.appendChild(col);
  bar.appendChild(label);
  chart.appendChild(bar);

  STATE.jumpGapAnim = { startTime: startTimeMs, rafId: null, col, label };

  const tick = () => {
    const anim = STATE.jumpGapAnim;
    if (!anim || !anim.startTime || !anim.col || !anim.label) return;
    const elapsed = Math.max(0, performance.now() - anim.startTime);
    const h = computeJumpGapBarHeight(elapsed, chart);
    anim.col.style.height = `${h}px`;
    bar.className = "bar " + getJumpGapClass(elapsed) + " live";
    const rounded = Math.round(elapsed);
    anim.label.textContent = (rounded < 10 ? "0" : "") + rounded + " ms";
    anim.rafId = requestAnimationFrame(tick);
  };

  tick();
}

function renderJumpGapGraph() {
  const chart = els.jumpGapChart;
  if (!chart) return;

  chart.innerHTML = "";

  const att = STATE.currentAttempt;
  if (!att || typeof att.jumpGapMs !== "number" || Number.isNaN(att.jumpGapMs)) {
    return;
  }

  const gap = att.jumpGapMs;

  const bar = document.createElement("div");
  bar.className = "bar " + getJumpGapClass(gap);

  const col = document.createElement("div");
  col.className = "col";
  const h = computeJumpGapBarHeight(gap, chart);
  col.style.height = `${h}px`;

  const label = document.createElement("div");
  label.className = "label";
  const r = Math.round(gap);
  label.textContent = (r < 10 ? "0" : "") + r + " ms";

  bar.appendChild(col);
  bar.appendChild(label);
  chart.appendChild(bar);
}

function updateLiveOverlayButtons(buttonStates) {
  if (!els.controllerOverlay) return;
  const btns = els.controllerOverlay.querySelectorAll(".ctrl-btn");
  btns.forEach((btn) => {
    const idx = Number(btn.getAttribute("data-button-index"));
    if (!Number.isInteger(idx)) return;
    const value = Number(buttonStates[idx] ?? 0);
    const pressed = value > 0.5;
    btn.classList.toggle("pressed", pressed);
    if (idx === 6 || idx === 7) {
      btn.style.setProperty("--press-amount", value.toFixed(2));
    } else {
      btn.style.setProperty("--press-amount", "0");
    }
  });
}

function updateBindingIcons(buttonStates) {
  if (!buttonStates) return;
  const bindingEls = {
    resetShotButton: els.bindingResetLabel,
    jumpButton: els.bindingJumpLabel,
    boostButton: els.bindingBoostLabel,
    throttleButton: els.bindingThrottleLabel,
    reverseButton: els.bindingReverseLabel,
    neutralAirRollButton: els.bindingNeutralRollLabel,
    dirAirRollLeftButton: els.bindingDirRollLeftLabel,
    dirAirRollRightButton: els.bindingDirRollRightLabel,
    playbackToggleButton: els.bindingPlaybackLabel,
    playbackSpeedUpButton: els.bindingPlaybackUpLabel,
    playbackSpeedDownButton: els.bindingPlaybackDownLabel,
  };

  Object.entries(bindingEls).forEach(([key, el]) => {
    if (!el) return;
    const index = MAPPING[key];
    if (index == null || Number.isNaN(index)) return;
    const icon = getGamepadIconForIndex(index);
    if (!icon) {
      el.textContent = "Button " + index;
      return;
    }
    const pressed = (buttonStates[index] ?? 0) > 0.5;
    const src = pressed && icon.pressed ? icon.pressed : icon.normal;
    el.innerHTML = `<img class="btn-icon" src="${src}" alt="${icon.alt}">`;
  });
}

function setAngleGauge(angleDeg) {
  const needle = els.angleNeedle;
  if (!needle) return;
  if (angleDeg == null || !Number.isFinite(angleDeg)) {
    needle.style.opacity = "0.3";
    needle.style.left = "50%"; // center at 0°
    return;
  }
  const clamped = Math.max(-90, Math.min(90, angleDeg));
  const percent = (clamped + 90) / 180; // 0..1 from left (-90) to right (+90)
  needle.style.opacity = "1";
  needle.style.left = `${(percent * 100).toFixed(1)}%`;
}

function addAngleMarker(angleDeg) {
  const track = els.angleTrack;
  if (!track || angleDeg == null || !Number.isFinite(angleDeg)) return;
  const clamped = Math.max(-90, Math.min(90, angleDeg));
  const percent = (clamped + 90) / 180;
  const marker = document.createElement("div");
  marker.className = "angle-marker";
  marker.style.left = `${(percent * 100).toFixed(1)}%`;
  track.appendChild(marker);
}

function clearAngleMarkers() {
  const track = els.angleTrack;
  if (!track) return;
  track.querySelectorAll(".angle-marker").forEach((m) => m.remove());
}

function addStickMarker(rawX, rawYUp) {
  const container = els.stickMarkers;
  const att = STATE.currentAttempt;
  if (!container || !att) return;
  if (att.stickMarkerCount >= 2) return;
  att.stickMarkerCount += 1;
  const cx = Math.max(-1, Math.min(1, rawX ?? 0));
  const cy = Math.max(-1, Math.min(1, rawYUp ?? 0));
  const range = 60;
  const marker = document.createElement("div");
  marker.className = "stick-marker";
  marker.style.transform = `translate(-50%, -50%) translate(${(cx * range).toFixed(
    1
  )}px, ${(-cy * range).toFixed(1)}px)`;
  container.appendChild(marker);
}

function clearStickMarkers() {
  const container = els.stickMarkers;
  if (!container) return;
  while (container.firstChild) {
    container.firstChild.remove();
  }
  if (STATE.currentAttempt) {
    STATE.currentAttempt.stickMarkerCount = 0;
  }
}

function clearTimelineMarkers() {
  const container = els.timelineMarkers;
  if (!container) return;
  while (container.firstChild) {
    container.firstChild.remove();
  }
}

function updateTimelineMarkers() {
  const container = els.timelineMarkers;
  if (!container) return;
  clearTimelineMarkers();
  const duration = STATE.playback.duration || 0;
  if (!duration || !STATE.playback.samples.length) return;
  let prevJump = false;
  let jumpCount = 0;
  STATE.playback.samples.forEach((s) => {
    const jumpPressed = Boolean(s.jump);
    if (jumpPressed && !prevJump && jumpCount < 2) {
      const pct = Math.min(100, Math.max(0, (s.t / duration) * 100));
      const marker = document.createElement("div");
      marker.className = "timeline-marker";
      marker.style.left = `${pct}%`;
      container.appendChild(marker);
      jumpCount += 1;
    }
    prevJump = jumpPressed;
  });
}

function renderPlaybackFrame(elapsed) {
  const samples = STATE.playback.samples;
  if (!samples.length) return;
  const clampedElapsed = Math.max(0, Math.min(elapsed, STATE.playback.duration));
  updatePlaybackTimeline(clampedElapsed);

  // Rebuild markers up to current time to avoid stacking across playbacks/scrubs.
  clearStickMarkers();
  clearAngleMarkers();
  STATE.playback.atEnd = clampedElapsed >= (STATE.playback.duration || 0);
  let idx = 0;
  let prevJump = false;
  for (let i = 0; i < samples.length && samples[i].t <= clampedElapsed; i++) {
    const s = samples[i];
    const jumpPressed = Boolean(s.jump);
    if (jumpPressed && !prevJump) {
      addStickMarker(s.stickX, s.stickY);
      if (s.angleDeg != null && Number.isFinite(s.angleDeg)) {
        addAngleMarker(s.angleDeg);
      }
    }
    prevJump = jumpPressed;
    idx = i;
  }
  STATE.playback.lastJumpState = prevJump;
  STATE.playback.lastIndex = idx;
  const s = samples[idx];

  clearOverlayButtons();

  setTriggerPress(6, s.triggerL);
  setTriggerPress(7, s.triggerR);

  const icons = [
    { index: MAPPING.boostButton, pressed: s.boost },
    { index: MAPPING.throttleButton, pressed: s.throttle },
    { index: MAPPING.jumpButton, pressed: s.jump },
  ];
  icons.forEach((entry) => {
    if (entry.index == null || !entry.pressed) return;
    const btnEl = document.querySelector(
      '.ctrl-btn[data-button-index="' + entry.index + '"]'
    );
    if (btnEl) {
      btnEl.classList.add("pressed");
    }
  });

  if (els.overlayStick) {
    const cx = Math.max(-1, Math.min(1, s.stickX ?? 0));
    const cy = Math.max(-1, Math.min(1, s.stickY ?? 0));
    const range = 60;
    els.overlayStick.style.transform = `translate(${(cx * range).toFixed(
      1
    )}px, ${(-cy * range).toFixed(1)}px)`;
  }

  // Update dodge angle gauge during playback
  setAngleGauge(s.angleDeg != null ? s.angleDeg : null);
}

function updatePlaybackTimeline(elapsed) {
  if (els.playbackTimeline) {
    els.playbackTimeline.max = String(Math.round(STATE.playback.duration || 0));
    els.playbackTimeline.value = String(Math.round(elapsed || 0));
  }
  if (els.playbackTimeLabel) {
    const total = STATE.playback.duration || 0;
    els.playbackTimeLabel.textContent =
      formatMs(elapsed || 0) + " / " + formatMs(total || 0);
  }
}

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 100) / 10); // one decimal
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, "0");
  return minutes + ":" + seconds;
}

function setPlaybackToggleLabel(label) {
  if (els.playbackToggleBtn) {
    els.playbackToggleBtn.textContent = label;
  }
}

function onPlaybackScrub() {
  if (!STATE.playback.samples.length) {
    const ok = preparePlaybackSamples();
    if (!ok) return;
  }
  const desired = Math.max(
    0,
    Math.min(Number(els.playbackTimeline.value) || 0, STATE.playback.duration || 0)
  );
  STATE.playback.elapsedAtPause = desired;
  STATE.playback.isPaused = true;
  STATE.playback.active = true;
  STATE.playback.lastIndex = -1;
  STATE.playback.lastJumpState = false;
  setPlaybackToggleLabel("Play");
  // rebuild markers to align with scrub position
  updateTimelineMarkers();
  renderPlaybackFrame(desired);
}
function preparePlaybackSamples() {
  // If the current attempt has data but hasn't been finalized yet, finalize it now.
  if (
    STATE.currentAttempt &&
    !STATE.currentAttempt.completed &&
    STATE.currentAttempt.samples &&
    STATE.currentAttempt.samples.length
  ) {
    finalizeAttempt(STATE.currentAttempt);
  }

  const current =
    STATE.currentAttempt && STATE.currentAttempt.completed
      ? STATE.currentAttempt
      : STATE.attempts[0];
  if (!current || !current.samples || !current.samples.length) {
    setBindingStatus("No recorded Boost input for the last attempt to play back.");
    return false;
  }
  const slice = current.samples.slice();
  const base = slice[0].t || 0;
  STATE.playback.samples = slice.map((s) => ({
    ...s,
    t: s.t - base,
  }));
  STATE.playback.duration =
    STATE.playback.samples[STATE.playback.samples.length - 1].t;
  STATE.playback.startedAt = performance.now();
  STATE.playback.lastIndex = -1;
  STATE.playback.lastJumpState = false;
  STATE.playback.elapsedAtPause = 0;
  STATE.playback.isPaused = true;
  STATE.playback.active = true;
  STATE.playback.atEnd = false;
  updatePlaybackTimeline(0);
  updateTimelineMarkers();
  clearOverlayButtons();
  clearStickMarkers();
  clearAngleMarkers();
  setPlaybackToggleLabel("Play");
  return true;
}

function togglePlayback() {
  if (!STATE.playback.samples.length) {
    const ok = preparePlaybackSamples();
    if (!ok) return;
  }

  if (!STATE.playback.active) {
    const ok = preparePlaybackSamples();
    if (!ok) return;
  }

  if (STATE.playback.isPaused) {
    if (STATE.playback.atEnd || STATE.playback.elapsedAtPause >= (STATE.playback.duration || 0)) {
      restartPlayback();
    } else {
      resumePlayback();
    }
  } else {
    restartPlayback();
  }
}

function resumePlayback() {
  const now = performance.now();
  STATE.playback.startedAt =
    now - (STATE.playback.elapsedAtPause || 0) / (STATE.playback.speedMultiplier || 1);
  STATE.playback.isPaused = false;
  STATE.playback.active = true;
  STATE.playback.atEnd = false;
  setPlaybackToggleLabel("Restart");
}

function restartPlayback() {
  clearStickMarkers();
  clearAngleMarkers();
  updateTimelineMarkers();
  STATE.playback.elapsedAtPause = 0;
  STATE.playback.lastIndex = -1;
  STATE.playback.lastJumpState = false;
  STATE.playback.startedAt = performance.now();
  STATE.playback.isPaused = false;
  STATE.playback.active = true;
  STATE.playback.atEnd = false;
  setPlaybackToggleLabel("Restart");
}

function stopPlayback(resetTimeline = true) {
  // Keep samples so user can immediately replay/scrub again.
  STATE.playback.active = false;
  STATE.playback.lastIndex = -1;
  STATE.playback.lastJumpState = false;
  STATE.playback.isPaused = true;
  STATE.playback.elapsedAtPause = resetTimeline ? 0 : STATE.playback.elapsedAtPause;
  STATE.playback.atEnd = false;
  setPlaybackToggleLabel("Play");
  if (resetTimeline) {
    updatePlaybackTimeline(0);
    clearTimelineMarkers();
  }
  clearOverlayButtons();
  clearStickMarkers();
  clearAngleMarkers();
}

function clearOverlayButtons() {
  const btns = document.querySelectorAll(".ctrl-btn");
  btns.forEach((btn) => {
    btn.classList.remove("pressed");
    btn.style.setProperty("--press-amount", "0");
  });
  if (els.overlayStick) {
    els.overlayStick.style.transform = "translate(0px, 0px)";
  }
}

function setTriggerPress(idx, value) {
  const btnEl = document.querySelector('.ctrl-btn[data-button-index="' + idx + '"]');
  if (!btnEl) return;
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  btnEl.classList.toggle("pressed", v > 0.5);
  btnEl.style.setProperty("--press-amount", v.toFixed(2));
}

async function openOverlayPopout() {
  explainPopoutLimitationsIfNeeded();

  // Ensure the browser window is active.
  if (typeof window.focus === "function") {
    try {
      window.focus();
    } catch {
      // ignore focus errors
    }
  }
  // Reuse existing popout if it is already open.
  if (overlayPopout && overlayPopout.win && !overlayPopout.win.closed) {
    overlayPopout.win.focus();
    return;
  }

  const sourceCard = findOverlayCard();
  if (!sourceCard) {
    console.warn("Overlay card not found for popout.");
    return;
  }

  const rect = sourceCard.getBoundingClientRect();
  const width = Math.max(640, Math.min(960, Math.round(rect.width || 900)));
  const height = Math.max(560, Math.min(820, Math.round(rect.height || 720)));

  let win = null;
  let isPip = false;

  // Prefer always-on-top Document Picture-in-Picture when available.
  // This is the behavior users are comparing against WallDasher/SpeedTap.
  if (window.isSecureContext && window.documentPictureInPicture?.requestWindow) {
    try {
      win = await documentPictureInPicture.requestWindow({ width, height });
      isPip = true;
    } catch (err) {
      console.warn("Document PiP request failed, falling back to popup.", err);
    }
  }

  if (!win) {
    // Use popup features to encourage a separate window (not a tab).
    win = window.open(
      "",
      "sfOverlayPopout",
      `width=${width},height=${height},toolbar=no,menubar=no,location=no,status=no,scrollbars=no,resizable=yes`
    );
    if (!win) {
      alert("Popup was blocked. Please allow popups to view the overlay.");
      return;
    }
  }

  const doc = win.document;
  if (!doc.head) {
    // If about:blank, ensure a basic document is present.
    doc.open();
    doc.write("<!doctype html><html><head><title>Overlay</title></head><body></body></html>");
    doc.close();
  }

  // Important: make relative URLs resolve correctly inside the popout/PiP document,
  // and inline CSS when possible (matches SpeedTap behavior and is more reliable in PiP).
  await hydratePopoutStyles(doc);
  applyPopoutLayout(doc);
  injectPopoutRefocusScript(doc);

  const root = doc.createElement("div");
  root.id = "popout-root";
  doc.body.appendChild(root);

  const clone = sourceCard.cloneNode(true);
  root.replaceChildren(clone);

  overlayPopout = { win, rafId: null, isPip, root, clone };
  if (typeof win.focus === "function") {
    try {
      win.focus();
    } catch {
      // ignore focus errors
    }
  }

  wirePopoutControls(win.document);

  const sync = () => {
    if (!overlayPopout || win.closed) {
      closeOverlayPopout();
      return;
    }
    const latest = findOverlayCard();
    if (latest) {
      syncPopoutState(win.document, latest);
    }
    overlayPopout.rafId = win.requestAnimationFrame(sync);
  };

  const cleanupHandler = () => closeOverlayPopout();
  win.addEventListener("pagehide", cleanupHandler);
  win.addEventListener("beforeunload", cleanupHandler);

  sync();
}

function closeOverlayPopout() {
  if (!overlayPopout) return;
  try {
    if (overlayPopout.rafId != null && overlayPopout.win && !overlayPopout.win.closed) {
      overlayPopout.win.cancelAnimationFrame(overlayPopout.rafId);
    }
    if (overlayPopout.isPip && overlayPopout.win?.close) {
      overlayPopout.win.close();
    } else if (overlayPopout.win && !overlayPopout.win.closed) {
      overlayPopout.win.close();
    }
  } catch {
    // ignore cleanup errors
  } finally {
    overlayPopout = null;
  }
}

function findOverlayCard() {
  const cards = Array.from(document.querySelectorAll("section.card"));
  return cards.find((c) => {
    const h2 = c.querySelector("h2");
    return h2 && h2.textContent.toLowerCase().includes("overlay");
  });
}

function copyStylesToDoc(targetDoc) {
  const head = targetDoc.head || targetDoc.getElementsByTagName("head")[0];
  if (!head) return;
  // Ensure relative stylesheet URLs work in about:blank / PiP documents.
  ensurePopoutBaseTag(targetDoc);
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    head.appendChild(node.cloneNode(true));
  });
}

function applyPopoutLayout(doc) {
  const style = doc.createElement("style");
  style.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: transparent;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      background: linear-gradient(135deg, var(--bg-1, #0f1226), var(--bg-2, #121a3a));
      padding: 0 6px 6px;
    }
    #popout-root {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 0 6px 6px;
      box-sizing: border-box;
    }
    #popout-root > * {
      width: 100%;
      max-width: 960px;
      transform: scale(0.95);
      transform-origin: bottom center;
    }
    #popout-overlay-btn {
      display: none !important;
    }
  `;
  doc.head.appendChild(style);
}

function wirePopoutControls(doc) {
  const popWin = doc.defaultView;

  const refocusMain = () => {
    // Best-effort: keep the main tab focused so Gamepad API continues to update.
    try {
      window.focus();
    } catch {
      // ignore
    }
    try {
      popWin?.opener?.focus?.();
    } catch {
      // ignore
    }
  };

  // Use capture to run early (mirrors the working SpeedTap behavior).
  doc.addEventListener("pointerdown", refocusMain, true);
  doc.addEventListener("mousedown", refocusMain, true);
  doc.addEventListener("keydown", refocusMain, true);
  try {
    // Some browsers fire events on the window rather than document in PiP.
    popWin?.addEventListener?.("pointerdown", refocusMain, true);
    popWin?.addEventListener?.("mousedown", refocusMain, true);
    popWin?.addEventListener?.("keydown", refocusMain, true);
  } catch {
    // ignore
  }

  const timeline = doc.getElementById("playback-timeline");
  if (timeline) {
    timeline.addEventListener("input", () => {
      if (els.playbackTimeline) {
        els.playbackTimeline.value = timeline.value;
        els.playbackTimeline.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  const toggleBtn = doc.getElementById("playback-toggle-btn");
  toggleBtn?.addEventListener("click", () => togglePlayback());

  const speedRange = doc.getElementById("playback-speed-range");
  const speedInput = doc.getElementById("playback-speed-value");
  if (speedRange) {
    speedRange.addEventListener("input", () => setPlaybackSpeedPct(Number(speedRange.value)));
  }
  if (speedInput) {
    speedInput.addEventListener("change", () => setPlaybackSpeedPct(Number(speedInput.value)));
  }
}

function syncPopoutState(doc, srcCard) {
  const get = (selector) => doc.querySelector(selector);
  const copyText = (selector, sourceEl) => {
    const target = get(selector);
    if (target && sourceEl) target.textContent = sourceEl.textContent;
  };
  const copyHTML = (selector, sourceEl) => {
    const target = get(selector);
    if (target && sourceEl) target.innerHTML = sourceEl.innerHTML;
  };
  const syncInput = (selector, sourceEl) => {
    const target = get(selector);
    if (target && sourceEl) {
      target.value = sourceEl.value;
      target.min = sourceEl.min;
      target.max = sourceEl.max;
    }
  };

  const srcStick = srcCard.querySelector("#overlay-stick");
  const dstStick = get("#overlay-stick");
  if (srcStick && dstStick) {
    dstStick.style.transform = srcStick.style.transform;
  }

  const srcNeedle = srcCard.querySelector("#angle-needle");
  const dstNeedle = get("#angle-needle");
  if (srcNeedle && dstNeedle) {
    dstNeedle.style.left = srcNeedle.style.left;
    dstNeedle.style.opacity = srcNeedle.style.opacity;
  }

  copyHTML("#timeline-markers", srcCard.querySelector("#timeline-markers"));
  copyHTML("#stick-markers", srcCard.querySelector("#stick-markers"));
  copyHTML(".angle-bar-track", srcCard.querySelector(".angle-bar-track"));
  copyHTML("#jump-gap-chart", srcCard.querySelector("#jump-gap-chart"));

  copyText("#playback-time-label", els.playbackTimeLabel);
  copyText("#playback-toggle-btn", document.getElementById("playback-toggle-btn"));
  syncInput("#playback-timeline", els.playbackTimeline);
  syncInput("#playback-speed-range", els.playbackSpeedRange);
  syncInput("#playback-speed-value", els.playbackSpeedValue);

  [
    "overlay-settle",
    "overlay-boost",
    "overlay-first-jump",
    "overlay-angle",
    "overlay-flip-cancel",
    "jump-gap-indicator",
  ].forEach((id) => {
    const src = document.getElementById(id);
    const target = get("#" + id);
    if (target && src) {
      target.textContent = src.textContent;
      target.className = src.className;
    }
  });

  const srcBtns = srcCard.querySelectorAll(".ctrl-btn");
  srcBtns.forEach((btn) => {
    const idx = btn.getAttribute("data-button-index");
    if (idx == null) return;
    const dst = get('.ctrl-btn[data-button-index="' + idx + '"]');
    if (!dst) return;
    dst.classList.toggle("pressed", btn.classList.contains("pressed"));
    const pressAmt = btn.style.getPropertyValue("--press-amount");
    if (pressAmt) dst.style.setProperty("--press-amount", pressAmt);
  });
}

function saveConfigToStorage() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("sf_deadzone", String(STATE.config.deadzone));
      localStorage.setItem("sf_dodgeDeadzone", String(STATE.config.dodgeDeadzone));
    }
  } catch {
    // ignore storage errors
  }
}

function saveBindingsToStorage() {
  try {
    if (typeof localStorage === "undefined") return;
    const stored = {};
    BINDING_KEYS.forEach((key) => {
      stored[key] = MAPPING[key] ?? null;
    });
    localStorage.setItem("sf_bindings", JSON.stringify(stored));
  } catch {
    // ignore storage errors
  }
}

function loadConfigFromStorage() {
  try {
    if (typeof localStorage === "undefined") return;
    const dz = parseFloat(localStorage.getItem("sf_deadzone"));
    if (!Number.isNaN(dz)) {
      STATE.config.deadzone = dz;
    }
    const dd = parseFloat(localStorage.getItem("sf_dodgeDeadzone"));
    if (!Number.isNaN(dd)) {
      STATE.config.dodgeDeadzone = dd;
    }
  } catch {
    // ignore
  }
}

function loadBindingsFromStorage() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem("sf_bindings");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    BINDING_KEYS.forEach((key) => {
      const val = parsed[key];
      if (typeof val === "number" && !Number.isNaN(val)) {
        MAPPING[key] = val;
      }
    });
  } catch {
    // ignore
  }
}

function updatePlaybackOverlay() {
  if (!STATE.playback.active || !STATE.playback.samples.length) return;
  const now = performance.now();
  const elapsed = STATE.playback.isPaused
    ? STATE.playback.elapsedAtPause
    : (now - STATE.playback.startedAt) * (STATE.playback.speedMultiplier || 1);
  const samples = STATE.playback.samples;
  if (elapsed > STATE.playback.duration + 50) {
    const end = STATE.playback.duration;
    STATE.playback.elapsedAtPause = end;
    STATE.playback.isPaused = true;
    STATE.playback.active = true;
    STATE.playback.atEnd = true;
    setPlaybackToggleLabel("Restart");
    renderPlaybackFrame(end);
    return;
  }

  renderPlaybackFrame(elapsed);
}

document.addEventListener("DOMContentLoaded", init);


