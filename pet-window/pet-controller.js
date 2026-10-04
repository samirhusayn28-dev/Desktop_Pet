/**
 * Desktop Pet — Face-Bot Controller
 * 
 * Features:
 * - Event-driven emotions and animations with zero CPU when idle/sleeping
 * - Global cursor eye-tracking with smooth easing and 3D body tilt
 * - Random blinking (every 2-6s, 20% double-blink chance) and breathing
 * - Full interactions: hover (happy), click (<4px = panel toggle), drag (>=4px = dangling/bounce), double click (laugh/wink), right-click quick menu
 * - Solid Cute Material speech bubble (notifies main to expand/shrink pet window)
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
    this.isSleeping = false;
    this.isRafActive = false;
    this.rafId = null;
    this.emotionTimeout = null;

    this.container = document.getElementById('pet-viewport');
    this.menuEl = document.getElementById('quick-menu');
    this.bubbleEl = document.getElementById('pet-speech-bubble');
    this.bubbleBadge = document.getElementById('bubble-badge');
    this.bubbleText = document.getElementById('bubble-text');
    this.bubbleTimer = null;

    this.init();
  }

  init() {
    this.loadSavedAppearance();
    this.render();
    this.setupEvents();
    this.setupIPC();
    this.startBlinkLoop();
    this.startBreathingLoop();

    // Default window mouse ignore state
    if (ipcRenderer) {
      ipcRenderer.send('pet:set-ignore-mouse-events', true);
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
    const size = Math.round(180 * (this.pet.config.scale || 1.0));
    this.container.innerHTML = this.pet.render(this.currentEmotion, {
      size: size,
      eyeOffset: this.eyeOffset,
      isBlinking: this.isBlinking,
      idPrefix: 'facebot-win'
    });
  }

  setEmotion(newEmotion, durationMs = 0) {
    this.currentEmotion = newEmotion;
    this.isSleeping = (newEmotion === 'sleeping');

    if (this.container) {
      if (this.isSleeping) {
        this.container.classList.add('sleeping');
      } else {
        this.container.classList.remove('sleeping');
      }
    }

    if (this.isSleeping) {
      this.targetTilt = { x: 0, y: 0 };
      this.targetEyeOffset = { x: 0, y: 0 };
      this.isRafActive = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    this.render();

    if (this.emotionTimeout) {
      clearTimeout(this.emotionTimeout);
      this.emotionTimeout = null;
    }

    if (durationMs > 0) {
      this.emotionTimeout = setTimeout(() => {
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

  // --- Solid Cute Material Speech Bubble ---
  showBubble({ text, badge = '', duration = 5000, sound = '', emotion = '', bounce = false }) {
    if (!this.bubbleEl || !text) return;

    if (bounce && this.container) {
      this.container.classList.remove('bounce-drop');
      void this.container.offsetWidth;
      this.container.classList.add('bounce-drop');
      setTimeout(() => {
        if (this.container) this.container.classList.remove('bounce-drop');
      }, 500);
    }

    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }

    if (badge && this.bubbleBadge) {
      this.bubbleBadge.textContent = badge;
      this.bubbleBadge.style.display = 'inline-block';
    } else if (this.bubbleBadge) {
      this.bubbleBadge.style.display = 'none';
      this.bubbleBadge.textContent = '';
    }

    if (this.bubbleText) {
      this.bubbleText.textContent = text;
    }

    this.bubbleEl.classList.remove('fade-out');
    this.bubbleEl.classList.add('fade-in');
    this.bubbleEl.style.display = 'block';

    // Tell main process to expand pet window height so bubble fits without clipping
    if (ipcRenderer) {
      ipcRenderer.send('pet:bubble-shown');
    }

    if (sound && window.soundEffects) {
      if (sound === 'chirp') window.soundEffects.playChirp();
      else if (sound === 'happy') window.soundEffects.playHappy();
      else if (sound === 'alarm') window.soundEffects.playAlarm();
      else if (sound === 'tap') window.soundEffects.playTap();
      else window.soundEffects.playChirp();
    }

    if (emotion) {
      this.setEmotion(emotion, duration);
    }

    this.bubbleTimer = setTimeout(() => {
      this.hideBubble();
    }, duration);
  }

  hideBubble() {
    if (!this.bubbleEl) return;
    this.bubbleEl.classList.remove('fade-in');
    this.bubbleEl.classList.add('fade-out');

    setTimeout(() => {
      this.bubbleEl.style.display = 'none';
      if (this.bubbleText) this.bubbleText.textContent = '';
      if (this.bubbleBadge) this.bubbleBadge.textContent = '';
      this.bubbleEl.classList.remove('fade-out');

      // Tell main process to reset pet window bounds to compact pet size
      if (ipcRenderer) {
        ipcRenderer.send('pet:bubble-hidden');
      }
    }, 200);

    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
  }

  // --- Event-Driven Cursor & Motion Easing ---
  requestMotionUpdate() {
    if (this.isRafActive || this.isSleeping) return;
    this.isRafActive = true;
    this.stepMotion();
  }

  stepMotion() {
    if (this.isSleeping) {
      this.isRafActive = false;
      return;
    }

    const ease = 0.22;
    let needsContinue = false;

    // 1. Ease Eye Coordinates (within small natural range)
    const dEyeX = (this.targetEyeOffset.x - this.eyeOffset.x) * ease;
    const dEyeY = (this.targetEyeOffset.y - this.eyeOffset.y) * ease;
    if (Math.abs(dEyeX) > 0.03 || Math.abs(dEyeY) > 0.03) {
      this.eyeOffset.x += dEyeX;
      this.eyeOffset.y += dEyeY;
      const face = document.querySelector('.facebot-face');
      if (face) {
        face.setAttribute('transform', `translate(${this.eyeOffset.x.toFixed(2)}, ${this.eyeOffset.y.toFixed(2)})`);
      }
      needsContinue = true;
    } else {
      this.eyeOffset.x = this.targetEyeOffset.x;
      this.eyeOffset.y = this.targetEyeOffset.y;
    }

    // 2. Ease 3D Body Tilt
    const dTiltX = (this.targetTilt.x - this.tilt.x) * ease;
    const dTiltY = (this.targetTilt.y - this.tilt.y) * ease;
    if (Math.abs(dTiltX) > 0.03 || Math.abs(dTiltY) > 0.03) {
      this.tilt.x += dTiltX;
      this.tilt.y += dTiltY;
      if (this.container && !this.isDragging) {
        this.container.style.transform = `perspective(700px) rotateX(${this.tilt.x.toFixed(2)}deg) rotateY(${this.tilt.y.toFixed(2)}deg)`;
      }
      needsContinue = true;
    } else {
      this.tilt.x = this.targetTilt.x;
      this.tilt.y = this.targetTilt.y;
    }

    if (needsContinue) {
      this.rafId = requestAnimationFrame(() => this.stepMotion());
    } else {
      this.isRafActive = false;
      this.rafId = null;
    }
  }

  // Lightweight Eye Blinking (uses direct scaleY transform without innerHTML re-render)
  setBlink(isBlinking) {
    this.isBlinking = isBlinking;
    const eyes = this.container ? this.container.querySelectorAll('.eye-left, .eye-right') : null;
    if (eyes && eyes.length > 0) {
      eyes.forEach(eye => {
        eye.style.transformBox = 'fill-box';
        eye.style.transformOrigin = 'center';
        eye.style.transform = isBlinking ? 'scaleY(0.12)' : '';
      });
    } else {
      this.render();
    }
  }

  // Automatic random blinking (every 2-6 seconds, 20% double-blink)
  startBlinkLoop() {
    const scheduleNext = () => {
      const delay = 2200 + Math.random() * 3800;
      setTimeout(() => {
        if (!this.isSleeping &&
            this.currentEmotion !== 'happy' &&
            this.currentEmotion !== 'laugh' &&
            this.currentEmotion !== 'love' &&
            this.currentEmotion !== 'vibing' &&
            this.currentEmotion !== 'squint') {
          this.setBlink(true);

          setTimeout(() => {
            this.setBlink(false);

            // 20% chance of double-blink
            if (Math.random() < 0.20) {
              setTimeout(() => {
                this.setBlink(true);
                setTimeout(() => {
                  this.setBlink(false);
                }, 90);
              }, 130);
            }
          }, 110);
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  // Periodic burst breathing (1.8s breath every 8-10s; 0 animation layers when idle)
  startBreathingLoop() {
    const triggerBreath = () => {
      if (this.isSleeping || this.isDragging || !this.container) {
        this.breathTimer = setTimeout(triggerBreath, 4000);
        return;
      }
      this.container.classList.add('breath-burst');
      setTimeout(() => {
        if (this.container) this.container.classList.remove('breath-burst');
        this.breathTimer = setTimeout(triggerBreath, 6500 + Math.random() * 2000);
      }, 1850);
    };
    this.breathTimer = setTimeout(triggerBreath, 3500);
  }

  setupEvents() {
    // Mouse hover management (allows interaction with pet, bubbles, and menus)
    const onEnterInteractive = () => {
      if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
      if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleepy') {
        this.wakeUp();
      } else if (this.currentEmotion === 'neutral') {
        this.setEmotion('happy', 2000);
        if (window.soundEffects) window.soundEffects.playTap();
      }
    };

    const onLeaveInteractive = () => {
      if (!this.isDragging && (!this.menuEl || this.menuEl.classList.contains('hidden')) && ipcRenderer) {
        ipcRenderer.send('pet:set-ignore-mouse-events', true);
      }
    };

    if (this.container) {
      this.container.addEventListener('mouseenter', onEnterInteractive);
      this.container.addEventListener('mouseleave', onLeaveInteractive);
    }

    if (this.bubbleEl) {
      this.bubbleEl.addEventListener('mouseenter', () => {
        if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
        // Pause auto-dismiss timer on hover
        if (this.bubbleTimer) {
          clearTimeout(this.bubbleTimer);
          this.bubbleTimer = null;
        }
      });
      this.bubbleEl.addEventListener('mouseleave', () => {
        if (!this.isDragging && ipcRenderer) {
          ipcRenderer.send('pet:set-ignore-mouse-events', true);
        }
        this.bubbleTimer = setTimeout(() => this.hideBubble(), 2000);
      });
    }

    // High-Precision Drag vs Click (<4px = click, >=4px = drag)
    let isMouseDown = false;
    let startX = 0;
    let startY = 0;
    let hasMoved = false;

    this.container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      isMouseDown = true;
      hasMoved = false;
      startX = e.screenX;
      startY = e.screenY;
    });

    window.addEventListener('mousemove', (moveEvent) => {
      if (!isMouseDown) return;
      const dist = Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY);

      if (dist >= 4) {
        hasMoved = true;
        if (!this.isDragging) {
          this.isDragging = true;
          this.container.classList.add('dangling');
          this.setEmotion('surprised');
          if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
        }

        if (ipcRenderer) {
          ipcRenderer.send('pet:drag-move', {
            screenX: moveEvent.screenX,
            screenY: moveEvent.screenY
          });
        }
      }
    });

    window.addEventListener('mouseup', (upEvent) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove('dangling');
        this.container.classList.add('bounce-drop');
        setTimeout(() => this.container.classList.remove('bounce-drop'), 450);

        this.setEmotion('happy', 2000);
        if (window.soundEffects) window.soundEffects.playTap();

        if (ipcRenderer) {
          ipcRenderer.send('pet:drag-end');
          ipcRenderer.send('pet:set-ignore-mouse-events', false);
        }
      } else if (!hasMoved && upEvent.button === 0) {
        // Pure Click (<4px movement): Toggle assistant panel!
        this.handleClick();
      }
    });

    // Double click for playful reaction
    this.container.addEventListener('dblclick', () => {
      const doubleEmo = Math.random() < 0.5 ? 'laugh' : 'wink';
      this.setEmotion(doubleEmo, 2800);
      if (window.soundEffects) window.soundEffects.playHappy();
    });

    // Right Click Context Menu
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.menuEl) {
        if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
        this.menuEl.classList.remove('hidden');
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target) && !this.menuEl.classList.contains('hidden')) {
        this.menuEl.classList.add('hidden');
        if (!this.isDragging && ipcRenderer) {
          ipcRenderer.send('pet:set-ignore-mouse-events', true);
        }
      }
    });

    if (this.menuEl) {
      this.menuEl.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
          const action = item.dataset.action;
          this.menuEl.classList.add('hidden');
          this.handleMenuAction(action);
        });
      });
    }
  }

  handleClick() {
    if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleepy') {
      this.wakeUp();
      return;
    }

    this.setEmotion('surprised', 300);
    setTimeout(() => {
      this.setEmotion('happy', 2000);
    }, 300);

    if (window.soundEffects) window.soundEffects.playChirp();
    if (ipcRenderer) {
      ipcRenderer.send('pet:clicked');
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

    // 1. Global Cursor Coordinate Updates (handles both channel names)
    const handleCursorUpdate = ({ normX, normY }) => {
      if (this.isSleeping) return;

      const eyeMax = 5.5 * (this.pet.config.eyeSize || 1.0);
      this.targetEyeOffset = {
        x: normX * eyeMax,
        y: normY * eyeMax
      };

      this.targetTilt = {
        x: -normY * 9,
        y: normX * 11
      };

      this.requestMotionUpdate();
    };

    ipcRenderer.on('pet:global-cursor', (event, data) => handleCursorUpdate(data));
    ipcRenderer.on('pet:cursor-pos', (event, data) => handleCursorUpdate(data));

    // 2. Emotion and state triggers (handles both string and { state, duration })
    ipcRenderer.on('pet:set-state', (event, data) => {
      const state = typeof data === 'string' ? data : (data?.state || 'neutral');
      const duration = (typeof data === 'object' && data?.duration) ? data.duration : 0;

      if (state === 'sleeping' || state === 'sleepy') {
        this.setBaseEmotion(state);
      } else {
        this.setEmotion(state, duration);
      }
    });

    ipcRenderer.on('pet:set-emotion', (event, emotion, duration = 3000) => {
      this.setEmotion(emotion, duration);
    });

    // 3. Embedded Speech Bubble
    ipcRenderer.on('pet:show-bubble', (event, data) => {
      if (data) this.showBubble(data);
    });

    ipcRenderer.on('pet:hide-bubble', () => {
      this.hideBubble();
    });

    // 4. Real-time Appearance Updates
    ipcRenderer.on('pet:apply-appearance', (event, config) => {
      this.pet.updateConfig(config);
      this.render();
    });

    ipcRenderer.on('pet:update-accent', (event, color) => {
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-glow', `color-mix(in srgb, ${color} 75%, transparent)`);
      document.documentElement.style.setProperty('--accent-border', `color-mix(in srgb, ${color} 32%, transparent)`);
      this.pet.updateConfig({ primaryColor: color, primaryGlow: color });
      this.render();
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.petController = new FaceBotController();
});
