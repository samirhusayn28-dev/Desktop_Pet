/**
 * Pixie — code-driven desktop pet renderer.
 * Single SVG/code-driven character; no external images or static assets.
 * Internal Coucou class/id hooks are preserved for compatibility.
 * API: constructor, updateConfig, render(emotion, options)
 */
(function (global) {
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* Single source of truth for body/face geometry. The animator reads this too. */
  const BODY = Object.freeze({ x:110, y:68, w:132, h:90, r:40 });
  const FACE = Object.freeze({ x:BODY.x + BODY.w / 2, y:BODY.y + BODY.h / 2 }); // 176, 113
  const SHADOW = Object.freeze({ y:173, rx:54, ry:6 });
  const EYE_DX = 20;
  const CHEEK_DX = 26, CHEEK_DY = 13;
  /* Max local extents of eyes, arcs, mouth and cheeks before rig scale. */
  const FACE_EXTENT = Object.freeze({ x:33, top:15, bottom:33 });
  const FACE_BOX = Object.freeze({
    minX: FACE.x - FACE_EXTENT.x, maxX: FACE.x + FACE_EXTENT.x,
    minY: FACE.y - FACE_EXTENT.top, maxY: FACE.y + FACE_EXTENT.bottom
  });
  const LOOK = Object.freeze({ x:11, y:3, pad:6 });
  const SHY_BLUSH = 0.33;

  const GEOMETRY = Object.freeze({
    BODY, FACE, SHADOW, EYE_DX, CHEEK_DX, CHEEK_DY,
    FACE_EXTENT, FACE_BOX, LOOK, SHY_BLUSH
  });

  const MOUTHS = {
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
  const MOUTH_OF = {
    happy: 'smile', scared: 'wavy', sad: 'sad', angry: 'flat', bright: 'flat',
    curious: 'tiny_o', sleepy: 'yawn', shy: 'tiny_smile', grateful: 'big',
    playful: 'open_smile', dizzy: 'wavy', ticklish: 'open_smile', hungry: 'open',
    proud: 'smile', startled: 'o', focusing: 'focused', calculating: 'tiny_o',
    generating: 'tiny_o',
    converting: 'smirk', organizing: 'smile', writing: 'smirk', styling: 'smirk',
    clipping: 'tiny_o', configuring: 'tiny_o', creating: 'open_smile', guarding: 'flat',
    reviewing: 'focused', relaxed: 'smile', neutral: 'tiny_smile'
  };

  class PetRenderer {
    constructor(options = {}) {
      this.config = Object.assign({
        scale: 1.0,
        depth: 78,
        bodyColor: '#ffffff',
        eyeColor: '#111111',
        mouthColor: '#111111'
      }, options);
    }

    updateConfig(newConfig = {}) { this.config = Object.assign({}, this.config, newConfig || {}); }

    normalizeEmotion(e) {
      const k = String(e || 'neutral').toLowerCase();
      const map = {
        laughing: 'happy', laugh: 'happy', happy: 'happy', excited: 'happy', celebrating: 'happy',
        proud: 'proud', grateful: 'grateful', love: 'grateful', vibing: 'playful', music: 'playful',
        energized: 'playful', charging: 'playful', blush: 'shy',
        neutral: 'neutral', relaxed: 'relaxed', relieved: 'relaxed', goodbye: 'neutral',
        sad: 'sad', worried: 'sad', irritated: 'angry', annoyed: 'angry', stressed: 'sad', error: 'sad',
        surprised: 'startled', scared: 'scared', 'reminder-due': 'startled', dizzy: 'dizzy',
        sleepy: 'sleepy', dull: 'sleepy', dim: 'sleepy', 'low-battery': 'sleepy', bored: 'sad', yawn: 'sleepy',
        sleeping: 'sleepy', sleep: 'sleepy', bright: 'bright',
        thinking: 'curious', confused: 'curious', curious: 'curious',
        focus: 'focused', focused: 'focused', reading: 'focused', squint: 'focused',
        wink: 'playful', ticklish: 'ticklish', hungry: 'hungry', shy: 'shy', angry: 'angry',
        focusing: 'focusing', calculating: 'calculating', generating: 'generating', converting: 'converting',
        organizing: 'organizing', writing: 'writing', styling: 'styling',
        clipping: 'clipping', configuring: 'configuring', creating: 'creating',
        guarding: 'guarding', reviewing: 'reviewing'
      };
      return map[k] || 'neutral';
    }

    render(emotion = 'neutral', options = {}) {
      const cfg = Object.assign({}, this.config, options);
      const size = options.size || Math.round(220 * (cfg.scale || 1));
      const emo = this.normalizeEmotion(emotion);
      const p = options.idPrefix || `coucou-${Math.floor(Math.random() * 1e6)}`;
      const d = clamp((cfg.depth ?? 78) / 100, 0, 1);
      const eyeColor = cfg.eyeColor || '#111111';
      const mouthColor = cfg.mouthColor || '#111111';
      const mouth = MOUTHS[MOUTH_OF[emo]] || MOUTHS.tiny_smile;

      // Fit the 324x182 guide viewBox into the app's 220x220 hit-test space.
      const s = 220 / 324;
      const ty = (220 - 182 * s) / 2;

      let keys = '';
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 10; i++) {
          keys += `<rect class="coucou-key" data-side="${i < 5 ? 'L' : 'R'}" x="${125 + i * 10.5}" y="${142 + r * 9.5}" width="8.5" height="7" rx="1.5" fill="#8a8a9a"/>`;
        }
      }

      const cssVars = [
        `--coucou-face-x:${FACE.x}px`,
        `--coucou-face-y:${FACE.y}px`,
        `--coucou-body-bottom:${BODY.y + BODY.h}px`,
        `--coucou-shadow-y:${SHADOW.y}px`
      ].join(';');

      return `
        <svg class="devpet-svg facebot-svg coucou-svg emotion-${emo}" viewBox="0 0 220 220" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="${cssVars}" data-emotion="${emo}" data-character="coucou" role="img" aria-label="Pixie ${esc(emo)}">
          <defs>
            <radialGradient id="${p}-bodyG" class="coucou-body-gradient" cx="36%" cy="24%" r="85%">
              <stop offset="0" stop-color="#ffffff"/>
              <stop offset=".5" stop-color="#f0f0f5"/>
              <stop offset="1" stop-color="#c6c6d1"/>
            </radialGradient>
            <radialGradient id="${p}-limbG" cx="35%" cy="28%" r="85%">
              <stop offset="0" stop-color="#ffffff"/>
              <stop offset=".6" stop-color="#e6e6ed"/>
              <stop offset="1" stop-color="#c3c3ce"/>
            </radialGradient>
            <clipPath id="${p}-bodyClip"><rect x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.r}"/></clipPath>
            <filter id="${p}-soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
            <filter id="${p}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
            <filter id="${p}-limbShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".3"/>
            </filter>
          </defs>

          <g class="devpet-root facebot-root">
            <g transform="translate(0 ${ty.toFixed(3)}) scale(${s.toFixed(6)})">
              <ellipse class="coucou-shadow devpet-shadow" cx="${FACE.x}" cy="${SHADOW.y}" rx="${SHADOW.rx}" ry="${SHADOW.ry}" fill="#000" filter="url(#${p}-soft)" opacity="${(0.5 * d).toFixed(2)}"/>

              <g class="coucou-all">
                <g class="coucou-limbs">
                  <path class="coucou-limb coucou-limb-left" fill="url(#${p}-limbG)" filter="url(#${p}-limbShadow)" d=""/>
                  <path class="coucou-limb coucou-limb-right" fill="url(#${p}-limbG)" filter="url(#${p}-limbShadow)" d=""/>
                </g>

                <g class="coucou-lean">
                  <g class="coucou-blob">
                    <rect class="coucou-body facebot-body-shape" x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.r}" fill="url(#${p}-bodyG)"/>
                    <g clip-path="url(#${p}-bodyClip)">
                      <g class="coucou-occ">
                        <ellipse cx="190" cy="166" rx="84" ry="22" fill="#5d5d70" opacity=".4" filter="url(#${p}-soft2)"/>
                        <ellipse cx="248" cy="115" rx="14" ry="44" fill="#6d6d80" opacity=".22" filter="url(#${p}-soft2)"/>
                      </g>
                    </g>
                    <g class="coucou-spec">
                      <ellipse cx="127" cy="90" rx="4" ry="2.4" fill="#fff" transform="rotate(-35 127 90)"/>
                    </g>

                    <!-- One rig: eyes, arcs, shy blush and mouth share this single transform. -->
                    <g class="coucou-face-rig coucou-eyes facebot-face">
                      <g class="coucou-blush" style="opacity:0">
                        <ellipse cx="${FACE.x - CHEEK_DX}" cy="${FACE.y + CHEEK_DY}" rx="7" ry="4.5" fill="#ff7f9d" filter="url(#${p}-soft)"/>
                        <ellipse cx="${FACE.x + CHEEK_DX}" cy="${FACE.y + CHEEK_DY}" rx="7" ry="4.5" fill="#ff7f9d" filter="url(#${p}-soft)"/>
                      </g>

                      <g class="coucou-eye eye-left" transform="translate(${FACE.x - EYE_DX} ${FACE.y})">
                        <g class="coucou-eye-blink">
                          <ellipse cx="0" cy="0" rx="6" ry="9" fill="${eyeColor}"/>
                          <ellipse class="coucou-eye-highlight" cx="2.2" cy="-4" rx="1.7" ry="2.4" fill="#fff" opacity=".9"/>
                        </g>
                        <path class="coucou-arc coucou-arcs" d="M-7 5 Q0 -8 7 5" fill="none" stroke="${eyeColor}" stroke-width="3" stroke-linecap="round"/>
                      </g>

                      <g class="coucou-eye eye-right" transform="translate(${FACE.x + EYE_DX} ${FACE.y})">
                        <g class="coucou-eye-blink">
                          <ellipse cx="0" cy="0" rx="6" ry="9" fill="${eyeColor}"/>
                          <ellipse class="coucou-eye-highlight" cx="2.2" cy="-4" rx="1.7" ry="2.4" fill="#fff" opacity=".9"/>
                        </g>
                        <path class="coucou-arc coucou-arcs" d="M-7 5 Q0 -8 7 5" fill="none" stroke="${eyeColor}" stroke-width="3" stroke-linecap="round"/>
                      </g>

                      <g class="coucou-mouth-group">
                        <path class="coucou-mouth" d="${mouth.d}" fill="${mouth.f ? mouthColor : 'none'}" stroke="${mouthColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:1"/>
                      </g>
                    </g>
                  </g>
                </g>

                <g class="coucou-kb">
                  <rect x="120" y="138" width="112" height="32" rx="6" fill="#2a2a35" stroke="#4a4a5a"/>
                  ${keys}
                </g>
              </g>
            </g>
          </g>
        </svg>`;
    }
  }

  PetRenderer.GEOMETRY = GEOMETRY;
  if (typeof global !== 'undefined') {
    global.PetRenderer = PetRenderer;
    global.COUCOU_GEOMETRY = GEOMETRY;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PetRenderer;
})(typeof window !== 'undefined' ? window : global);
