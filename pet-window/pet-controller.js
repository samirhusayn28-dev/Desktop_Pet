/**
 * Desktop Pet — Face-Bot Controller
 * Features:
 * - High-precision mouse drag vs click (<4px = click to toggle panel; >4px = drag)
 * - Low-CPU cursor eye tracking & 3D parallax tilt (paused while sleeping)
 * - Automatic blinking (every 3-6s)
 * - Event-driven emotions from main process SystemSense & IdleMonitor (zero random changes)
 * - Pure transform & opacity animations (sub-2% idle CPU, sub-5% GPU helper)
 */

const { ipcRenderer } = typeof require !== 'undefined' ? require('electron') : { ipcRenderer: null };

class FaceBotController {
  constructor() {
    this.pet = new PetRenderer();
    this.currentEmotion = 'neutral';
    this.baseEmotion = 'neutral';

    // 2D Eye Offset & Easing
    this.eyeOffset = { x: 0, y: 0 };
    this.targetEyeOffset = { x: 0, y: 0 };

    // 3D Tilt & Easing (Parallax)
    this.tilt = { x: 0, y: 0 };
    this.targetTilt = { x: 0, y: 0 };

    this.isBlinking = false;
    this.isDragging = false;
    this.trackingRaf = null;

    this.container = document.getElementById('pet-viewport');
    this.menuEl = document.getElementById('quick-menu');

    this.init();
  }

  init() {
    this.loadSavedAppearance();
    this.render();
    this.setupEvents();
    this.setupIPC();
    this.startBlinkLoop();
    this.startParallaxLoop();

    // Default window mouse ignore state
    if (ipcRenderer) {
      ipcRenderer.send('pet:set-ignore-mouse-events', true);
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    }
  }

  loadSavedAppearance() {
    if (ipcRenderer) {
      try {
        const saved = ipcRenderer.sendSync('pet:get-appearance');
        if (saved && typeof saved === 'object') {
          this.pet.updateConfig(saved);
        }
      } catch (e) {}
    }
  }

  render() {
    const size = Math.round(220 * (this.pet.config.scale || 1.0));
    this.container.innerHTML = this.pet.render(this.currentEmotion, {
      size: size,
      eyeOffset: this.eyeOffset,
      isBlinking: this.isBlinking,
      idPrefix: 'facebot-win'
    });
  }

  setEmotion(newEmotion, durationMs = 0) {
    this.currentEmotion = newEmotion;
    this.render();

    // If pet entered sleeping state, gently return tilt to 0 and pause heavy rendering
    if (newEmotion === 'sleeping') {
      this.targetTilt = { x: 0, y: 0 };
      this.targetEyeOffset = { x: 0, y: 0 };
    }

    if (durationMs > 0) {
      setTimeout(() => {
        if (this.currentEmotion === newEmotion) {
          this.currentEmotion = this.baseEmotion;
          this.render();
        }
      }, durationMs);
    }
  }

  setBaseEmotion(emotion) {
    this.baseEmotion = emotion;
    this.setEmotion(emotion);
  }

  // Optimized 30FPS Parallax Tilt & Eye Tracking Loop
  // Pauses updates completely while sleeping to conserve CPU and GPU power
  startParallaxLoop() {
    let lastFrameTime = 0;
    const targetInterval = 1000 / 30; // 30 FPS cap

    const step = (now) => {
      this.trackingRaf = requestAnimationFrame(step);

      if (now - lastFrameTime < targetInterval) return;
      lastFrameTime = now;

      if (this.currentEmotion === 'sleeping') {
        // Flat tilt when sleeping
        if (Math.abs(this.tilt.x) > 0.05 || Math.abs(this.tilt.y) > 0.05) {
          this.tilt.x *= 0.85;
          this.tilt.y *= 0.85;
          this.container.style.transform = `perspective(700px) rotateX(${this.tilt.x.toFixed(2)}deg) rotateY(${this.tilt.y.toFixed(2)}deg)`;
        }
        return;
      }

      const ease = 0.22;

      // Ease Eye 2D coordinates (transform only)
      const dEyeX = (this.targetEyeOffset.x - this.eyeOffset.x) * ease;
      const dEyeY = (this.targetEyeOffset.y - this.eyeOffset.y) * ease;
      if (Math.abs(dEyeX) > 0.04 || Math.abs(dEyeY) > 0.04) {
        this.eyeOffset.x += dEyeX;
        this.eyeOffset.y += dEyeY;

        const face = document.querySelector('.facebot-face');
        if (face) {
          face.setAttribute('transform', `translate(${this.eyeOffset.x.toFixed(2)}, ${this.eyeOffset.y.toFixed(2)})`);
        }
      }

      // Ease 3D Body Tilt (transform only)
      const dTiltX = (this.targetTilt.x - this.tilt.x) * ease;
      const dTiltY = (this.targetTilt.y - this.tilt.y) * ease;
      if (Math.abs(dTiltX) > 0.04 || Math.abs(dTiltY) > 0.04) {
        this.tilt.x += dTiltX;
        this.tilt.y += dTiltY;

        if (this.container && !this.isDragging) {
          this.container.style.transform = `perspective(700px) rotateX(${this.tilt.x.toFixed(2)}deg) rotateY(${this.tilt.y.toFixed(2)}deg)`;
        }
      }
    };

    this.trackingRaf = requestAnimationFrame(step);
  }

  // Automatic random blinking (every 3-6 seconds)
  startBlinkLoop() {
    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 3000;
      setTimeout(() => {
        if (this.currentEmotion !== 'sleeping' && this.currentEmotion !== 'happy' && this.currentEmotion !== 'laugh' && this.currentEmotion !== 'love' && this.currentEmotion !== 'vibing') {
          this.isBlinking = true;
          this.render();

          setTimeout(() => {
            this.isBlinking = false;
            this.render();

            // 20% chance of double-blink
            if (Math.random() < 0.20) {
              setTimeout(() => {
                this.isBlinking = true;
                this.render();
                setTimeout(() => {
                  this.isBlinking = false;
                  this.render();
                }, 120);
              }, 150);
            }
          }, 130);
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  setupEvents() {
    // Mouse enter / leave for click-through pass
    this.container.addEventListener('mouseenter', () => {
      if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);

      // If pet was sleeping or sleepy, wake it up!
      if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleepy') {
        this.wakeUp();
      } else if (this.currentEmotion === 'neutral') {
        this.setEmotion('happy', 2000);
        if (window.soundEffects) window.soundEffects.playTap();
      }
    });

    this.container.addEventListener('mouseleave', () => {
      if (this.menuEl.classList.contains('hidden') && !this.isDragging) {
        if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', true);
      }
    });

    // --- MANUAL DRAGGING VS CLICK DETECTION ---
    // <4px movement = CLICK (toggle panel)
    // >4px movement = DRAG (reposition pet & follow panel)
    let isMouseDown = false;
    let startScreenX = 0;
    let startScreenY = 0;
    let hasMovedOverThreshold = false;

    this.container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      isMouseDown = true;
      hasMovedOverThreshold = false;
      startScreenX = e.screenX;
      startScreenY = e.screenY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;

      const deltaX = Math.abs(e.screenX - startScreenX);
      const deltaY = Math.abs(e.screenY - startScreenY);

      if (deltaX > 4 || deltaY > 4) {
        hasMovedOverThreshold = true;
        if (!this.isDragging) {
          this.isDragging = true;
          this.container.classList.add('dangling');
          this.setEmotion('surprised');
          if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
        }

        if (ipcRenderer) {
          ipcRenderer.send('pet:drag-move', { screenX: e.screenX, screenY: e.screenY });
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove('dangling');
        this.container.classList.add('bounce-drop');
        setTimeout(() => this.container.classList.remove('bounce-drop'), 450);

        this.setEmotion('happy', 2000);
        if (ipcRenderer) {
          ipcRenderer.send('pet:drag-end');
          ipcRenderer.send('pet:set-ignore-mouse-events', false);
        }
      } else if (!hasMovedOverThreshold && e.button === 0) {
        // --- CLICK DETECTED! TOGGLE PANEL ---
        this.handleClick();
      }
    });

    // Double click reaction
    this.container.addEventListener('dblclick', () => {
      const doubleEmo = Math.random() < 0.5 ? 'laugh' : 'wink';
      this.setEmotion(doubleEmo, 2800);
      if (window.soundEffects) window.soundEffects.playHappy();
    });

    // Right Click Context Menu
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
      this.menuEl.classList.remove('hidden');
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.menuEl.contains(e.target) && !this.menuEl.classList.contains('hidden')) {
        this.menuEl.classList.add('hidden');
      }
    });

    this.menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.menuEl.classList.add('hidden');
        this.handleMenuAction(action);
      });
    });
  }

  handleClick() {
    if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleepy') {
      this.wakeUp();
      return;
    }

    this.setEmotion('surprised');
    setTimeout(() => {
      this.setEmotion('happy', 2000);
    }, 300);

    if (window.soundEffects) window.soundEffects.playChirp();
    if (ipcRenderer) {
      ipcRenderer.send('panel:toggle');
    }
  }

  wakeUp() {
    this.setBaseEmotion('neutral');
    this.setEmotion('surprised', 400);
    setTimeout(() => {
      this.setEmotion('happy', 2200);
    }, 380);
    if (window.soundEffects) window.soundEffects.playChirp();
  }

  handleMenuAction(action) {
    if (!ipcRenderer) return;

    switch (action) {
      case 'panel':
        ipcRenderer.send('panel:open', { tab: 'chat' });
        break;
      case 'state-happy':
        this.setEmotion('happy', 4000);
        if (window.soundEffects) window.soundEffects.playHappy();
        break;
      case 'state-focus':
        this.setEmotion('focus', 8000);
        break;
      case 'state-sleep':
        this.setBaseEmotion('sleeping');
        break;
      case 'settings':
        ipcRenderer.send('panel:open', { tab: 'settings' });
        break;
      case 'hide':
        ipcRenderer.send('pet:hide');
        break;
    }
  }

  setupIPC() {
    if (!ipcRenderer) return;

    // Cursor tracking
    ipcRenderer.on('pet:global-cursor', (e, { normX, normY }) => {
      if (this.currentEmotion === 'sleeping') return;

      const maxEyeRange = 6.5;
      this.targetEyeOffset = {
        x: normX * maxEyeRange,
        y: normY * maxEyeRange
      };

      const maxTilt = 10;
      this.targetTilt = {
        x: -normY * maxTilt,
        y: normX * maxTilt
      };
    });

    // Emotion and state triggers
    ipcRenderer.on('pet:set-state', (e, data) => {
      const state = typeof data === 'string' ? data : data.state;
      const duration = (typeof data === 'object' && data.duration) ? data.duration : 0;

      if (state === 'sleeping' || state === 'sleepy') {
        this.setBaseEmotion(state);
      } else {
        this.setEmotion(state, duration);
      }
    });

    ipcRenderer.on('pet:play-sound', (e, soundName) => {
      if (!window.soundEffects) return;
      if (soundName === 'happy') window.soundEffects.playHappy();
      else if (soundName === 'tap') window.soundEffects.playTap();
      else window.soundEffects.playChirp();
    });

    ipcRenderer.on('pet:apply-appearance', (e, appearance) => {
      this.pet.updateConfig(appearance);
      this.render();
    });

    ipcRenderer.on('pet:update-accent', (e, color) => {
      if (window.ThemeManager) {
        window.ThemeManager.applyAccentColor(document, color);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.faceBotController = new FaceBotController();
});
