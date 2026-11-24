/**
 * Pixie Pet Controller
 *
 * Keeps the existing app shell (transparent window, IPC, bubble, drag, menu,
 * sleep/idle plumbing) and drives the code-based Pixie character inside it.
 * Internal Coucou hook names are preserved for compatibility.
 */

var electronApi = typeof require !== 'undefined' ? require('electron') : {};
var ipcRenderer = electronApi.ipcRenderer || null;
var clipboard = electronApi.clipboard || null;

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
  curious: 4,    // curiosity on click / cursor approach
  dizzy: 4,      // dizzy on fast drag / rapid clicks
  laugh: 4,      // laugh on double click / pomodoro finish
  wink: 4,       // wink on double click / todo / note
  blush: 4,      // blush on 4s hover
  scared: 4,     // scared on fast cursor approach
  proud: 4,      // all to-dos completed
  excited: 4,    // test connection / 3rd pomodoro / import
  focus: 4,      // generic focus state
  focused: 4,
  focusing: 4,   // pomodoro focus session
  relaxed: 4,    // pomodoro break session
  calculating: 4,
  generating: 4,
  converting: 4,
  organizing: 4,
  writing: 4,
  styling: 4,
  clipping: 4,
  configuring: 4,
  creating: 4,
  guarding: 4,
  reviewing: 4,

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

/* Shared Coucou geometry (exported by character/pet.js). Fallbacks keep this
   file usable standalone. All face math derives from these constants. */
const GEO = (typeof window !== 'undefined' && window.COUCOU_GEOMETRY) || {};
const BODY = GEO.BODY || Object.freeze({ x:110, y:68, w:132, h:90, r:40 });
const FACE = GEO.FACE || Object.freeze({ x:BODY.x + BODY.w / 2, y:BODY.y + BODY.h / 2 });
const SHADOW = GEO.SHADOW || Object.freeze({ y:173, rx:54, ry:6 });
const FACE_BOX = GEO.FACE_BOX || Object.freeze({
  minX: FACE.x - 33, maxX: FACE.x + 33,
  minY: FACE.y - 15, maxY: FACE.y + 33
});
const LOOK = GEO.LOOK || Object.freeze({ x:11, y:3, pad:6 });
const SHY_BLUSH = GEO.SHY_BLUSH !== undefined ? GEO.SHY_BLUSH : 0.33;
const BODY_X1 = BODY.x + BODY.w, BODY_Y1 = BODY.y + BODY.h;

/**
 * CoucouAnimator — behavior/animation layer for the guide-based Coucou SVG.
 * One face rig owns eyes + arcs + shy blush + mouth; blink lives on a separate
 * child element so mood scale and blink never stack.
 */
class CoucouAnimator {
  constructor(controller) {
    this.c = controller;
    this.container = controller.container;
    this.NS = 'http://www.w3.org/2000/svg';
    this.wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    this.clamp = (n, a, b) => Math.max(a, Math.min(b, a <= b ? n : (a + b) / 2));
    this.finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

    this.MOUTHS = {
      smile: { d: 'M168 132 Q176 140 184 132' },
      sad: { d: 'M169 138 Q176 131 183 138' },
      flat: { d: 'M169 135 L183 135' },
      o: { d: 'M172 134 a4 4.5 0 1 0 8 0 a4 4.5 0 1 0 -8 0Z', f: 1 },
      tiny_o: { d: 'M174 134 a2 2.5 0 1 0 4 0 a2 2.5 0 1 0 -4 0Z', f: 1 },
      tiny_smile: { d: 'M172 134 Q176 137 180 134' },
      wavy: { d: 'M165.4 135 q2.7 -4 5.3 0 t5.3 0 t5.3 0 t5.3 0' },
      big: { d: 'M166 131 Q176 144 186 131' },
      open_smile: { d: 'M167 131 Q176 145 185 131Z', f: 1 },
      open: { d: 'M171 131 Q176 142 181 131Z', f: 1 },
      yawn: { d: 'M171 130 a5 7 0 1 0 10 0 a5 7 0 1 0 -10 0Z', f: 1 },
      smirk: { d: 'M168 135 Q176 139 184 132' },
      focused: { d: 'M170 136 Q176 138 182 136' }
    };
    this.MOUTH_OF = {
      happy: 'smile', scared: 'wavy', sad: 'sad', angry: 'flat', bright: 'flat', curious: 'tiny_o',
      sleepy: 'yawn', shy: 'tiny_smile', grateful: 'big', playful: 'open_smile',
      dizzy: 'wavy', ticklish: 'open_smile', hungry: 'open', proud: 'smile', startled: 'o',
      neutral: 'tiny_smile', focusing: 'focused', focused: 'focused', calculating: 'tiny_o',
      generating: 'tiny_o',
      converting: 'smirk', organizing: 'smile', writing: 'smirk', styling: 'smirk',
      clipping: 'tiny_o', configuring: 'tiny_o', creating: 'open_smile', guarding: 'flat',
      reviewing: 'focused', relaxed: 'smile'
    };

    this.DEF = Object.freeze({ es: 1, ey: 1, tilt: 0, sag: 0, shake: 0, otilt: 0, bounce: 0, orb: 0, blush: 0 });
    this.LIMITS = Object.freeze({
      es: [0.75, 1.15], ey: [0.28, 1], tilt: [-12, 12], sag: [-6, 8],
      shake: [-4, 4], otilt: [-14, 14], bounce: [0, 8], orb: [0, 6], blush: [0, SHY_BLUSH]
    });
    this.cur = Object.assign({}, this.DEF);
    this.tgt = Object.assign({}, this.DEF);
    this.restingEye = this.DEF.ey; // updated by timeCheck; DEF is never mutated

    this.MOODS = {
      scared: { m: { shake: 2.4, es: 0.85 }, pose: 'cheeks', front: 1 },
      sad: { m: { sag: 6, ey: 0.75, tilt: -4 }, pose: 'tiny' },
      angry: { m: { ey: 0.5, shake: 1.2 }, pose: 'hips' },
      curious: { m: { tilt: 7, es: 1.15 } },
      sleepy: { m: { ey: 0.3, sag: 4, tilt: 3 } },
      shy: { m: { tilt: -5, ey: 0.85 }, pose: 'shy' },
      grateful: { m: {}, arc: 1, pose: 'chest', front: 1 },
      playful: { m: { bounce: 6 }, pose: 'happy' },
      dizzy: { m: { otilt: 10, orb: 4, ey: 0.8 } },
      ticklish: { m: { shake: 2.5 }, arc: 1, pose: 'happy' },
      hungry: { m: { sag: 2, ey: 0.8, shake: 0.6 }, pose: 'belly', front: 1 },
      proud: { m: { es: 1.06, sag: -3 }, pose: 'happy' },
      startled: { m: { es: 1.3 }, pose: 'surprised' },
      bright: { m: { ey: 0.3, es: 1.05 } },
      focusing: { m: { ey: 0.62, tilt: 2, sag: 1 }, pose: 'chest', front: 1 },
      calculating: { m: { ey: 0.72, tilt: -7, es: 1.06 }, pose: 'cheeks', front: 1 },
      generating: { m: { ey: 0.68, otilt: 7, bounce: 2 }, pose: 'typing', front: 1 },
      converting: { m: { tilt: 9, otilt: -5, es: 1.08 }, pose: 'hips' },
      organizing: { m: { sag: -2, es: 1.04 }, pose: 'chest', front: 1 },
      writing: { m: { tilt: -3, ey: 0.82, otilt: 4 }, pose: 'typing', front: 1 },
      styling: { m: { otilt: -8, es: 1.1, sag: -1 }, pose: 'happy' },
      clipping: { m: { es: 1.22, tilt: 5 }, pose: 'surprised' },
      configuring: { m: { tilt: -6, ey: 0.9, otilt: 6 }, pose: 'cheeks', front: 1 },
      creating: { m: { bounce: 5, es: 1.08 }, pose: 'happy' },
      guarding: { m: { ey: 0.55, shake: 0.8, sag: 2 }, pose: 'tiny' },
      reviewing: { m: { ey: 0.75, tilt: 4, sag: 2 }, pose: 'chest', front: 1 },
      relaxed: { m: { ey: 0.72, tilt: -2, sag: 2, es: 0.94 }, pose: 'rest', front: 1 }
    };
    /* Shy is the only emotion with blush: light, soft, cheek-only, no heart. */
    this.BLUSH = Object.freeze({ shy: SHY_BLUSH });

    this.POSES = {
      typing: { L: { x: 150, y: 148, a: 0, h: 3, r: 8 }, R: { x: 202, y: 148, a: 0, h: 3, r: 8 } },
      hidden: { L: { x: 132, y: 118, a: -30, h: 0, r: 0 }, R: { x: 220, y: 118, a: -50, h: 0, r: 0 } },
      ball: { L: { x: 94, y: 142, a: 0, h: 0, r: 11 }, R: { x: 260, y: 110, a: 0, h: 0, r: 11 } },
      ballUp: { L: { x: 92, y: 82, a: 0, h: 0, r: 11 }, R: { x: 260, y: 82, a: 0, h: 0, r: 11 } },
      rest: { L: { x: 94, y: 140, a: -30, h: 5, r: 10 }, R: { x: 264, y: 114, a: -50, h: 7, r: 10 } },
      happy: { L: { x: 92, y: 78, a: -110, h: 10, r: 10 }, R: { x: 260, y: 78, a: -70, h: 10, r: 10 } },
      surprised: { L: { x: 94, y: 90, a: -100, h: 8, r: 12 }, R: { x: 258, y: 90, a: -80, h: 8, r: 12 } },
      shy: { L: { x: 100, y: 142, a: -20, h: 2, r: 7 }, R: { x: 252, y: 142, a: 20, h: 2, r: 7 } },
      tiny: { L: { x: 104, y: 138, a: -20, h: 1, r: 5.5 }, R: { x: 248, y: 138, a: 20, h: 1, r: 5.5 } },
      stretch: { L: { x: 70, y: 118, a: 180, h: 20, r: 8 }, R: { x: 282, y: 118, a: 0, h: 20, r: 8 } },
      wave: { L: { x: 94, y: 140, a: -30, h: 5, r: 10 }, R: { x: 268, y: 84, a: -50, h: 10, r: 9 } },
      clapA: { L: { x: 146, y: 40, a: -90, h: 8, r: 9 }, R: { x: 206, y: 40, a: -90, h: 8, r: 9 } },
      clapB: { L: { x: 166, y: 40, a: -90, h: 8, r: 9 }, R: { x: 186, y: 40, a: -90, h: 8, r: 9 } },
      hips: { L: { x: 106, y: 128, a: 60, h: 6, r: 8 }, R: { x: 246, y: 128, a: 120, h: 6, r: 8 } },
      cheeks: { L: { x: 154, y: 127, a: 0, h: 2, r: 8 }, R: { x: 198, y: 127, a: 0, h: 2, r: 8 } },
      chest: { L: { x: 160, y: 130, a: 0, h: 4, r: 8 }, R: { x: 192, y: 130, a: 0, h: 4, r: 8 } },
      belly: { L: { x: 160, y: 142, a: 0, h: 4, r: 8 }, R: { x: 192, y: 142, a: 0, h: 4, r: 8 } },
      nose: { L: { x: 132, y: 118, a: -30, h: 0, r: 0 }, R: { x: 178, y: 126, a: 0, h: 2, r: 7 } }
    };

    this.limbs = [
      this.makeLimb({ x: 132, y: 118, a: -30, h: 0, r: 0 }, 0),
      this.makeLimb({ x: 220, y: 118, a: -50, h: 0, r: 0 }, 1.7)
    ];

    this.running = false;
    this.rafId = null;
    this.inside = false;
    this.busy = false;
    this.typing = false;
    this.moodActive = false;
    this.activeMood = null;
    this.nod = 0;
    this.side = 0;
    this.streak = 0;
    this.idleStage = 0;
    this.idleK = 1;
    this.lastAct = Date.now();
    this.lastMood = 0;
    this.lastHello = 0;
    this.lastMove = 0;
    this.clicks = [];
    this.hideT = null;
    this.moodT = null;
    this.typeT = null;
    this.idleTimer = null;
    this.idleActivityTimer = null;
    this.idleSignalActive = false;
    this.idleActivityRunning = false;
    this.idleToken = 0;
    this.animToken = 0;
    this.lastIdleActivityAt = 0;

    this.blinkStart = 0;
    this.blinkUntil = 0;
    this.nextBlink = performance.now() + 2000 + Math.random() * 2500;
    this.forcedBlink = false;

    this.look = { tx: 0, ty: 0, cx: 0, cy: 0 };
    this.lastCursorTime = 0;
    this.lastNormDist = undefined;
    this.lastNx = undefined;
    this.lastNy = undefined;
    this.lastApproachReactionAt = 0;
    this.sp = 0;
    this.slowCount = 0;
    this.lastLunch = '';
    this.cursorDtMs = 16;
    this.zig = [];
    this.sgnX = 0;
    this.sgnY = 0;
    this.ang = 0;
    this.angT = 0;
    this.lastA = 0;
    this.wheels = [];
    this.wx = window.screenX || 0;
    this.wy = window.screenY || 0;
  }

  makeLimb(start, phase) {
    return { el: null, phase, s: Object.assign({}, start), v: { x: 0, y: 0, a: 0, h: 0, r: 0 }, t: Object.assign({}, start) };
  }

  q(selector) { return this.container ? this.container.querySelector(selector) : null; }
  qa(selector) { return this.container ? Array.from(this.container.querySelectorAll(selector)) : []; }

  attach() {
    this.svg = this.q('.coucou-svg');
    if (!this.svg) return;
    this.shadow = this.q('.coucou-shadow');
    this.all = this.q('.coucou-all');
    this.limbsG = this.q('.coucou-limbs');
    this.limbs[0].el = this.q('.coucou-limb-left');
    this.limbs[1].el = this.q('.coucou-limb-right');
    this.kb = this.q('.coucou-kb');
    this.keysL = this.qa('.coucou-key[data-side="L"]');
    this.keysR = this.qa('.coucou-key[data-side="R"]');
    this.lean = this.q('.coucou-lean');
    this.blob = this.q('.coucou-blob');
    this.bodyG = this.q('.coucou-body-gradient');
    this.occ = this.q('.coucou-occ');
    this.spec = this.q('.coucou-spec');

    this.faceRig = this.q('.coucou-face-rig');
    this.eyes = this.q('.coucou-eyes');
    this.blush = this.q('.coucou-blush');
    this.arcs = this.qa('.coucou-arcs');
    this.blinkGroups = this.qa('.coucou-eye-blink');
    this.mouthG = this.q('.coucou-mouth-group');
    this.mouth = this.q('.coucou-mouth');
    this.restoreVisuals();
  }

  restoreVisuals() {
    const emo = this.activeMood || this.c.currentEmotion;
    this.setMouth(this.MOUTH_OF[emo] || 'tiny_smile');
    const d = this.activeMood ? this.MOODS[this.activeMood] : null;
    const rig = this.faceRig || this.eyes;
    if (rig) rig.classList.toggle('arc', !!(d && d.arc));
    if (this.kb) this.kb.classList.toggle('on', this.typing);
    if (this.blush) this.blush.style.opacity = String(this.cur.blush);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.attach();
    // Public plug point for any key source: OS helper, other Pixie windows,
    // or direct calls from integrations.
    if (typeof window !== 'undefined') window.onTypingSignal = () => this.onTypingSignal();
    this.bindGlobalEvents();
    this.idleTimer = setInterval(() => this.checkIdle(), 1000);
    this.timeCheck();
    setInterval(() => this.timeCheck(), 60000);
    setInterval(() => this.checkWindowMove(), 250);
    this.rafId = requestAnimationFrame(t => this.frame(t));
  }

  bindGlobalEvents() {
    const IGNORE = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'];
    // Local pet-window keys are a redundant input source; the main process
    // forwards typing from every Pixie window and from the macOS key helper.
    window.addEventListener('keydown', e => {
      if (document.hidden || IGNORE.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      this.onTypingSignal();
    });
    window.addEventListener('wheel', () => {
      this.activity();
      const now = performance.now();
      this.wheels = this.wheels.filter(t => now - t < 1000);
      this.wheels.push(now);
      if (this.wheels.length >= 8) { this.wheels = []; this.tryMood('dizzy', 2500); }
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { this.activity(); this.tryMood('playful', 2500); }
    });
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', e => this.tryMood(e.matches ? 'scared' : 'bright', e.matches ? 2500 : 2000));
    }
    window.addEventListener('offline', () => this.tryMood('sad', 3500));
    window.addEventListener('online', () => this.tryMood('playful', 2500));
    try {
      if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
          setTimeout(() => {
            if (battery.level < 0.2 && !battery.charging) this.tryMood('sleepy', 3500);
          }, 3000);
          battery.addEventListener('chargingchange', () => {
            if (battery.charging) this.tryMood('playful', 2500);
          });
        }).catch(() => {});
      }
    } catch (_) {}
  }

  frame(t) {
    if (!this.running) return;
    if (!document.hidden) {
      this.stepLimb(this.limbs[0], t);
      this.stepLimb(this.limbs[1], t);
      this.lookStep(t);
    }
    this.rafId = requestAnimationFrame(nt => this.frame(nt));
  }

  capsule(x, y, aDeg, h, r) {
    const a = aDeg * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const x0 = x - h * ca, y0 = y - h * sa;
    const x1 = x + h * ca, y1 = y + h * sa;
    if (h < 0.5) {
      return `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    const nx = -sa * r, ny = ca * r;
    return `M${x0 + nx} ${y0 + ny} L${x1 + nx} ${y1 + ny} ` +
      `A${r} ${r} 0 0 0 ${x1 - nx} ${y1 - ny} ` +
      `L${x0 - nx} ${y0 - ny} A${r} ${r} 0 0 0 ${x0 + nx} ${y0 + ny}Z`;
  }

  stepLimb(limb, time) {
    if (!limb.el) return;
    for (const k of ['x', 'y', 'a', 'h', 'r']) {
      limb.v[k] = this.finite(limb.v[k] + (limb.t[k] - limb.s[k]) * 0.09, 0) * 0.74;
      limb.s[k] = this.finite(limb.s[k] + limb.v[k], limb.t[k]);
    }
    const rr = Math.max(0, limb.s.r);
    const bob = Math.sin(time / 520 + limb.phase) * 1.5 * Math.min(1, rr / 8);
    if (rr < 0.8) { limb.el.setAttribute('d', ''); return; }
    limb.el.setAttribute('d', this.capsule(limb.s.x, limb.s.y + bob, limb.s.a, Math.max(0, limb.s.h), rr));
  }

  roundedLeft(y) {
    const yy = this.clamp(y, BODY.y, BODY_Y1);
    if (yy <= BODY.y + BODY.r || yy >= BODY_Y1 - BODY.r) {
      const dy = yy <= BODY.y + BODY.r
        ? yy - (BODY.y + BODY.r)
        : yy - (BODY_Y1 - BODY.r);
      return BODY.x + BODY.r - Math.sqrt(Math.max(0, BODY.r * BODY.r - dy * dy));
    }
    return BODY.x;
  }

  roundedRight(y) {
    const yy = this.clamp(y, BODY.y, BODY_Y1);
    if (yy <= BODY.y + BODY.r || yy >= BODY_Y1 - BODY.r) {
      const dy = yy <= BODY.y + BODY.r
        ? yy - (BODY.y + BODY.r)
        : yy - (BODY_Y1 - BODY.r);
      return BODY_X1 - BODY.r + Math.sqrt(Math.max(0, BODY.r * BODY.r - dy * dy));
    }
    return BODY_X1;
  }

  roundedTop(x) {
    const xx = this.clamp(x, BODY.x, BODY_X1);
    if (xx <= BODY.x + BODY.r || xx >= BODY_X1 - BODY.r) {
      const dx = xx <= BODY.x + BODY.r
        ? xx - (BODY.x + BODY.r)
        : xx - (BODY_X1 - BODY.r);
      return BODY.y + BODY.r - Math.sqrt(Math.max(0, BODY.r * BODY.r - dx * dx));
    }
    return BODY.y;
  }

  roundedBottom(x) {
    const xx = this.clamp(x, BODY.x, BODY_X1);
    if (xx <= BODY.x + BODY.r || xx >= BODY_X1 - BODY.r) {
      const dx = xx <= BODY.x + BODY.r
        ? xx - (BODY.x + BODY.r)
        : xx - (BODY_X1 - BODY.r);
      return BODY_Y1 - BODY.r + Math.sqrt(Math.max(0, BODY.r * BODY.r - dx * dx));
    }
    return BODY_Y1;
  }

  /* Keep the whole face rectangle inside the rounded body outline. */
  clampFaceOffset(ox, oy, sx, sy) {
    const minX = FACE.x + (FACE_BOX.minX - FACE.x) * sx;
    const maxX = FACE.x + (FACE_BOX.maxX - FACE.x) * sx;
    const minY = FACE.y + (FACE_BOX.minY - FACE.y) * sy;
    const maxY = FACE.y + (FACE_BOX.maxY - FACE.y) * sy;
    const pad = LOOK.pad;
    for (let i = 0; i < 2; i++) {
      const topY = minY + oy, bottomY = maxY + oy;
      const leftLimit = Math.max(this.roundedLeft(topY), this.roundedLeft(bottomY)) + pad;
      const rightLimit = Math.min(this.roundedRight(topY), this.roundedRight(bottomY)) - pad;
      ox = this.clamp(ox, leftLimit - minX, rightLimit - maxX);
      const leftX = minX + ox, rightX = maxX + ox;
      const topLimit = Math.max(this.roundedTop(leftX), this.roundedTop(rightX)) + pad;
      const bottomLimit = Math.min(this.roundedBottom(leftX), this.roundedBottom(rightX)) - pad;
      oy = this.clamp(oy, topLimit - minY, bottomLimit - maxY);
    }
    return { ox, oy };
  }

  updateBlink(now) {
    if (this.forcedBlink) {
      for (const el of this.blinkGroups) el.setAttribute('transform', 'scale(1 0.1)');
      return;
    }
    if (now >= this.nextBlink) {
      this.blinkStart = now;
      this.blinkUntil = now + 130;
      this.nextBlink = now + 2400 + Math.random() * 2600;
    }
    let blink = 1;
    if (now < this.blinkUntil) {
      const p = this.clamp((now - this.blinkStart) / (this.blinkUntil - this.blinkStart), 0, 1);
      blink = 1 - 0.9 * Math.sin(Math.PI * p);
    }
    blink = this.clamp(blink, 0.1, 1);
    for (const el of this.blinkGroups) el.setAttribute('transform', `scale(1 ${blink.toFixed(3)})`);
  }

  lookStep(time) {
    const gx = this.typing ? 0 : this.finite(this.look.tx, 0);
    const gy = this.typing ? 0.7 : this.finite(this.look.ty, 0);
    this.nod *= 0.8;

    for (const k in this.DEF) {
      const lim = this.LIMITS[k] || [-Infinity, Infinity];
      this.cur[k] = this.clamp(
        this.finite(this.cur[k] + (this.finite(this.tgt[k], this.DEF[k]) - this.cur[k]) * 0.15, this.DEF[k]),
        lim[0], lim[1]
      );
    }

    this.updateBlink(time);

    const shX = Math.sin(time / 35) * this.cur.shake;
    const bnc = -Math.abs(Math.sin(time / 130)) * this.cur.bounce;
    const rot = this.cur.tilt + Math.sin(time / 180) * this.cur.otilt;
    const orbX = Math.cos(time / 120) * this.cur.orb;
    const orbY = Math.sin(time / 120) * this.cur.orb;

    this.look.cx = this.clamp(this.finite(this.look.cx + (gx - this.look.cx) * 0.08, 0), -1, 1);
    this.look.cy = this.clamp(this.finite(this.look.cy + (gy - this.look.cy) * 0.08, 0), -1, 1);
    const cx = this.look.cx, cy = this.look.cy;

    const sx = this.clamp((1 - Math.abs(cx) * 0.10) * this.cur.es, 0.65, 1.15);
    const sy = this.clamp((1 - Math.abs(cy) * 0.05) * this.cur.es * this.cur.ey, 0.5, 1.15);
    const fitted = this.clampFaceOffset(cx * LOOK.x + orbX, cy * LOOK.y + orbY, sx, sy);

    const rig = this.faceRig || this.eyes;
    if (rig) {
      rig.setAttribute('transform',
        `translate(${fitted.ox.toFixed(2)} ${fitted.oy.toFixed(2)}) ` +
        `translate(${FACE.x} ${FACE.y}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) ` +
        `translate(${-FACE.x} ${-FACE.y})`);
    }
    if (this.blush) this.blush.style.opacity = this.cur.blush.toFixed(3);

    if (this.lean) {
      this.lean.setAttribute('transform',
        `translate(${cx * 4 + shX} ${cy * 2 + this.nod + this.cur.sag + bnc}) ` +
        `translate(${FACE.x} ${FACE.y}) rotate(${cx * 2 + rot}) ` +
        `scale(${(1 - Math.abs(cx) * 0.03).toFixed(4)} 1) translate(${-FACE.x} ${-FACE.y})`);
    }
    if (this.spec) this.spec.setAttribute('transform', `translate(${-cx * 8} ${-cy * 4})`);
    if (this.occ) this.occ.setAttribute('transform', `translate(${cx * 5} ${cy * 3})`);
    if (this.bodyG) {
      this.bodyG.setAttribute('cx', `${36 - cx * 10}%`);
      this.bodyG.setAttribute('cy', `${24 - cy * 8}%`);
    }
    if (this.limbsG) this.limbsG.setAttribute('transform', `translate(${-cx * 5} ${-cy * 3})`);
    if (this.shadow) this.shadow.setAttribute('cx', FACE.x + this.clamp(cx * 8, -15, 15));
  }

  setMouth(name) {
    if (!this.mouth) return;
    const m = this.MOUTHS[name];
    if (!m) {
      this.mouth.style.opacity = 0;
      this.mouth.setAttribute('d', ''); // keep the rig bbox stable when hidden
      return;
    }
    this.mouth.setAttribute('d', m.d);
    this.mouth.setAttribute('fill', m.f ? '#111111' : 'none');
    this.mouth.setAttribute('stroke', '#111111');
    this.mouth.style.opacity = 1;
  }

  bounce() {
    if (!this.blob) return;
    this.blob.classList.remove('squash');
    void this.blob.getBoundingClientRect();
    this.blob.classList.add('squash');
  }

  pose(name) {
    if (this.typing && name !== 'typing') return;
    const p = this.POSES[name];
    if (!p) return;
    Object.assign(this.limbs[0].t, p.L);
    Object.assign(this.limbs[1].t, p.R);
  }

  front(on) {
    if (!this.all || !this.limbsG) return;
    if (on) {
      if (this.kb) this.all.insertBefore(this.limbsG, this.kb);
      else this.all.appendChild(this.limbsG);
    } else if (this.all.firstChild !== this.limbsG) {
      this.all.insertBefore(this.limbsG, this.all.firstChild);
    }
  }

  show(name, ms = 1500) {
    if (this.typing) return;
    clearTimeout(this.hideT);
    this.endMood(false);
    this.bounce();
    this.pose(name);
    this.setMouth(({ happy: 'smile', surprised: 'o', ball: 'smile', ballUp: 'smile' })[name]);
    this.hideT = setTimeout(() => { this.pose('hidden'); this.setMouth(); }, ms);
  }

  animationCurrent(token) {
    if (token === this.animToken) return true;
    this.busy = false;
    return false;
  }

  async hello() {
    if (this.busy || this.typing) return;
    this.busy = true;
    const token = ++this.animToken;
    clearTimeout(this.hideT);
    this.endMood(false);
    this.bounce();
    this.setMouth('smile');
    this.pose('wave');
    await this.wait(700);
    if (!this.animationCurrent(token)) return;
    for (let i = 0; i < 4; i++) {
      this.limbs[1].t.a = i % 2 ? -100 : -20;
      await this.wait(280);
      if (!this.animationCurrent(token)) return;
    }
    this.limbs[1].t.a = -50;
    await this.wait(300);
    if (!this.animationCurrent(token)) return;
    this.setMouth();
    this.pose('hidden');
    await this.wait(600);
    if (!this.animationCurrent(token)) return;
    this.busy = false;
  }

  async clap() {
    if (this.busy || this.typing) return;
    this.busy = true;
    const token = ++this.animToken;
    clearTimeout(this.hideT);
    this.endMood(false);
    this.setMouth('big');
    this.pose('clapA');
    await this.wait(700);
    if (!this.animationCurrent(token)) return;
    for (let i = 0; i < 6; i++) {
      this.pose(i % 2 ? 'clapA' : 'clapB');
      await this.wait(240);
      if (!this.animationCurrent(token)) return;
    }
    await this.wait(300);
    if (!this.animationCurrent(token)) return;
    this.setMouth();
    this.pose('hidden');
    await this.wait(600);
    if (!this.animationCurrent(token)) return;
    this.busy = false;
  }

  async sneeze() {
    if (this.busy || this.typing) return;
    this.busy = true;
    const token = ++this.animToken;
    clearTimeout(this.hideT);
    this.endMood(false);
    Object.assign(this.tgt, { tilt: -8, es: 1.1 });
    if (this.eyes) this.eyes.classList.add('arc');
    this.setMouth('o');
    await this.wait(700);
    if (!this.animationCurrent(token)) return;
    Object.assign(this.tgt, { tilt: 9, sag: 6, es: 0.9 });
    this.bounce();
    this.front(true);
    this.pose('nose');
    this.setMouth('open');
    await this.wait(600);
    if (!this.animationCurrent(token)) return;
    this.endMood();
    this.busy = false;
    this.settle();
  }

  settle() {
    this.pose('hidden');
    setTimeout(() => {
      if (!this.moodActive && !this.typing && !this.busy) this.front(false);
    }, 500);
    this.lastMood = Date.now();
  }

  endMood(clearFront = true) {
    clearTimeout(this.moodT);
    this.moodT = null;
    this.moodActive = false;
    this.activeMood = null;
    Object.assign(this.tgt, this.DEF);
    this.tgt.ey = this.restingEye;
    const rig = this.faceRig || this.eyes;
    if (rig) rig.classList.remove('arc');
    this.setMouth();
    if (clearFront) this.front(false);
  }

  mood(name, ms = 0, force = false) {
    if ((this.busy && !force) || (this.typing && !force) || !this.MOODS[name]) return false;
    if (force) {
      // A panel action wins immediately over an idle animation or typing pose.
      this.animToken++;
      this.busy = false;
      this.stopTyping();
    }
    this.endMood(false);
    this.moodActive = true;
    this.activeMood = name;
    const d = this.MOODS[name];
    Object.assign(this.tgt, d.m);
    if (!Object.prototype.hasOwnProperty.call(d.m, 'ey')) this.tgt.ey = this.restingEye;
    this.tgt.blush = this.BLUSH[name] || 0;
    const rig = this.faceRig || this.eyes;
    if (rig) rig.classList.toggle('arc', !!d.arc);
    this.setMouth(this.MOUTH_OF[name]);
    clearTimeout(this.hideT);
    this.bounce();
    if (d.front) this.front(true);
    this.pose(d.pose || 'hidden');
    if (ms) this.moodT = setTimeout(() => { this.endMood(); this.settle(); }, ms);
    this.lastMood = Date.now();
    return true;
  }

  tryMood(name, ms = 0) {
    if (this.busy || this.typing || this.moodActive || this.idleStage || Date.now() - this.lastMood < 1500) return false;
    return this.mood(name, ms);
  }

  activity() {
    this.lastAct = Date.now();
    this.animToken++;
    this.idleToken++;
    this.idleSignalActive = false;
    this.idleActivityRunning = false;
    if (this.idleActivityTimer) {
      clearTimeout(this.idleActivityTimer);
      this.idleActivityTimer = null;
    }
    const wasIdlePlay = this.idleStage > 0;
    this.idleStage = 0;
    if (wasIdlePlay) {
      this.endMood();
      this.settle();
    }
  }

  /* Main process sends a true system-idle signal. The renderer fallback below
     keeps the same behavior when Pixie is opened without the Electron shell. */
  onIdleSignal() {
    if (document.hidden || this.c.isSleeping || this.typing) return;
    this.idleSignalActive = true;
    this.scheduleIdleActivity(0);
  }

  stopIdleActivities() {
    this.idleSignalActive = false;
    this.idleActivityRunning = false;
    this.idleToken++;
    if (this.idleActivityTimer) {
      clearTimeout(this.idleActivityTimer);
      this.idleActivityTimer = null;
    }
  }

  scheduleIdleActivity(delayMs) {
    if (this.idleActivityTimer) clearTimeout(this.idleActivityTimer);
    this.idleActivityTimer = setTimeout(() => {
      this.idleActivityTimer = null;
      this.runIdleActivity();
    }, delayMs);
  }

  isLocalIdle() {
    return (Date.now() - this.lastAct) / 1000 > 180 * this.idleK;
  }

  async runIdleActivity() {
    if (document.hidden || this.c.isSleeping || this.typing || this.c.isDragging) {
      this.scheduleIdleActivity(5000);
      return;
    }
    if (!this.idleSignalActive && !this.isLocalIdle()) return;

    const token = ++this.idleToken;
    this.idleActivityRunning = true;
    const pick = Math.random();
    try {
      if (pick < 0.16)      await this.idleRoam();
      else if (pick < 0.30) await this.idleHop(true);
      else if (pick < 0.42) await this.hello();
      else if (pick < 0.52) await this.clap();
      else if (pick < 0.64) await this.vibe();
      else if (pick < 0.74) await this.facePlay();
      else if (pick < 0.84) await this.ballPlay();
      else if (pick < 0.92) await this.idleLookAround();
      else                  await this.idleStretch();
    } finally {
      this.busy = false;
      this.lastIdleActivityAt = Date.now();
      if (token !== this.idleToken) return;
      this.idleActivityRunning = false;
      if (this.idleSignalActive || this.isLocalIdle()) {
        // One short timer only. No RAF or extra watchers are added at idle.
        this.scheduleIdleActivity(5000 + Math.round(Math.random() * 6000));
      }
    }
  }

  /* Bigger hop/jump to a new place. Main process clamps to the work area. */
  async idleHop(big = false) {
    const token = this.animToken;
    this.busy = true;
    const scale = big ? 1 : 0.45;
    if (ipcRenderer) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      const dx = Math.round(direction * (60 + Math.random() * 120) * scale);
      const dy = Math.round((Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 80) * scale);
      ipcRenderer.send('pet:idle-hop', { dx, dy });
    }
    this.show('happy', 900);
    this.pose('ballUp');
    await this.wait(220);
    if (!this.animationCurrent(token)) return;
    this.bounce();
    this.pose('hidden');
    await this.wait(260);
    if (!this.animationCurrent(token)) return;
    this.setMouth();
  }

  /* Roam: several jumps around the screen to cure boredom. */
  async idleRoam() {
    const token = this.animToken;
    this.busy = true;
    const hops = 2 + Math.floor(Math.random() * 3); // 2-4 jumps
    for (let i = 0; i < hops; i++) {
      if (!this.animationCurrent(token)) return;
      if (ipcRenderer) {
        const dx = Math.round((Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 150));
        const dy = Math.round((Math.random() < 0.5 ? -1 : 1) * (35 + Math.random() * 90));
        ipcRenderer.send('pet:idle-hop', { dx, dy });
      }
      const moods = ['happy', 'playful', 'curious', 'excited'];
      const m = moods[i % moods.length];
      if (m === 'happy') this.show('happy', 900);
      else this.mood(m, 900);
      this.pose(i % 2 === 0 ? 'ballUp' : 'wave');
      await this.wait(260);
      if (!this.animationCurrent(token)) return;
      this.bounce();
      this.pose('hidden');
      await this.wait(380);
    }
    this.setMouth();
  }

  async idleLookAround() {
    const token = this.animToken;
    this.busy = true;
    this.endMood(false);
    this.setMouth('tiny_o');
    this.tgt.tilt = -7;
    this.tgt.otilt = -5;
    await this.wait(450);
    if (!this.animationCurrent(token)) return;
    this.tgt.tilt = 7;
    this.tgt.otilt = 5;
    this.setMouth('tiny_o');
    await this.wait(450);
    if (!this.animationCurrent(token)) return;
    this.tgt.tilt = 0;
    this.tgt.otilt = 0;
    this.setMouth('smile');
    this.bounce();
    await this.wait(300);
    this.setMouth();
  }

  async idleStretch() {
    const token = this.animToken;
    this.busy = true;
    this.endMood(false);
    this.pose('ballUp');
    this.setMouth('yawn');
    this.tgt.sag = -3;
    await this.wait(700);
    if (!this.animationCurrent(token)) return;
    this.pose('rest');
    this.setMouth('smile');
    this.tgt.sag = 0;
    await this.wait(350);
    this.pose('hidden');
    this.setMouth();
  }

  /* A tiny "vibing" beat: shoulders sway, hands on hips, soft smile. */
  async vibe() {
    const token = this.animToken;
    this.busy = true;
    this.endMood(false);
    this.front(true);
    this.bounce();
    this.setMouth('smile');
    for (let i = 0; i < 6; i++) {
      this.tgt.otilt = i % 2 ? 3.5 : -3.5;
      this.tgt.bounce = 3;
      this.pose(i % 2 ? 'hips' : 'rest');
      await this.wait(190);
      if (!this.animationCurrent(token)) return;
    }
    this.endMood(false);
    this.setMouth('tiny_smile');
    this.pose('hidden');
  }

  /* Play with eyes and mouth only: squint, blink, pout, smile. */
  async facePlay() {
    const token = this.animToken;
    this.busy = true;
    this.endMood(false);
    this.forcedBlink = true;
    this.setMouth('o');
    await this.wait(230);
    if (!this.animationCurrent(token)) return this.resetFacePlay();
    this.forcedBlink = false;
    this.setMouth('wavy');
    this.tgt.tilt = -5;
    await this.wait(260);
    if (!this.animationCurrent(token)) return this.resetFacePlay();
    this.tgt.tilt = 5;
    this.setMouth('tiny_o');
    await this.wait(240);
    if (!this.animationCurrent(token)) return this.resetFacePlay();
    this.setMouth('smile');
    this.tgt.tilt = 0;
    await this.wait(320);
    this.resetFacePlay();
  }

  resetFacePlay() {
    this.forcedBlink = false;
    this.tgt.tilt = 0;
    this.setMouth();
  }

  async ballPlay() {
    const token = this.animToken;
    this.busy = true;
    this.show('ball', 1200);
    await this.wait(500);
    if (!this.animationCurrent(token)) return;
    this.show('ballUp', 900);
    await this.wait(700);
  }

  checkIdle() {
    if (this.busy || this.typing || document.hidden || this.c.isSleeping) return;
    const idle = (Date.now() - this.lastAct) / 1000;
    // Fallback only. Main process is authoritative for play/sleepy/sleeping.
    if (idle > 360 * this.idleK) {
      this.stopIdleActivities();
      if (this.idleStage < 3) {
        this.idleStage = 3;
        this.mood('sleepy', 0);
      }
      return;
    }
    if (idle > 180 * this.idleK && !this.idleSignalActive && !this.idleActivityTimer && !this.idleActivityRunning) {
      this.onIdleSignal();
    }
  }

  scheduleTypeStop(ms) {
    clearTimeout(this.typeT);
    this.typeT = setTimeout(() => this.stopTyping(), ms);
  }

  startTyping(ms = 5000) {
    if (this.typing) { this.scheduleTypeStop(ms); return; }
    this.activity();
    this.endMood(false);
    this.typing = true;
    clearTimeout(this.hideT);
    this.bounce();
    this.front(true);
    if (this.kb) this.kb.classList.add('on');
    this.pose('typing');
    this.streak = 0;
    this.scheduleTypeStop(ms);
  }

  stopTyping() {
    if (!this.typing) return;
    this.typing = false;
    if (this.kb) this.kb.classList.remove('on');
    this.pose('hidden');
    const s = this.streak;
    this.streak = 0;
    if (s >= 10) setTimeout(() => this.mood('proud', 2500), 200);
    setTimeout(() => { if (!this.typing) this.front(false); }, 500);
  }

  /* Single typing plug point. Sources include OS key taps, other Pixie windows
     and this window's own keydown listener. */
  onTypingSignal() {
    this.onKeyDown();
  }

  onKeyDown() {
    if (this.c.isSleeping) return;
    if (!this.typing) this.startTyping(1400);
    else this.scheduleTypeStop(1400);
    const isR = this.side++ % 2;
    const limb = isR ? this.limbs[1] : this.limbs[0];
    const pool = isR ? this.keysR : this.keysL;
    if (!pool || !pool.length) return;
    const key = pool[Math.floor(Math.random() * pool.length)];
    limb.t.x = Number(key.getAttribute('x')) + 4;
    limb.v.y += 5;
    this.nod = 1.6;
    this.streak++;
    key.setAttribute('fill', '#ffffff');
    setTimeout(() => key.setAttribute('fill', '#8a8a9a'), 90);
  }

  onInside() {
    this.inside = true;
    this.lastMove = performance.now();
    this.activity();
    if (this.busy || this.typing || this.moodActive || Date.now() - this.lastHello < 8000) return;
    this.lastHello = Date.now();
    if (Math.random() < 0.3) this.show(Math.random() < 0.5 ? 'ball' : 'ballUp', 1600);
    else this.hello();
  }

  onOutside() { this.inside = false; }

  click(detail = 1) {
    this.activity();
    const now = Date.now();
    this.clicks.push(now);
    while (this.clicks.length && now - this.clicks[0] > 2000) this.clicks.shift();
    if (this.clicks.length >= 5 && !this.busy && !this.typing) {
      this.clicks.length = 0;
      this.mood('angry', 2500);
      return;
    }
    if (this.busy || this.typing || this.moodActive) return;
    if (detail >= 2) this.show('surprised', 1600);
    else if (Math.random() < 0.35) this.show(Math.random() < 0.5 ? 'ball' : 'ballUp', 1500);
    else this.show('happy', 1400);
  }

  onCursor(nx, ny) {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    this.activity();
    const now = performance.now();
    nx = this.clamp(nx, -1, 1);
    ny = this.clamp(ny, -1, 1);
    this.look.tx = nx;
    this.look.ty = ny;

    const dist = Math.hypot(nx, ny);
    this.cursorDtMs = this.lastCursorTime ? Math.max(1, now - this.lastCursorTime) : 16;
    if (this.lastCursorTime) {
      const dt = this.cursorDtMs / 1000;
      const approachRate = (this.lastNormDist !== undefined ? this.lastNormDist : dist) - dist;
      const rate = approachRate / dt;
      if (rate > 4.5 && dist < 0.7 && dist > 0.1 && !this.inside) this.tryMood('scared', 2200);
      if (!this.inside && !this.c.isDragging && dist < 0.35 && dist > 0.08 &&
          now - this.lastApproachReactionAt > 6000) {
        this.lastApproachReactionAt = now;
        this.tryMood('curious', 2500);
      }
    }
    this.lastNormDist = dist;
    this.lastCursorTime = now;

    if (this.lastNx !== undefined) {
      const dx = nx - this.lastNx, dy = ny - this.lastNy;
      const speed = Math.hypot(dx, dy) / (this.cursorDtMs / 1000);
      this.sp = this.sp * 0.8 + speed * 0.2;
      if (speed > 2.2 && dist < 0.9) this.tryMood('scared', 2200);
      if (dist < 0.35 && speed > 0.03 && speed < 0.4) {
        if (++this.slowCount > 25) { this.slowCount = 0; this.tryMood('curious', 2500); }
      } else this.slowCount = 0;

      if (Math.abs(dx) > 0.012 || Math.abs(dy) > 0.012) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (this.sgnX && Math.sign(dx) !== this.sgnX) this.zig.push({ t: now, a: 'x' });
          this.sgnX = Math.sign(dx);
        } else {
          if (this.sgnY && Math.sign(dy) !== this.sgnY) this.zig.push({ t: now, a: 'y' });
          this.sgnY = Math.sign(dy);
        }
      }
      this.zig = this.zig.filter(z => now - z.t < 1500);
      const zx = this.zig.filter(z => z.a === 'x').length;
      const zy = this.zig.filter(z => z.a === 'y').length;
      if (zx >= 6 && dist < 1 && !this.inside) this.tryMood('playful', 2500);
      if (this.inside && zy >= 5 && this.sp > 0.5) this.tryMood('ticklish', 2000);
      else if (this.inside && zy >= 3 && this.sp <= 0.5) this.tryMood('grateful', 2500);

      const a = Math.atan2(ny, nx);
      if (dist > 0.08 && dist < 1 && now - this.angT < 400) {
        let d = a - this.lastA;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        this.ang += d;
      } else this.ang = 0;
      this.lastA = a;
      this.angT = now;
      if (Math.abs(this.ang) > 9.5 && dist < 1) { this.ang = 0; this.tryMood('dizzy', 3000); }
    }
    this.lastNx = nx;
    this.lastNy = ny;
  }

  checkWindowMove() {
    const x = window.screenX || 0, y = window.screenY || 0;
    const d = Math.hypot(x - this.wx, y - this.wy);
    this.wx = x; this.wy = y;
    if (d > 60) this.tryMood('dizzy', 2500);
    else if (d > 25) this.tryMood('startled', 1200);
  }

  timeCheck() {
    const d = new Date();
    const h = d.getHours();
    const night = h >= 23 || h < 5;
    this.idleK = night ? 0.5 : 1;
    this.restingEye = night ? 0.8 : 1;
    if (!this.moodActive) this.tgt.ey = this.restingEye;
    const today = d.toDateString();
    if (h >= 13 && h < 14 && this.lastLunch !== today) {
      this.lastLunch = today;
      this.tryMood('hungry', 4000);
    }
  }

  react(emotion, duration = 0, force = false) {
    const raw = String(emotion || 'neutral').toLowerCase();
    if (this.c.isSleeping && !force && raw !== 'sleeping' && raw !== 'sleep' && raw !== 'neutral') return;
    if (force) {
      // Panel reactions must not wait for a typing pose or an idle animation.
      this.animToken++;
      this.busy = false;
      this.streak = 0;
      this.stopTyping();
    }
    if (raw === 'focus' || raw === 'focused' || raw === 'reading' || raw === 'squint') {
      if (force && this.MOODS[raw]) this.mood(raw, duration > 0 ? duration : 6000);
      else this.startTyping(duration > 0 ? duration : 6000);
      return;
    }
    if (this.typing) return;

    const emo = this.c.pet ? this.c.pet.normalizeEmotion(raw) : raw;
    switch (emo) {
      case 'happy': this.show('happy', duration > 0 ? duration : 1400); break;
      case 'startled': this.show('surprised', duration > 0 ? duration : 1600); break;
      case 'playful': this.mood('playful', duration > 0 ? duration : 2500); break;
      case 'proud': this.mood('proud', duration > 0 ? duration : 2500); break;
      case 'grateful': this.mood('grateful', duration > 0 ? duration : 2500); break;
      case 'shy': this.mood('shy', duration > 0 ? duration : 3000); break;
      case 'scared': this.mood('scared', duration > 0 ? duration : 2200); break;
      case 'sad': this.mood('sad', duration); break;
      case 'angry': this.mood('angry', duration > 0 ? duration : 2500); break;
      case 'curious': this.mood('curious', duration > 0 ? duration : 2500); break;
      case 'dizzy': this.mood('dizzy', duration > 0 ? duration : 3000); break;
      case 'ticklish': this.mood('ticklish', duration > 0 ? duration : 2000); break;
      case 'hungry': this.mood('hungry', duration > 0 ? duration : 3500); break;
      case 'sleepy': this.mood('sleepy', duration); break;
      case 'bright': this.mood('bright', duration > 0 ? duration : 2000); break;
      case 'focusing': this.mood('focusing', duration > 0 ? duration : 6000); break;
      case 'calculating': this.mood('calculating', duration > 0 ? duration : 2600); break;
      case 'generating': this.mood('generating', duration > 0 ? duration : 3000); break;
      case 'converting': this.mood('converting', duration > 0 ? duration : 2600); break;
      case 'organizing': this.mood('organizing', duration > 0 ? duration : 2600); break;
      case 'writing': this.mood('writing', duration > 0 ? duration : 2800); break;
      case 'styling': this.mood('styling', duration > 0 ? duration : 2600); break;
      case 'clipping': this.mood('clipping', duration > 0 ? duration : 2200); break;
      case 'configuring': this.mood('configuring', duration > 0 ? duration : 2600); break;
      case 'creating': this.mood('creating', duration > 0 ? duration : 2600); break;
      case 'guarding': this.mood('guarding', duration > 0 ? duration : 2600); break;
      case 'reviewing': this.mood('reviewing', duration > 0 ? duration : 2600); break;
      case 'relaxed': this.mood('relaxed', duration > 0 ? duration : 4000); break;
      case 'neutral':
      default:
        this.endMood();
        this.pose('hidden');
        this.setMouth();
        break;
    }
  }
}

class CoucouController {
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
    this.lastCursorUpdateAt = 0;
    this.lastApproachReactionAt = 0;
    this.idleBehaviorTimer = null;
    this.idleGlanceTimer = null;
    this.isIdleGlancing = false;

    // Item H2: Driven strictly by insidePet state from Main Process hit testing
    this.isInsidePet = false;
    this.mouseDownInside = false;

    this.container = document.getElementById('pet-viewport');
    this.menuEl = document.getElementById('quick-menu');
    this.bubbleEl = document.getElementById('pet-speech-bubble');
    this.bubbleBadge = document.getElementById('bubble-badge');
    this.bubbleText = document.getElementById('bubble-text');
    this.bubbleTimer = null;
    this.bubbleHideTimeout = null;
    this.updateMessageActionState();

    this.coucou = new CoucouAnimator(this);

    this.init();
  }

  init() {
    this.loadSavedAppearance();
    this.render();
    this.updateBubblePosition();
    this.setupEvents();
    this.setupIPC();
    this.coucou.start();

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
          // Coucou baseline — saved theme colors stay optional, never override the pale body.
          const base = {
            scale: 1.0, depth: 78, bodyColor: '#ffffff', eyeColor: '#111111',
            mouthColor: '#111111'
          };
          this.pet.updateConfig(Object.assign({}, saved, base));
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
      idPrefix: 'coucou-win'
    });
    if (this.coucou) this.coucou.attach();
    // Expose data-emotion on all root containers for test hooks.
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
    this.isSleeping = (newEmotion === 'sleeping' || newEmotion === 'sleep');

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
    }

    this.render();
    this.coucou.react(newEmotion, durationMs, force);

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
        this.coucou.react(this.currentEmotion, 0);
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
      this.isSleeping = (emotion === 'sleeping' || emotion === 'sleep');
      if (this.container) {
        if (this.isSleeping) {
          this.container.classList.add('sleeping');
        } else {
          this.container.classList.remove('sleeping');
        }
      }
      this.render();
      this.coucou.react(emotion, 0);
    }
  }

  updateBubblePosition(flipped = false) {
    if (!this.bubbleEl) return;
    const cfg = this.pet?.config || {};
    const scale = cfg.scale || 1.0;
    const size = Math.round(180 * scale);
    const k = size / 220;
    const fit = 220 / 324;
    const fitY = (220 - 182 * fit) / 2;
    const bodyH = Math.max(60, Math.min(200, cfg.height !== undefined ? cfg.height : 90));
    const bodyHalf = (bodyH * fit) / 2;
    const bodyCenterY = 113 * fit + fitY;
    const petBodyTopInViewport = (bodyCenterY - bodyHalf) * k;
    const petBodyBottomInViewport = (bodyCenterY + bodyHalf) * k;

    // Normal (bubble above pet): tail tip sits just above the pet body
    const petTopFromBottom = 10 + (size - petBodyTopInViewport);
    const bubbleBottom = Math.round(petTopFromBottom + 6);

    // Flipped (bubble below pet): tail tip sits just below the pet body
    const petBodyBottomFromTop = 10 + petBodyBottomInViewport;
    const bubbleTop = Math.round(petBodyBottomFromTop + 6);

    this.bubbleEl.style.setProperty('--bubble-bottom', `${bubbleBottom}px`);
    this.bubbleEl.style.setProperty('--bubble-top', `${bubbleTop}px`);
  }

  // --- Solid Cute Material Speech Bubble ---
  showBubble({ text, badge = '', duration = 5000, sound = '', category = '', emotion = '', bounce = false }) {
    if (!this.bubbleEl || !text) return;

    this.lastBubbleData = { text, badge, duration, sound, category, emotion };
    const isFlipped = this.bubbleEl.classList.contains('flipped-below');
    this.updateBubblePosition(isFlipped);

    if (bounce && this.container) {
      this.container.classList.remove('bounce-drop');
      void this.container.offsetWidth;
      this.container.classList.add('bounce-drop');
      setTimeout(() => {
        if (this.container) this.container.classList.remove('bounce-drop');
      }, 500);
    }

    if (this.bubbleHideTimeout) {
      clearTimeout(this.bubbleHideTimeout);
      this.bubbleHideTimeout = null;
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
    this.resetCopyLabels();
    this.updateMessageActionState();

    // Force layout reflow and measure rendered bounds (Item B2)
    const bubbleRect = this.bubbleEl.getBoundingClientRect();
    const measuredW = Math.ceil(bubbleRect.width);
    const measuredH = Math.ceil(bubbleRect.height);

    const isClamped = this.bubbleText ? (this.bubbleText.scrollHeight > this.bubbleText.clientHeight + 2) : false;
    if (isClamped) {
      this.bubbleEl.setAttribute('title', 'Click to view full message in panel');
      this.bubbleEl.dataset.clamped = 'true';
    } else {
      this.bubbleEl.removeAttribute('title');
      delete this.bubbleEl.dataset.clamped;
    }

    // Tell main process measured dimensions for dynamic window sizing & work area clamping
    if (ipcRenderer) {
      ipcRenderer.send('pet:bubble-shown', {
        width: measuredW,
        height: measuredH,
        isClamped
      });
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
    this.bubbleEl.dataset.hasMessage = 'false';
    this.resetCopyLabels();

    if (this.bubbleHideTimeout) {
      clearTimeout(this.bubbleHideTimeout);
    }
    this.bubbleHideTimeout = setTimeout(() => {
      this.bubbleEl.style.display = 'none';
      if (this.bubbleText) this.bubbleText.textContent = '';
      if (this.bubbleBadge) this.bubbleBadge.textContent = '';
      this.bubbleEl.classList.remove('fade-out');
      this.bubbleEl.classList.remove('flipped-below');
      this.updateMessageActionState();
      const root = document.getElementById('pet-root-container');
      if (root) root.classList.remove('bubble-flipped');

      // Tell main process to reset pet window bounds to compact pet size
      if (ipcRenderer) {
        ipcRenderer.send('pet:bubble-hidden');
      }
      this.bubbleHideTimeout = null;
    }, 200);

    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
  }

  dismissBubble() {
    // Explicit dismiss should advance the bubble queue immediately instead of
    // waiting out the original auto-hide timer.
    if (ipcRenderer) ipcRenderer.send('bubble:dismissed');
    this.hideBubble();
  }

  openBubbleInPanel() {
    const data = this.lastBubbleData || {
      text: this.bubbleText ? this.bubbleText.textContent.trim() : '',
      badge: ''
    };
    if (!data.text || !ipcRenderer) return;

    const cat = data.category || '';
    const targetTab = cat === 'reminders' ? 'reminders' : (cat === 'timer' ? 'timer' : 'chat');
    ipcRenderer.send('panel:open', {
      tab: targetTab,
      fullText: data.text,
      badge: data.badge
    });
    this.hideBubble();
  }

  copyBubbleText(sourceEl) {
    const text = (this.lastBubbleData && this.lastBubbleData.text) ||
      (this.bubbleText ? this.bubbleText.textContent.trim() : '');
    if (!text) return false;

    let copied = false;
    try {
      if (clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(text);
        copied = true;
      }
    } catch (error) {
      console.warn('[Pixie] clipboard.writeText failed:', error);
    }

    if (!copied && typeof navigator !== 'undefined' && navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(() => {});
      copied = true;
    }

    if (copied) this.flashCopied(sourceEl);
    return copied;
  }

  flashCopied(sourceEl) {
    if (!sourceEl) return;
    if (sourceEl.__pixieCopiedTimer) {
      clearTimeout(sourceEl.__pixieCopiedTimer);
      sourceEl.__pixieCopiedTimer = null;
    }

    const label = sourceEl.querySelector('span');
    if (label) {
      if (sourceEl.dataset.originalLabel === undefined) {
        sourceEl.dataset.originalLabel = label.textContent;
      }
      label.textContent = 'Copied!';
    }

    const title = sourceEl.getAttribute('title');
    if (title && sourceEl.dataset.originalTitle === undefined) {
      sourceEl.dataset.originalTitle = title;
    }
    sourceEl.setAttribute('title', 'Copied!');
    sourceEl.classList.add('copied');

    sourceEl.__pixieCopiedTimer = setTimeout(() => {
      sourceEl.classList.remove('copied');
      if (label && sourceEl.dataset.originalLabel !== undefined) {
        label.textContent = sourceEl.dataset.originalLabel;
        delete sourceEl.dataset.originalLabel;
      }
      if (sourceEl.dataset.originalTitle !== undefined) {
        sourceEl.setAttribute('title', sourceEl.dataset.originalTitle);
        delete sourceEl.dataset.originalTitle;
      } else {
        sourceEl.removeAttribute('title');
      }
      sourceEl.__pixieCopiedTimer = null;
    }, 1200);
  }

  resetCopyLabels() {
    const nodes = [];
    if (this.bubbleEl) {
      nodes.push(...this.bubbleEl.querySelectorAll('[data-original-label], [data-original-title], .copied'));
    }
    if (this.menuEl) {
      nodes.push(...this.menuEl.querySelectorAll('[data-original-label], [data-original-title], .copied'));
    }

    nodes.forEach((node) => {
      if (node.__pixieCopiedTimer) {
        clearTimeout(node.__pixieCopiedTimer);
        node.__pixieCopiedTimer = null;
      }
      const label = node.querySelector('span');
      if (label && node.dataset.originalLabel !== undefined) {
        label.textContent = node.dataset.originalLabel;
        delete node.dataset.originalLabel;
      }
      if (node.dataset.originalTitle !== undefined) {
        node.setAttribute('title', node.dataset.originalTitle);
        delete node.dataset.originalTitle;
      }
      node.classList.remove('copied');
    });
  }

  updateMessageActionState() {
    const currentText = this.bubbleText ? this.bubbleText.textContent.trim() : '';
    const isBubbleVisible = this.bubbleEl &&
      this.bubbleEl.style.display === 'block' &&
      !this.bubbleEl.classList.contains('fade-out');
    const hasCurrentMessage = !!(isBubbleVisible && (currentText || (this.lastBubbleData && this.lastBubbleData.text)));
    const hasLastMessage = !!(this.lastBubbleData && this.lastBubbleData.text);

    if (this.bubbleEl) {
      this.bubbleEl.dataset.hasMessage = hasCurrentMessage ? 'true' : 'false';
    }
    if (this.menuEl) {
      this.menuEl.dataset.hasMessage = hasLastMessage ? 'true' : 'false';
    }
  }

  // --- Motion hooks (CoucouAnimator owns the RAF and all character parts) ---
  requestMotionUpdate() {
    // Kept for compatibility; the Coucou animator runs its own look loop.
  }

  stepMotion() {}

  setBlink(isBlinking) {
    if (this.coucou && this.coucou.forcedBlink !== undefined) {
      this.coucou.forcedBlink = !!isBlinking;
    }
  }

  playfulNudge() {
    if (!this.isSleeping && this.coucou) this.coucou.bounce();
  }

  setupEvents() {
    // Bubble actions: explicit buttons win, background keeps the legacy
    // click-to-open affordance for clipped messages.
    if (this.bubbleEl) {
      this.bubbleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        let actionEl = null;
        let node = e.target;
        while (node && node !== this.bubbleEl) {
          if (node.dataset && node.dataset.bubbleAction) {
            actionEl = node;
            break;
          }
          node = node.parentNode;
        }

        if (actionEl) {
          const action = actionEl.dataset.bubbleAction;
          if (action === 'open') this.openBubbleInPanel();
          else if (action === 'copy') this.copyBubbleText(actionEl);
          else if (action === 'dismiss') this.dismissBubble();
          return;
        }

        if (this.lastBubbleData || (this.bubbleText && this.bubbleText.textContent.trim())) {
          this.openBubbleInPanel();
        }
      });
    }

    // Item H2: Driven strictly by insidePet state from Main Process hit testing
    if (ipcRenderer) {
      ipcRenderer.on('pet:inside-change', (event, isInside) => {
        this.isInsidePet = !!isInside;
        if (this.isInsidePet) {
          if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleep' || this.currentEmotion === 'sleepy') {
            this.wakeUp();
          } else {
            this.coucou.onInside();
          }

          if (this.hoverTimer) clearTimeout(this.hoverTimer);
          this.hoverTimer = setTimeout(() => {
            if (this.isInsidePet && !this.isDragging && !this.isSleeping) {
              this.coucou.tryMood('shy', 3000);
            }
          }, 2500);
        } else {
          if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
          }
          this.coucou.onOutside();
          if (!this.isDragging && this.currentEmotion === 'happy' && !this.emotionTimeout) {
            this.setEmotion(this.getBaselineEmotion());
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
          this.handleClick(upEvent.detail || 1);
        }
      }
    });

    // Double click -> surprised (guide reaction)
    window.addEventListener('dblclick', (e) => {
      if (this.isInsidePet && e.button === 0) {
        this.setEmotion('surprised', 1600, 4);
        if (window.soundEffects) window.soundEffects.playHappy();
      }
    });

    // Right click -> clap reaction + existing quick menu
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.isInsidePet) this.coucou.clap();
      if ((this.isInsidePet || (this.menuEl && !this.menuEl.classList.contains('hidden'))) && this.menuEl) {
        this.openQuickMenu(e);
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.menuEl && !this.menuEl.classList.contains('hidden')) {
        if (!this.menuEl.contains(e.target)) {
          this.closeQuickMenu();
        }
      }
    });

    if (this.menuEl) {
      this.menuEl.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          if (action === 'copy') {
            this.handleMenuAction(action, item);
            // Let the "Copied!" state register before the card closes.
            setTimeout(() => this.closeQuickMenu(), 650);
            return;
          }
          this.closeQuickMenu();
          this.handleMenuAction(action, item);
        });
      });
    }
  }

  openQuickMenu(e) {
    if (!this.menuEl) return;
    this.resetCopyLabels();

    const cursorX = e && typeof e.clientX === 'number' ? e.clientX : 25;
    const cursorY = e && typeof e.clientY === 'number' ? e.clientY : 25;
    const wasHidden = this.menuEl.classList.contains('hidden');

    // Measure the compact card; fallback matches the small glossy pebble size.
    if (wasHidden) this.menuEl.classList.remove('hidden');
    const menuW = this.menuEl.offsetWidth || 158;
    const menuH = this.menuEl.offsetHeight || 180;
    if (wasHidden) this.menuEl.classList.add('hidden');

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const maxX = Math.max(6, winW - menuW - 6);
    const maxY = Math.max(6, winH - menuH - 6);

    let posX = Math.max(6, Math.min(maxX, cursorX - 10));
    let posY = Math.max(6, Math.min(maxY, cursorY - 8));

    // Pop from the edge nearest the cursor when the card gets clamped.
    const originX = posX + menuW <= cursorX + 2 ? 'right' : 'left';
    const originY = posY + menuH <= cursorY + 2 ? 'bottom' : 'top';
    this.menuEl.style.setProperty('--menu-origin', `${originX} ${originY}`);
    this.menuEl.style.left = `${posX}px`;
    this.menuEl.style.top = `${posY}px`;
    this.menuEl.classList.remove('hidden');

    if (ipcRenderer) {
      ipcRenderer.send('pet:menu-state', true);
      ipcRenderer.send('pet:set-ignore-mouse-events', false);
    }
  }

  closeQuickMenu() {
    if (!this.menuEl || this.menuEl.classList.contains('hidden')) return;
    this.menuEl.classList.add('hidden');
    if (ipcRenderer) {
      ipcRenderer.send('pet:menu-state', false);
      if (!this.isInsidePet && !this.isDragging) {
        ipcRenderer.send('pet:set-ignore-mouse-events', true);
      }
    }
  }

  handleClick(detail = 1) {
    if (this.currentEmotion === 'sleeping' || this.currentEmotion === 'sleep' || this.currentEmotion === 'sleepy') {
      this.wakeUp();
      return;
    }

    // Coucou owns click reactions (happy / surprised / ball / 5-click angry).
    this.coucou.click(detail);
    if (window.soundEffects) window.soundEffects.playChirp();
    if (ipcRenderer) {
      ipcRenderer.send('pet:clicked');
    }
  }

  wakeUp() {
    this.setBaseEmotion('neutral');
    this.setEmotion('surprised', 350, 4);
    setTimeout(() => {
      this.setEmotion('happy', 2000, 4);
      this.playfulNudge();
    }, 320);
    if (window.soundEffects) window.soundEffects.playChirp();
    if (ipcRenderer) {
      ipcRenderer.send('pet:reset-idle');
    }
  }

  handleMenuAction(action, sourceEl) {
    if (!ipcRenderer) return;
    switch (action) {
      case 'panel':
        ipcRenderer.send('panel:open', { tab: 'chat' });
        break;
      case 'copy':
        this.copyBubbleText(sourceEl);
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
        ipcRenderer.send('settings:open');
        break;
      case 'hide':
        ipcRenderer.send('pet:hide');
        break;
    }
  }

  setupIPC() {
    if (!ipcRenderer) return;

    // 1. Global Cursor Coordinate Updates (handles both channel names)
    const handleCursorUpdate = (data) => {
      if (this.isSleeping || !data) return;
      this.targetEyeOffset.x = data.normX || 0;
      this.targetEyeOffset.y = data.normY || 0;
      this.coucou.onCursor(data.normX, data.normY);
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

    // Typing in the panel is forwarded here by the main process. This reuses
    // the same local typing pose as real keys pressed on the pet window.
    ipcRenderer.on('pet:typing', () => this.coucou.onTypingSignal());

    // True system-idle windows: Pixie fills them with short random activities
    // instead of sitting in a bored pose.
    ipcRenderer.on('pet:idle-play', () => this.coucou.onIdleSignal());
    ipcRenderer.on('pet:idle-stop', () => this.coucou.stopIdleActivities());

    // 3. Embedded Speech Bubble
    ipcRenderer.on('pet:show-bubble', (event, data) => {
      if (data) this.showBubble(data);
    });

    ipcRenderer.on('pet:hide-bubble', () => {
      this.hideBubble();
    });

    ipcRenderer.on('pet:close-menu', () => {
      this.closeQuickMenu();
    });

    ipcRenderer.on('pet:bubble-position', (event, { flipped }) => {
      const root = document.getElementById('pet-root-container');
      if (this.bubbleEl) {
        if (flipped) {
          this.bubbleEl.classList.add('flipped-below');
          if (root) root.classList.add('bubble-flipped');
        } else {
          this.bubbleEl.classList.remove('flipped-below');
          if (root) root.classList.remove('bubble-flipped');
        }
        // Recalculate bubble distance after flip so it's always snug against the pet
        this.updateBubblePosition(flipped);
      }
    });

    // 4. Real-time Appearance Updates
    ipcRenderer.on('pet:apply-appearance', (event, config) => {
      this.pet.updateConfig(config);
      this.render();
      // Recalculate bubble anchor when scale/height changes so bubble stays snug
      const flipped = this.bubbleEl ? this.bubbleEl.classList.contains('flipped-below') : false;
      this.updateBubblePosition(flipped);
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
  window.petController = new CoucouController();
});
