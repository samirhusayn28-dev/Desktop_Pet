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

var { ipcRenderer } = typeof require !== 'undefined' ? require('electron') : { ipcRenderer: null };

const EMOTION_PRIORITIES = {
  // Level 5: AI states and errors
  sad: 5,        // sad when from AI error (or volume low: priority 2)
  confused: 5,
  error: 5,
  thinking: 5,
  reading: 5,
  grateful: 5,   // user thanked in chat
  love: 5,       // chat "love you" or pin note

  // Level 4: User interaction on the pet & achievements
  surprised: 4,  // surprised on click/drag
  happy: 4,      // happy on hover/click-after
  dizzy: 4,      // dizzy on fast drag / rapid clicks
  laugh: 4,      // laugh on double click / pomodoro finish
  wink: 4,       // wink on double click / todo / note
  blush: 4,      // blush on 4s hover
  scared: 4,     // scared on fast cursor approach
  proud: 4,      // all to-dos completed
  excited: 4,    // test connection / 3rd pomodoro / import
  focus: 4,      // pomodoro focus session

  // Level 3: Reminder events
  celebrating: 3,
  worried: 3,    // missed reminder
  'reminder-due': 3,

  // Level 2: System reactions
  squint: 2,
  dull: 2,
  dim: 2,
  vibing: 2,
  music: 2,
  irritated: 2,
  'low-battery': 2,
  charging: 2,
  energized: 2,
  stressed: 2,
  relieved: 2,
  annoyed: 2,
  yawn: 2,
  goodbye: 2,

  // Level 1: Idle baseline
  bored: 1,
  neutral: 1,
  sleepy: 1,
  sleeping: 1
};

class FaceBotController {
  constructor() {
    this.pet = new PetRenderer();
    this.currentEmotion = 'neutral';
    this.baseEmotion = 'neutral';
    this.currentPriority = 1;
    this.heldState = null;
    this.isHeld = false;
    this.lastDblClickEmo = null;

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

    // Interaction triggers
    this.recentClicks = [];
    this.hoverTimer = null;
    this.isFastDrag = false;
    this.lastCursorTime = 0;
    this.lastNormDist = 0;

    // Item H2: Driven strictly by insidePet state from Main Process hit testing
    this.isInsidePet = false;
    this.mouseDownInside = false;

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
    // Expose data-emotion on all root containers for real test assertions (Item E3)
    if (this.container) {
      this.container.setAttribute('data-emotion', this.currentEmotion);
    }
    const rootEl = document.getElementById('pet-root-container');
    if (rootEl) {
      rootEl.setAttribute('data-emotion', this.currentEmotion);
    }
    document.body.setAttribute('data-emotion', this.currentEmotion);
  }

  canTransitionTo(newEmotion, priority = null) {
    const reqPriority = priority !== null ? priority : (EMOTION_PRIORITIES[newEmotion] || 2);
    // If no active temporary emotion is running, allow
    if (!this.emotionTimeout) {
      return true;
    }
    // If active temporary emotion is running with a higher priority, lower priority cannot overwrite
    if (this.currentPriority && this.currentPriority > reqPriority) {
      return false;
    }
    return true;
  }

  getBaselineEmotion() {
    if (this.isHeld && this.heldState) {
      return this.heldState;
    }
    return this.baseEmotion || 'neutral';
  }

  setEmotion(newEmotion, durationMs = 0, priority = null, force = false, held = false) {
    const reqPriority = priority !== null ? priority : (EMOTION_PRIORITIES[newEmotion] || 2);

    if (!force && !this.canTransitionTo(newEmotion, reqPriority)) {
      return false;
    }

    if (held) {
      this.isHeld = true;
      this.heldState = newEmotion;
    } else if (newEmotion === 'neutral' || force) {
      this.isHeld = false;
      this.heldState = null;
    }

    this.currentEmotion = newEmotion;
    this.currentPriority = reqPriority;
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
        this.currentEmotion = this.getBaselineEmotion();
        this.currentPriority = EMOTION_PRIORITIES[this.currentEmotion] || 1;
        this.isSleeping = (this.currentEmotion === 'sleeping');
        if (this.container) {
          if (this.isSleeping) {
            this.container.classList.add('sleeping');
          } else {
            this.container.classList.remove('sleeping');
          }
        }
        this.render();
        this.emotionTimeout = null;
      }, durationMs);
    } else {
      if (newEmotion === 'sleeping' || newEmotion === 'sleepy' || newEmotion === 'neutral' || newEmotion === 'bored') {
        this.baseEmotion = newEmotion;
      }
    }
    return true;
  }

  setBaseEmotion(emotion) {
    this.baseEmotion = emotion;
    if (!this.emotionTimeout) {
      this.currentEmotion = emotion;
      this.currentPriority = EMOTION_PRIORITIES[emotion] || 1;
      this.isSleeping = (emotion === 'sleeping');
      if (this.container) {
        if (this.isSleeping) {
          this.container.classList.add('sleeping');
        } else {
          this.container.classList.remove('sleeping');
        }
      }
      this.render();
    }
  }

  // --- Solid Cute Material Speech Bubble ---
  showBubble({ text, badge = '', duration = 5000, sound = '', category = '', emotion = '', bounce = false }) {
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
      const soundCat = category || (
        (badge && (badge.includes('REMINDER') || badge.includes('POSTURE') || badge.includes('HYDRATION') || badge.includes('SNOOZED')))
          ? 'reminders'
          : ((badge && (badge.includes('TIMER') || badge.includes('POMODORO') || badge.includes('BREAK'))) ? 'timer' : 'reactions')
      );
      window.soundEffects.play(sound, soundCat);
    }

    if (emotion) {
      this.setEmotion(emotion, duration, EMOTION_PRIORITIES[emotion] || 3);
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
    // Item H2: Driven strictly by insidePet state from Main Process hit testing
    if (ipcRenderer) {
      ipcRenderer.on('pet:inside-change', (event, isInside) => {
        this.isInsidePet = !!isInside;
        if (this.isInsidePet) {
          if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleepy') {
            this.wakeUp();
          } else if (this.currentEmotion === 'neutral') {
            this.setEmotion('happy', 2000, 4);
            if (window.soundEffects) window.soundEffects.playTap();
          }

          // 4s continuous hover inside pet -> blush (Item E1 & E2)
          if (this.hoverTimer) clearTimeout(this.hoverTimer);
          this.hoverTimer = setTimeout(() => {
            if (this.isInsidePet && !this.isDragging && !this.isSleeping) {
              this.setEmotion('blush', 3000, 4);
            }
          }, 4000);
        } else {
          if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
          }
          if (!this.isDragging) {
            // Mouse exited pet body shape
            if (this.currentEmotion === 'happy' && !this.emotionTimeout) {
              this.setEmotion(this.getBaselineEmotion());
            }
          }
        }
      });
    }

    // High-Precision Drag vs Click (<4px = click, >=4px = drag)
    // ONLY driven if mousedown and mouseup both happened inside the shape!
    let isMouseDown = false;
    let startX = 0;
    let startY = 0;
    let lastMoveTime = 0;
    let lastMoveX = 0;
    let lastMoveY = 0;
    let hasMoved = false;

    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      // Only proceed if mouse is inside the pet shape
      if (!this.isInsidePet) return;

      if (this.hoverTimer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }

      this.mouseDownInside = true;
      isMouseDown = true;
      hasMoved = false;
      this.isFastDrag = false;
      startX = e.screenX;
      startY = e.screenY;
      lastMoveTime = Date.now();
      lastMoveX = e.screenX;
      lastMoveY = e.screenY;
    });

    window.addEventListener('mousemove', (moveEvent) => {
      if (!isMouseDown || !this.mouseDownInside) return;
      const dist = Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY);

      const now = Date.now();
      const dt = Math.max(1, now - (lastMoveTime || now));
      const stepDist = Math.hypot(moveEvent.screenX - (lastMoveX || moveEvent.screenX), moveEvent.screenY - (lastMoveY || moveEvent.screenY));
      if (stepDist / dt > 2.0) {
        this.isFastDrag = true;
      }
      lastMoveTime = now;
      lastMoveX = moveEvent.screenX;
      lastMoveY = moveEvent.screenY;

      if (dist >= 4) {
        hasMoved = true;
        if (!this.isDragging) {
          this.isDragging = true;
          this.container.classList.add('dangling');
          this.setEmotion('surprised', 0, 4);
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
      const wasInsideOnStart = this.mouseDownInside;
      isMouseDown = false;
      this.mouseDownInside = false;

      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove('dangling');
        this.container.classList.add('bounce-drop');
        setTimeout(() => this.container.classList.remove('bounce-drop'), 450);

        if (this.isFastDrag) {
          this.isFastDrag = false;
          this.setEmotion('dizzy', 3000, 4);
        } else {
          this.setEmotion('happy', 2000, 4);
        }
        if (window.soundEffects) window.soundEffects.playTap();

        if (ipcRenderer) {
          ipcRenderer.send('pet:drag-end');
        }
      } else if (!hasMoved && upEvent.button === 0) {
        // Pure Click (<4px movement):
        // "A click toggles the panel only if mousedown and mouseup both happened inside the shape."
        if (wasInsideOnStart && this.isInsidePet) {
          this.handleClick();
        }
      }
    });

    // Double click for playful reaction: strictly alternating laugh and wink (Item E3)
    window.addEventListener('dblclick', (e) => {
      if (this.isInsidePet && e.button === 0) {
        this.lastDblClickEmo = (this.lastDblClickEmo === 'laugh') ? 'wink' : 'laugh';
        this.setEmotion(this.lastDblClickEmo, 2800, 4);
        if (window.soundEffects) {
          if (this.lastDblClickEmo === 'laugh') window.soundEffects.playHappy();
          else window.soundEffects.playTap();
        }
      }
    });

    // Right Click Context Menu: only inside pet shape
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.isInsidePet && this.menuEl) {
        if (ipcRenderer) ipcRenderer.send('pet:set-ignore-mouse-events', false);
        this.menuEl.classList.remove('hidden');
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target) && !this.menuEl.classList.contains('hidden')) {
        this.menuEl.classList.add('hidden');
        if (!this.isDragging && !this.isInsidePet && ipcRenderer) {
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

    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    // 5 rapid clicks (within 1.5s) -> dizzy
    const now = Date.now();
    this.recentClicks.push(now);
    this.recentClicks = this.recentClicks.filter(t => now - t <= 1500);
    if (this.recentClicks.length >= 5) {
      this.recentClicks = [];
      this.setEmotion('dizzy', 3000, 4);
      if (window.soundEffects) window.soundEffects.playTap();
      return;
    }

    // USER REQUIREMENT: surprised: click on the pet (then happy ~1.5 s)
    this.setEmotion('surprised', 1200, 4);
    this.clickTimeout = setTimeout(() => {
      this.setEmotion('happy', 1500, 4);
      this.clickTimeout = null;
    }, 1200);

    if (window.soundEffects) window.soundEffects.playChirp();
    if (ipcRenderer) {
      ipcRenderer.send('pet:clicked');
    }
  }

  wakeUp() {
    this.setBaseEmotion('neutral');
    this.setEmotion('surprised', 400, 4);
    setTimeout(() => {
      this.setEmotion('happy', 2200, 4);
    }, 380);
    if (window.soundEffects) window.soundEffects.playChirp();
    if (ipcRenderer) {
      ipcRenderer.send('pet:reset-idle');
    }
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

      // Fast cursor approach towards pet -> scared (Item E1 & E2)
      const now = Date.now();
      if (this.lastCursorTime && this.lastNormDist !== undefined) {
        const dt = (now - this.lastCursorTime) / 1000;
        const normDist = Math.hypot(normX, normY);
        if (dt > 0.01 && dt < 0.25) {
          const deltaDist = this.lastNormDist - normDist;
          const approachRate = deltaDist / dt;
          if (approachRate > 4.5 && normDist < 0.7 && normDist > 0.1 && !this.isInsidePet) {
            this.setEmotion('scared', 2000, 4);
          }
        }
        this.lastNormDist = normDist;
      } else {
        this.lastNormDist = Math.hypot(normX, normY);
      }
      this.lastCursorTime = now;

      const hasGlasses = Boolean(this.pet.config && this.pet.config.glassesEnabled);
      const limit = hasGlasses ? 3.0 : 5.5;
      const eyeMax = limit * (this.pet.config.eyeSize || 1.0);
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

    // 2. Emotion and state triggers (handles string, { state, duration, priority, force, held })
    ipcRenderer.on('pet:set-state', (event, data) => {
      const state = typeof data === 'string' ? data : (data?.state || 'neutral');
      const duration = (typeof data === 'object' && data?.duration !== undefined) ? data.duration : 0;
      const priority = (typeof data === 'object' && data?.priority !== undefined) ? data.priority : null;
      const force = (typeof data === 'object' && data?.force) ? true : false;
      const held = (typeof data === 'object' && data?.held) ? true : false;

      if (force) {
        if (this.emotionTimeout) {
          clearTimeout(this.emotionTimeout);
          this.emotionTimeout = null;
        }
        if (state === 'sleeping' || state === 'sleepy' || state === 'neutral' || state === 'bored') {
          this.baseEmotion = state;
        }
        this.setEmotion(state, duration, priority || 5, true, held);
      } else if (state === 'sleeping' || state === 'sleepy' || state === 'neutral' || state === 'bored') {
        this.setBaseEmotion(state);
      } else {
        this.setEmotion(state, duration, priority, false, held);
      }
    });

    ipcRenderer.on('pet:set-emotion', (event, emotion, duration = 3000, priority = null) => {
      this.setEmotion(emotion, duration, priority);
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

    ipcRenderer.on('pet:update-glasses', (event, enabled) => {
      this.pet.updateConfig({ glassesEnabled: !!enabled });
      this.render();
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.petController = new FaceBotController();
});
