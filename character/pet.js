/**
 * Desktop Pet — Minimal Tobi/Emo-Style Face-Bot Renderer
 * 
 * Features:
 * - 3D Embossed Clay/Plastic Look (light gradient, top specular highlight, inner glow, inner shadow, engraved eyes & mouth)
 * - Complete Appearance Customization (scale, width, height, roundness, eye size, eye spacing, mouth width, depth, body color)
 * - 12 Expressive Emotion States with smooth vector paths
 * - 60fps low-CPU pure SVG & CSS rendering
 */

(function(global) {
  // Helper to lighten/darken hex colors for 3D gradient shading
  function shadeHex(hex, percent) {
    let clean = (hex || '#FFFFFF').replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    let num = parseInt(clean, 16);
    if (isNaN(num)) num = 0xFFFFFF;

    const amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = ((num >> 8) & 0x00FF) + amt;
    let B = (num & 0x0000FF) + amt;

    R = Math.max(0, Math.min(255, R));
    G = Math.max(0, Math.min(255, G));
    B = Math.max(0, Math.min(255, B));

    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  const DEFAULT_CONFIG = {
    scale: 1.0,           // 0.5 to 3.0 (50% - 300%)
    width: 136,           // 60 - 200 px
    height: 120,          // 60 - 200 px
    roundness: 36,        // 0 - 50%
    eyeSize: 1.0,         // 0.5 - 2.0
    eyeSpacing: 44,       // 20 - 70 px
    mouthWidth: 14,       // 6 - 28 px
    depth: 80,            // 0 - 100 (3D puffy intensity)
    bodyColor: '#FFFFFF', // Hex
    primaryColor: '#FF7A2F',
    primaryGlow: '#FF5A1F'
  };

  class PetRenderer {
    constructor(options = {}) {
      this.config = Object.assign({}, DEFAULT_CONFIG, options);
      this.featureColor = '#181820'; // Deep dark charcoal
    }

    updateConfig(newConfig = {}) {
      this.config = Object.assign({}, this.config, newConfig);
    }

    /**
     * Renders standalone SVG string for the requested emotion & options
     */
    render(emotion = 'neutral', options = {}) {
      const cfg = Object.assign({}, this.config, options);
      const size = options.size || Math.round(220 * cfg.scale);
      const eyeX = options.eyeOffset?.x || 0;
      const eyeY = options.eyeOffset?.y || 0;
      const isBlinking = options.isBlinking || false;
      const idPrefix = options.idPrefix || `facebot-${Math.floor(Math.random() * 1000000)}`;

      // Center geometry in 220x220 viewBox
      const cx = 110;
      const cy = 110;
      const w = Math.max(60, Math.min(200, cfg.width));
      const h = Math.max(60, Math.min(200, cfg.height));
      const x = cx - w / 2;
      const y = cy - h / 2;

      // Corner radius based on roundness %
      const maxR = Math.min(w, h) / 2;
      const rx = Math.max(0, Math.min(maxR, maxR * (cfg.roundness / 50)));
      const ry = rx;

      // 3D Depth Factor (0.0 = flat 2D, 1.0 = maximum puffy clay)
      const d = Math.max(0, Math.min(100, cfg.depth)) / 100;

      const defs = this.getDefs(idPrefix, cfg, d, { x, y, w, h, rx, ry });
      const faceContent = this.getEmotionFace(emotion, idPrefix, cfg, { eyeX, eyeY, isBlinking, cx, cy, d });
      const glassesContent = cfg.glassesEnabled ? this.getGlassesOverlay(cfg, { cx, cy, x, y, w, h }) : '';

      return `
        <svg class="facebot-svg emotion-${emotion} ${isBlinking ? 'blinking' : ''}" 
             viewBox="0 0 220 220" 
             width="${size}" 
             height="${size}" 
             xmlns="http://www.w3.org/2000/svg"
             data-emotion="${emotion}">
          ${defs}
          <g class="facebot-root">
            <!-- 1. Ambient Contact & Floor Drop Shadow -->
            ${d > 0.05 ? `
              <ellipse cx="${cx}" cy="${y + h + 12}" 
                       rx="${(w * 0.44).toFixed(1)}" 
                       ry="${(7 * d + 2).toFixed(1)}" 
                       fill="url(#${idPrefix}-floor-grad)" />
            ` : ''}

            <!-- 2. The 3D Rounded Rectangle Body -->
            <g class="facebot-body-wrap">
              ${d > 0.05 ? `
                <rect x="${x.toFixed(1)}" y="${(y + 3.5 * d).toFixed(1)}" 
                      width="${w.toFixed(1)}" height="${h.toFixed(1)}" 
                      rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" 
                      fill="rgba(0, 0, 0, ${(0.16 * d).toFixed(2)})" />
              ` : ''}
              <!-- Base 3D Body Surface -->
              <rect class="facebot-body-shape" 
                    x="${x.toFixed(1)}" y="${y.toFixed(1)}" 
                    width="${w.toFixed(1)}" height="${h.toFixed(1)}" 
                    rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" 
                    fill="url(#${idPrefix}-body-grad)" 
                    stroke="rgba(255, 255, 255, ${(0.85 * d).toFixed(2)})" 
                    stroke-width="${(1.5 * d).toFixed(1)}" />

              ${d > 0.1 ? `
                <!-- Inner Bottom-Right Shading Rim (simulates puffy edge curve) -->
                <rect x="${(x + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" 
                      width="${(w - 2).toFixed(1)}" height="${(h - 2).toFixed(1)}" 
                      rx="${Math.max(0, rx - 1).toFixed(1)}" ry="${Math.max(0, ry - 1).toFixed(1)}" 
                      fill="none" 
                      stroke="url(#${idPrefix}-inner-shadow-grad)" 
                      stroke-width="${(3.5 * d).toFixed(1)}" 
                      opacity="${(0.8 * d).toFixed(2)}" />

                <!-- Inner Top-Left Highlight Rim (inset white light bounce) -->
                <rect x="${(x + 2).toFixed(1)}" y="${(y + 2).toFixed(1)}" 
                      width="${(w - 4).toFixed(1)}" height="${(h - 4).toFixed(1)}" 
                      rx="${Math.max(0, rx - 2).toFixed(1)}" ry="${Math.max(0, ry - 2).toFixed(1)}" 
                      fill="none" 
                      stroke="url(#${idPrefix}-inner-light-grad)" 
                      stroke-width="${(2.5 * d).toFixed(1)}" 
                      opacity="${(0.9 * d).toFixed(2)}" />

                <!-- Glossy Specular Highlight Pill on Top-Left Corner -->
                <ellipse cx="${(x + w * 0.26).toFixed(1)}" cy="${(y + h * 0.20).toFixed(1)}" 
                         rx="${(w * 0.20).toFixed(1)}" ry="${(h * 0.08).toFixed(1)}" 
                         transform="rotate(-16, ${(x + w * 0.26).toFixed(1)}, ${(y + h * 0.20).toFixed(1)})" 
                         fill="url(#${idPrefix}-specular-grad)" 
                         opacity="${(0.75 * d).toFixed(2)}" />
              ` : ''}

              <!-- 3. Face Group: Eyes + Mouth with Inset Socket Depth & Cursor Parallax -->
              <g class="facebot-face" transform="translate(${eyeX}, ${eyeY})">
                ${faceContent}
              </g>

              <!-- 4. Glasses Layer (Item G1: Tilts & breathes with face, doesn't follow cursor) -->
              ${glassesContent}
            </g>
          </g>
        </svg>
      `;
    }

    getGlassesOverlay(cfg, { cx, cy, x, y, w, h }) {
      const spacing = Math.max(20, Math.min(70, cfg.eyeSpacing));
      const eyeScale = Math.max(0.5, Math.min(2.0, cfg.eyeSize));
      const lx = cx - spacing / 2;
      const rx = cx + spacing / 2;
      const ey = cy - 6;

      // Lens radius derived from eyeScale & spacing, clamped to body
      let r = Math.round(11 * eyeScale + 3);
      const maxAllowedR = Math.min((spacing / 2 - 2), (w / 2 - 6), (h / 2 - 8));
      r = Math.max(8, Math.min(r, maxAllowedR));

      const leftArmX = Math.max(x + 2, lx - r - 8);
      const rightArmX = Math.min(x + w - 2, rx + r + 8);

      return `
        <g class="facebot-glasses" id="facebot-glasses">
          <!-- Left Lens Frame -->
          <circle cx="${lx}" cy="${ey}" r="${r}" fill="none" stroke="#111111" stroke-width="2.6" />
          <!-- Right Lens Frame -->
          <circle cx="${rx}" cy="${ey}" r="${r}" fill="none" stroke="#111111" stroke-width="2.6" />
          <!-- Center Bridge Arch -->
          <path d="M ${(lx + r).toFixed(1)} ${ey} Q ${cx} ${(ey - 3.5).toFixed(1)}, ${(rx - r).toFixed(1)} ${ey}" stroke="#111111" stroke-width="2.4" stroke-linecap="round" fill="none" />
          <!-- Left Temple Arm -->
          <line x1="${(lx - r).toFixed(1)}" y1="${ey}" x2="${leftArmX.toFixed(1)}" y2="${(ey - 1.5).toFixed(1)}" stroke="#111111" stroke-width="2.2" stroke-linecap="round" />
          <!-- Right Temple Arm -->
          <line x1="${(rx + r).toFixed(1)}" y1="${ey}" x2="${rightArmX.toFixed(1)}" y2="${(ey - 1.5).toFixed(1)}" stroke="#111111" stroke-width="2.2" stroke-linecap="round" />
          <!-- Subtle specular reflection glint on upper lenses -->
          <line x1="${(lx - r*0.5).toFixed(1)}" y1="${(ey - r*0.5).toFixed(1)}" x2="${(lx - r*0.1).toFixed(1)}" y2="${(ey - r*0.8).toFixed(1)}" stroke="rgba(255,255,255,0.45)" stroke-width="1.2" stroke-linecap="round" />
          <line x1="${(rx - r*0.5).toFixed(1)}" y1="${(ey - r*0.5).toFixed(1)}" x2="${(rx - r*0.1).toFixed(1)}" y2="${(ey - r*0.8).toFixed(1)}" stroke="rgba(255,255,255,0.45)" stroke-width="1.2" stroke-linecap="round" />
        </g>
      `;
    }

    getDefs(p, cfg, d, geo) {
      const baseCol = cfg.bodyColor || '#FFFFFF';
      const themeCol = cfg.primaryColor || '#FF7A2F';

      // 3D light & dark stops based on depth
      const lightStop = shadeHex(baseCol, Math.round(15 * d));
      const midStop = baseCol;
      const shadeStop1 = shadeHex(baseCol, Math.round(-10 * d));
      const shadeStop2 = shadeHex(baseCol, Math.round(-24 * d));

      return `
        <defs>
          <!-- Soft Drop Shadow Filter for Body (Lightweight single-pass for low CPU) -->
          <filter id="${p}-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="${(4 * d).toFixed(1)}" stdDeviation="${(4 * d + 0.5).toFixed(1)}" flood-color="rgba(0,0,0,${(0.25 * d).toFixed(2)})" />
          </filter>

          <!-- Floor Contact Shadow Radial Gradient (Zero GPU filter cost) -->
          <radialGradient id="${p}-floor-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#000000" stop-opacity="${(0.35 * d).toFixed(2)}" />
            <stop offset="55%" stop-color="#000000" stop-opacity="${(0.16 * d).toFixed(2)}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
          </radialGradient>

          <!-- Inset Eye / Mouth Socket Shadow Filter -->
          <filter id="${p}-socket-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="${(1.2 * d).toFixed(1)}" stdDeviation="${(0.8 * d).toFixed(1)}" flood-color="rgba(0,0,0,${(0.55 * d).toFixed(2)})" />
          </filter>

          <!-- Body 3D Light Gradient (Top-Left light source towards Bottom-Right) -->
          <linearGradient id="${p}-body-grad" x1="15%" y1="10%" x2="85%" y2="90%">
            <stop offset="0%" stop-color="${lightStop}" />
            <stop offset="40%" stop-color="${midStop}" />
            <stop offset="82%" stop-color="${shadeStop1}" />
            <stop offset="100%" stop-color="${shadeStop2}" />
          </linearGradient>

          <!-- Inner Top-Left Highlight Gradient -->
          <linearGradient id="${p}-inner-light-grad" x1="10%" y1="10%" x2="85%" y2="85%">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="${(0.95 * d).toFixed(2)}" />
            <stop offset="45%" stop-color="#FFFFFF" stop-opacity="${(0.4 * d).toFixed(2)}" />
            <stop offset="85%" stop-color="#FFFFFF" stop-opacity="0" />
          </linearGradient>

          <!-- Inner Bottom-Right Shadow Gradient -->
          <linearGradient id="${p}-inner-shadow-grad" x1="15%" y1="15%" x2="90%" y2="90%">
            <stop offset="0%" stop-color="#000000" stop-opacity="0" />
            <stop offset="55%" stop-color="#141026" stop-opacity="${(0.18 * d).toFixed(2)}" />
            <stop offset="100%" stop-color="#141026" stop-opacity="${(0.52 * d).toFixed(2)}" />
          </linearGradient>

          <!-- Specular Highlight Linear Gradient -->
          <linearGradient id="${p}-specular-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9" />
            <stop offset="70%" stop-color="#FFFFFF" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.0" />
          </linearGradient>

          <!-- Accent Glow Filter (for hearts, thought bubbles) -->
          <filter id="${p}-accent-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      `;
    }

    /**
     * Renders eyes and mouth for the requested emotion using dynamic geometry
     */
    getEmotionFace(emotion, p, cfg, { eyeX, eyeY, isBlinking, cx, cy, d }) {
      const c = this.featureColor;
      const themeCol = cfg.primaryColor || '#FF7A2F';

      // Dynamic Eye Geometry
      const spacing = Math.max(20, Math.min(70, cfg.eyeSpacing));
      const eyeScale = Math.max(0.5, Math.min(2.0, cfg.eyeSize));
      const mWidth = Math.max(6, Math.min(28, cfg.mouthWidth));

      // Coordinates
      const lx = cx - spacing / 2;
      const rx = cx + spacing / 2;
      const ey = cy - 6;
      const my = cy + 14;

      const baseRx = (6.5 * eyeScale).toFixed(1);
      const baseRy = (7.5 * eyeScale).toFixed(1);
      const filterAttr = '';

      // Bottom rim highlight helper (gives eyes engraved bezel feel)
      const rim = (cxVal, cyVal, rxVal, ryVal) => {
        if (d < 0.2) return '';
        return `<ellipse cx="${cxVal}" cy="${(cyVal + 0.8).toFixed(1)}" rx="${rxVal}" ry="${ryVal}" fill="none" stroke="rgba(255,255,255,${(0.5 * d).toFixed(2)})" stroke-width="0.7" />`;
      };

      // Blinking state
      if (isBlinking && emotion !== 'sleeping' && emotion !== 'sleepy') {
        const slitLen = (baseRx * 1.8).toFixed(1);
        return `
          <g ${filterAttr}>
            <line x1="${(lx - slitLen/2).toFixed(1)}" y1="${ey}" x2="${(lx + slitLen/2).toFixed(1)}" y2="${ey}" stroke="${c}" stroke-width="${(2.5 * eyeScale).toFixed(1)}" stroke-linecap="round" />
            <line x1="${(rx - slitLen/2).toFixed(1)}" y1="${ey}" x2="${(rx + slitLen/2).toFixed(1)}" y2="${ey}" stroke="${c}" stroke-width="${(2.5 * eyeScale).toFixed(1)}" stroke-linecap="round" />
            <line x1="${(cx - mWidth/2).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" />
          </g>
        `;
      }

      switch (emotion) {
        // 1. NEUTRAL
        case 'neutral':
          return `
            <g ${filterAttr}>
              ${rim(lx, ey, baseRx, baseRy)}
              ${rim(rx, ey, baseRx, baseRy)}
              <ellipse class="eye-left" cx="${lx}" cy="${ey}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${ey}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <line class="mouth" x1="${(cx - mWidth/2).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" />
            </g>
          `;

        // 2. HAPPY
        case 'happy': {
          const arcW = (baseRx * 1.5).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 2)} Q ${lx} ${(ey - 10)}, ${(lx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey + 2)} Q ${rx} ${(ey - 10)}, ${(rx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 3)} Q ${cx} ${(my + 7)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 3)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <ellipse cx="${(lx - baseRx * 1.8).toFixed(1)}" cy="${(ey + 12)}" rx="${(6 * eyeScale).toFixed(1)}" ry="${(3.5 * eyeScale).toFixed(1)}" fill="${themeCol}" opacity="0.25" />
              <ellipse cx="${(rx + baseRx * 1.8).toFixed(1)}" cy="${(ey + 12)}" rx="${(6 * eyeScale).toFixed(1)}" ry="${(3.5 * eyeScale).toFixed(1)}" fill="${themeCol}" opacity="0.25" />
            </g>
          `;
        }

        // 3. SAD
        case 'sad':
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left" cx="${lx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <path d="M ${(lx - 8)} ${(ey - 7)} Q ${lx} ${(ey - 5)}, ${(lx + 8)} ${(ey - 9)}" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
              <path d="M ${(rx - 8)} ${(ey - 9)} Q ${rx} ${(ey - 5)}, ${(rx + 8)} ${(ey - 7)}" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my + 3)} Q ${cx} ${(my - 5)}, ${(cx + mWidth/2).toFixed(1)} ${(my + 3)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
            </g>
          `;

        // 4. SURPRISED
        case 'surprised': {
          const bigR = (baseRx * 1.45).toFixed(1);
          return `
            <g ${filterAttr}>
              <circle class="eye-left" cx="${lx}" cy="${ey}" r="${bigR}" fill="${c}" />
              <circle cx="${(lx + 3).toFixed(1)}" cy="${(ey - 3).toFixed(1)}" r="${(bigR * 0.3).toFixed(1)}" fill="#FFFFFF" />
              <circle class="eye-right" cx="${rx}" cy="${ey}" r="${bigR}" fill="${c}" />
              <circle cx="${(rx + 3).toFixed(1)}" cy="${(ey - 3).toFixed(1)}" r="${(bigR * 0.3).toFixed(1)}" fill="#FFFFFF" />
              <ellipse class="mouth" cx="${cx}" cy="${(my + 1)}" rx="${(mWidth * 0.3).toFixed(1)}" ry="${(mWidth * 0.42).toFixed(1)}" stroke="${c}" stroke-width="2.2" fill="none" />
            </g>
          `;
        }

        // 5. SLEEPY
        case 'sleepy': {
          const slitW = (baseRx * 1.4).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - slitW)} ${(ey + 1)} Q ${lx} ${(ey - 1)}, ${(lx + +slitW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - slitW)} ${(ey + 1)} Q ${rx} ${(ey - 1)}, ${(rx + +slitW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <line class="mouth" x1="${(cx - mWidth/2).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" />
              <g class="sleep-z-drift">
                <text x="${(rx + 12)}" y="${(ey - 18)}" font-family="'Outfit', sans-serif" font-size="12" font-weight="700" fill="${themeCol}" opacity="0.8">z</text>
                <text x="${(rx + 22)}" y="${(ey - 30)}" font-family="'Outfit', sans-serif" font-size="15" font-weight="800" fill="${themeCol}">Z</text>
              </g>
            </g>
          `;
        }

        // 6. SLEEPING
        case 'sleeping': {
          const arcW = (baseRx * 1.4).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey)} Q ${lx} ${(ey + 5)}, ${(lx + +arcW)} ${(ey)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey)} Q ${rx} ${(ey + 5)}, ${(rx + +arcW)} ${(ey)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <line class="mouth" x1="${(cx - mWidth/2.5).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2.5).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2" stroke-linecap="round" />
              <g class="sleep-z-drift">
                <text x="${(rx + 10)}" y="${(ey - 16)}" font-family="'Outfit', sans-serif" font-size="11" font-weight="700" fill="${themeCol}" opacity="0.6">z</text>
                <text x="${(rx + 20)}" y="${(ey - 30)}" font-family="'Outfit', sans-serif" font-size="15" font-weight="800" fill="${themeCol}" opacity="0.8">z</text>
                <text x="${(rx + 32)}" y="${(ey - 46)}" font-family="'Outfit', sans-serif" font-size="19" font-weight="900" fill="${themeCol}">Z</text>
              </g>
            </g>
          `;
        }

        // 7. ANGRY
        case 'angry':
          return `
            <g ${filterAttr}>
              <line x1="${(lx - 9)}" y1="${(ey - 10)}" x2="${(lx + 8)}" y2="${(ey - 4)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" />
              <line x1="${(rx + 9)}" y1="${(ey - 10)}" x2="${(rx - 8)}" y2="${(ey - 4)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" />
              <ellipse class="eye-left" cx="${lx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <line class="mouth" x1="${(cx - mWidth/2).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" />
            </g>
          `;

        // 8. LOVE
        case 'love': {
          const hw = (baseRx * 1.5).toFixed(1);
          return `
            <g>
              <path class="eye-left" d="M ${lx} ${(ey + 3)} C ${lx} ${(ey + 3)}, ${(lx - hw)} ${(ey - 4)}, ${(lx - hw)} ${(ey - 9)} C ${(lx - hw)} ${(ey - 13)}, ${(lx - hw/2)} ${(ey - 15)}, ${lx} ${(ey - 12)} C ${(lx + hw/2)} ${(ey - 15)}, ${(lx + +hw)} ${(ey - 13)}, ${(lx + +hw)} ${(ey - 9)} C ${(lx + +hw)} ${(ey - 4)}, ${lx} ${(ey + 3)}, ${lx} ${(ey + 3)} Z" 
                    fill="${themeCol}" filter="url(#${p}-accent-glow)" />
              <path class="eye-right" d="M ${rx} ${(ey + 3)} C ${rx} ${(ey + 3)}, ${(rx - hw)} ${(ey - 4)}, ${(rx - hw)} ${(ey - 9)} C ${(rx - hw)} ${(ey - 13)}, ${(rx - hw/2)} ${(ey - 15)}, ${rx} ${(ey - 12)} C ${(rx + hw/2)} ${(ey - 15)}, ${(rx + +hw)} ${(ey - 13)}, ${(rx + +hw)} ${(ey - 9)} C ${(rx + +hw)} ${(ey - 4)}, ${rx} ${(ey + 3)}, ${rx} ${(ey + 3)} Z" 
                    fill="${themeCol}" filter="url(#${p}-accent-glow)" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 2)} Q ${cx} ${(my + 6)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 2)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <polygon points="${(rx + 18)},${(ey - 26)} ${(rx + 20)},${(ey - 22)} ${(rx + 24)},${(ey - 20)} ${(rx + 20)},${(ey - 18)} ${(rx + 18)},${(ey - 14)} ${(rx + 16)},${(ey - 18)} ${(rx + 12)},${(ey - 20)} ${(rx + 16)},${(ey - 22)}" fill="${themeCol}" opacity="0.8" />
            </g>
          `;
        }

        // 9. WINK
        case 'wink': {
          const arcW = (baseRx * 1.4).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 2)} Q ${lx} ${(ey - 10)}, ${(lx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <ellipse class="eye-right" cx="${rx}" cy="${ey}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <circle cx="${(rx + 2).toFixed(1)}" cy="${(ey - 3).toFixed(1)}" r="${(baseRx * 0.35).toFixed(1)}" fill="#FFFFFF" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 1)} Q ${(cx + 2)} ${(my + 5)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 4)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
            </g>
          `;
        }

        // 10. LAUGH
        case 'laugh': {
          const arcW = (baseRx * 1.5).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 2)} Q ${lx} ${(ey - 12)}, ${(lx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(3 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey + 2)} Q ${rx} ${(ey - 12)}, ${(rx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(3 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth * 0.7).toFixed(1)} ${(my - 4)} Q ${cx} ${(my + 13)}, ${(cx + mWidth * 0.7).toFixed(1)} ${(my - 4)} Z" fill="${c}" />
              <ellipse cx="${(lx - baseRx * 1.8).toFixed(1)}" cy="${(ey + 12)}" rx="${(6.5 * eyeScale).toFixed(1)}" ry="${(4 * eyeScale).toFixed(1)}" fill="${themeCol}" opacity="0.3" />
              <ellipse cx="${(rx + baseRx * 1.8).toFixed(1)}" cy="${(ey + 12)}" rx="${(6.5 * eyeScale).toFixed(1)}" ry="${(4 * eyeScale).toFixed(1)}" fill="${themeCol}" opacity="0.3" />
            </g>
          `;
        }

        // 11. THINKING
        case 'thinking':
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left thinking-eye" cx="${(lx - 5)}" cy="${(ey - 6)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right thinking-eye" cx="${(rx - 5)}" cy="${(ey - 6)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${my} Q ${(cx - mWidth/4).toFixed(1)} ${(my - 3)}, ${cx} ${my} Q ${(cx + mWidth/4).toFixed(1)} ${(my + 3)}, ${(cx + mWidth/2).toFixed(1)} ${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <g class="thought-dots-bubble" transform="translate(${(rx + 8)}, ${(ey - 62)})">
                <rect x="0" y="0" width="30" height="20" rx="10" ry="10" fill="#FFFFFF" stroke="${themeCol}" stroke-width="1.6" filter="url(#${p}-soft-shadow)" />
                <circle cx="8" cy="10" r="2.2" fill="${themeCol}" />
                <circle cx="15" cy="10" r="2.2" fill="${themeCol}" />
                <circle cx="22" cy="10" r="2.2" fill="${themeCol}" />
                <circle cx="-3" cy="22" r="2" fill="${themeCol}" opacity="0.75" />
                <circle cx="-7" cy="27" r="1.3" fill="${themeCol}" opacity="0.5" />
              </g>
            </g>
          `;

        // 11b. READING / STREAMING
        case 'reading': {
          const rRx = (baseRx * 1.1).toFixed(1);
          const rRy = (baseRy * 0.85).toFixed(1);
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left reading-eye" cx="${lx}" cy="${(ey + 2)}" rx="${rRx}" ry="${rRy}" fill="${c}" />
              <ellipse class="eye-right reading-eye" cx="${rx}" cy="${(ey + 2)}" rx="${rRx}" ry="${rRy}" fill="${c}" />
              <path class="mouth talking-mouth" d="M ${(cx - mWidth*0.45).toFixed(1)} ${my} Q ${cx} ${(my + 5)}, ${(cx + mWidth*0.45).toFixed(1)} ${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
            </g>
          `;
        }

        // 12. FOCUS
        case 'focus': {
          const fRx = (baseRx * 1.15).toFixed(1);
          const fRy = (baseRy * 0.6).toFixed(1);
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left" cx="${lx}" cy="${ey}" rx="${fRx}" ry="${fRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${ey}" rx="${fRx}" ry="${fRy}" fill="${c}" />
              <line class="mouth" x1="${(cx - mWidth/2).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" />
            </g>
          `;
        }

        // 13. DULL / DIM (Low brightness)
        case 'dull':
        case 'dim': {
          const slitW = (baseRx * 1.3).toFixed(1);
          return `
            <g ${filterAttr} opacity="0.85">
              <path class="eye-left" d="M ${(lx - slitW)} ${(ey + 1)} Q ${lx} ${(ey - 2)}, ${(lx + +slitW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.4 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - slitW)} ${(ey + 1)} Q ${rx} ${(ey - 2)}, ${(rx + +slitW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.4 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth/2.5).toFixed(1)} ${(my + 2)} Q ${cx} ${(my - 2)}, ${(cx + mWidth/2.5).toFixed(1)} ${(my + 2)}" stroke="${c}" stroke-width="2.0" stroke-linecap="round" fill="none" opacity="0.8" />
            </g>
          `;
        }

        // 14. IRRITATED (Volume max / too loud)
        case 'irritated': {
          return `
            <g ${filterAttr}>
              <line x1="${(lx - 10)}" y1="${(ey - 9)}" x2="${(lx + 8)}" y2="${(ey - 3)}" stroke="${c}" stroke-width="2.6" stroke-linecap="round" />
              <line x1="${(rx + 10)}" y1="${(ey - 9)}" x2="${(rx - 8)}" y2="${(ey - 3)}" stroke="${c}" stroke-width="2.6" stroke-linecap="round" />
              <ellipse class="eye-left" cx="${lx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${(baseRy * 0.85).toFixed(1)}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${(baseRy * 0.85).toFixed(1)}" fill="${c}" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${my} L ${(cx - mWidth/6).toFixed(1)} ${(my + 3)} L ${(cx + mWidth/6).toFixed(1)} ${(my - 3)} L ${(cx + mWidth/2).toFixed(1)} ${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </g>
          `;
        }

        // 15. LOW-BATTERY (Battery < 20%)
        case 'low-battery': {
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left" cx="${lx}" cy="${(ey + 3)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${(ey + 3)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <path d="M ${(lx - 8)} ${(ey - 6)} Q ${lx} ${(ey - 4)}, ${(lx + 8)} ${(ey - 8)}" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
              <path d="M ${(rx - 8)} ${(ey - 8)} Q ${rx} ${(ey - 4)}, ${(rx + 8)} ${(ey - 6)}" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my + 2)} Q ${cx} ${(my - 4)}, ${(cx + mWidth/2).toFixed(1)} ${(my + 2)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Battery Badge -->
              <g transform="translate(${(rx + 16)}, ${(ey - 28)})">
                <rect x="0" y="0" width="18" height="10" rx="2" ry="2" fill="none" stroke="#EF4444" stroke-width="1.5" />
                <rect x="18" y="2.5" width="2" height="5" rx="1" ry="1" fill="#EF4444" />
                <rect x="2" y="2" width="4" height="6" fill="#EF4444" />
              </g>
            </g>
          `;
        }

        // 16. CHARGING / ENERGIZED
        case 'charging':
        case 'energized': {
          return `
            <g ${filterAttr}>
              <!-- Sparkle / Lightning Eyes -->
              <polygon points="${lx},${(ey - 9)} ${(lx + 4)},${(ey - 1)} ${lx},${(ey - 1)} ${(lx + 3)},${(ey + 7)} ${(lx - 4)},${(ey + 1)} ${(lx - 1)},${(ey + 1)}" fill="${themeCol}" filter="url(#${p}-accent-glow)" />
              <polygon points="${rx},${(ey - 9)} ${(rx + 4)},${(ey - 1)} ${rx},${(ey - 1)} ${(rx + 3)},${(ey + 7)} ${(rx - 4)},${(ey + 1)} ${(rx - 1)},${(ey + 1)}" fill="${themeCol}" filter="url(#${p}-accent-glow)" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 2)} Q ${cx} ${(my + 7)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 2)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none" />
            </g>
          `;
        }

        // 17. VIBING / MUSIC (Music/Media playing)
        case 'vibing':
        case 'music': {
          const arcW = (baseRx * 1.5).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 2)} Q ${lx} ${(ey - 11)}, ${(lx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey + 2)} Q ${rx} ${(ey - 11)}, ${(rx + +arcW)} ${(ey + 2)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 2)} Q ${cx} ${(my + 8)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 2)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none" />
              <!-- Floating Musical Notes -->
              <g class="vibing-notes" transform="translate(${(rx + 16)}, ${(ey - 28)})">
                <path d="M 0 10 L 0 2 C 0 2 6 0 9 4 L 9 12 M 0 5 L 9 7" stroke="${themeCol}" stroke-width="1.6" fill="none" stroke-linecap="round" />
                <circle cx="-1" cy="10" r="2.2" fill="${themeCol}" />
                <circle cx="8" cy="12" r="2.2" fill="${themeCol}" />
              </g>
              <g class="vibing-notes-small" transform="translate(${(lx - 26)}, ${(ey - 20)})">
                <path d="M 0 8 L 0 0 C 0 0 4 -2 6 1 L 6 9" stroke="${themeCol}" stroke-width="1.3" fill="none" opacity="0.8" />
                <circle cx="-1" cy="8" r="1.8" fill="${themeCol}" opacity="0.8" />
              </g>
            </g>
          `;
        }

        // 18. STRESSED (High CPU/RAM)
        case 'stressed': {
          const bigR = (baseRx * 1.25).toFixed(1);
          return `
            <g ${filterAttr}>
              <circle class="eye-left" cx="${lx}" cy="${ey}" r="${bigR}" fill="${c}" />
              <circle cx="${(lx + 2).toFixed(1)}" cy="${(ey - 2).toFixed(1)}" r="${(bigR * 0.28).toFixed(1)}" fill="#FFFFFF" />
              <circle class="eye-right" cx="${rx}" cy="${ey}" r="${bigR}" fill="${c}" />
              <circle cx="${(rx + 2).toFixed(1)}" cy="${(ey - 2).toFixed(1)}" r="${(bigR * 0.28).toFixed(1)}" fill="#FFFFFF" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${my} Q ${(cx - mWidth/4).toFixed(1)} ${(my - 4)}, ${cx} ${my} Q ${(cx + mWidth/4).toFixed(1)} ${(my + 4)}, ${(cx + mWidth/2).toFixed(1)} ${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Blue Sweat Drop SVG -->
              <path d="M ${(rx + 18)} ${(ey - 16)} C ${(rx + 18)} ${(ey - 16)}, ${(rx + 12)} ${(ey - 8)}, ${(rx + 12)} ${(ey - 4)} C ${(rx + 12)} ${(ey - 1)}, ${(rx + 15)} ${(ey + 1)}, ${(rx + 18)} ${(ey + 1)} C ${(rx + 21)} ${(ey + 1)}, ${(rx + 24)} ${(ey - 1)}, ${(rx + 24)} ${(ey - 4)} C ${(rx + 24)} ${(ey - 8)}, ${(rx + 18)} ${(ey - 16)}, ${(rx + 18)} ${(ey - 16)} Z" fill="#38BDF8" opacity="0.9" />
            </g>
          `;
        }

        // 19. CONFUSED (AI error or unknown request)
        case 'confused': {
          return `
            <g ${filterAttr}>
              <!-- Asymmetric Eyes (one wide, one squinted) -->
              <ellipse class="eye-left" cx="${lx}" cy="${(ey - 2)}" rx="${(baseRx * 1.25).toFixed(1)}" ry="${(baseRy * 1.25).toFixed(1)}" fill="${c}" />
              <line x1="${(rx - 7)}" y1="${ey}" x2="${(rx + 7)}" y2="${ey}" stroke="${c}" stroke-width="2.8" stroke-linecap="round" />
              <!-- Wavy Mouth -->
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my + 2)} Q ${(cx - mWidth/6).toFixed(1)} ${(my - 3)}, ${cx} ${(my + 1)} Q ${(cx + mWidth/4).toFixed(1)} ${(my + 5)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 2)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Question Mark -->
              <text x="${(rx + 14)}" y="${(ey - 16)}" font-family="'Outfit', sans-serif" font-size="16" font-weight="800" fill="${themeCol}">?</text>
            </g>
          `;
        }

        // 20. RELIEVED / RELAXED (Back to normal / break time / music stop)
        case 'relaxed':
        case 'relieved': {
          const arcW = (baseRx * 1.35).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 1)} Q ${lx} ${(ey - 7)}, ${(lx + +arcW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey + 1)} Q ${rx} ${(ey - 7)}, ${(rx + +arcW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 1)} Q ${cx} ${(my + 4)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 1)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
            </g>
          `;
        }

        // 21. SQUINT (Max brightness)
        case 'squint': {
          const slitW = (baseRx * 1.5).toFixed(1);
          return `
            <g ${filterAttr}>
              <line x1="${(lx - slitW/2).toFixed(1)}" y1="${ey}" x2="${(lx + slitW/2).toFixed(1)}" y2="${ey}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <line x1="${(rx - slitW/2).toFixed(1)}" y1="${ey}" x2="${(rx + slitW/2).toFixed(1)}" y2="${ey}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <path class="mouth" d="M ${(cx - mWidth/2.5).toFixed(1)} ${(my - 1)} Q ${cx} ${(my + 4)}, ${(cx + mWidth/2.5).toFixed(1)} ${(my - 1)}" stroke="${c}" stroke-width="2.0" stroke-linecap="round" fill="none" />
            </g>
          `;
        }

        // 22. YAWN (Item E1)
        case 'yawn': {
          const arcW = (baseRx * 1.35).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${ey} Q ${lx} ${(ey - 5)}, ${(lx + +arcW)} ${ey}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${ey} Q ${rx} ${(ey - 5)}, ${(rx + +arcW)} ${ey}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <!-- Yawn Tear Drop on eye -->
              <path d="M ${(lx - arcW - 4)} ${(ey + 3)} C ${(lx - arcW - 4)} ${(ey + 3)}, ${(lx - arcW - 6)} ${(ey + 7)}, ${(lx - arcW - 4)} ${(ey + 8)} A 2 2 0 0 0 ${(lx - arcW - 2)} ${(ey + 7)} Z" fill="#38BDF8" opacity="0.85" />
              <!-- Open Yawn Mouth -->
              <ellipse class="mouth" cx="${cx}" cy="${(my + 3)}" rx="${(mWidth * 0.35).toFixed(1)}" ry="${(mWidth * 0.55).toFixed(1)}" fill="${c}" />
            </g>
          `;
        }

        // 23. DIZZY (Item E1)
        case 'dizzy': {
          const xSize = (baseRx * 0.9).toFixed(1);
          return `
            <g ${filterAttr}>
              <!-- X eyes -->
              <line x1="${(lx - xSize)}" y1="${(ey - xSize)}" x2="${(lx + +xSize)}" y2="${(ey + +xSize)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <line x1="${(lx + +xSize)}" y1="${(ey - xSize)}" x2="${(lx - xSize)}" y2="${(ey + +xSize)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <line x1="${(rx - xSize)}" y1="${(ey - xSize)}" x2="${(rx + +xSize)}" y2="${(ey + +xSize)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <line x1="${(rx + +xSize)}" y1="${(ey - xSize)}" x2="${(rx - xSize)}" y2="${(ey + +xSize)}" stroke="${c}" stroke-width="${(2.6 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <!-- Wavy spiral mouth -->
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${my} Q ${(cx - mWidth/4).toFixed(1)} ${(my - 4)}, ${cx} ${my} Q ${(cx + mWidth/4).toFixed(1)} ${(my + 4)}, ${(cx + mWidth/2).toFixed(1)} ${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Dizzy spiral above head -->
              <path d="M ${(rx + 8)} ${(ey - 22)} A 4 4 0 0 1 ${(rx + 14)} ${(ey - 26)} A 6 6 0 0 1 ${(rx + 20)} ${(ey - 20)} A 8 8 0 0 1 ${(rx + 12)} ${(ey - 12)}" fill="none" stroke="${themeCol}" stroke-width="1.8" stroke-linecap="round" />
            </g>
          `;
        }

        // 24. BLUSH (Item E1)
        case 'blush': {
          const shyW = (baseRx * 1.1).toFixed(1);
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left" cx="${lx}" cy="${(ey + 1)}" rx="${shyW}" ry="${(baseRy * 0.85).toFixed(1)}" fill="${c}" />
              <circle cx="${(lx + 2).toFixed(1)}" cy="${(ey - 1).toFixed(1)}" r="${(shyW * 0.35).toFixed(1)}" fill="#FFFFFF" />
              <ellipse class="eye-right" cx="${rx}" cy="${(ey + 1)}" rx="${shyW}" ry="${(baseRy * 0.85).toFixed(1)}" fill="${c}" />
              <circle cx="${(rx + 2).toFixed(1)}" cy="${(ey - 1).toFixed(1)}" r="${(shyW * 0.35).toFixed(1)}" fill="#FFFFFF" />
              <path class="mouth" d="M ${(cx - mWidth/3).toFixed(1)} ${(my - 1)} Q ${cx} ${(my + 4)}, ${(cx + mWidth/3).toFixed(1)} ${(my - 1)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Vibrant Pink Blush with hatch marks -->
              <ellipse cx="${(lx - baseRx * 1.6).toFixed(1)}" cy="${(ey + 11)}" rx="${(7 * eyeScale).toFixed(1)}" ry="${(4 * eyeScale).toFixed(1)}" fill="#F43F5E" opacity="0.45" />
              <ellipse cx="${(rx + baseRx * 1.6).toFixed(1)}" cy="${(ey + 11)}" rx="${(7 * eyeScale).toFixed(1)}" ry="${(4 * eyeScale).toFixed(1)}" fill="#F43F5E" opacity="0.45" />
              <line x1="${(lx - baseRx * 2.2).toFixed(1)}" y1="${(ey + 14)}" x2="${(lx - baseRx * 1.4).toFixed(1)}" y2="${(ey + 8)}" stroke="#F43F5E" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
              <line x1="${(lx - baseRx * 1.6).toFixed(1)}" y1="${(ey + 14)}" x2="${(lx - baseRx * 0.8).toFixed(1)}" y2="${(ey + 8)}" stroke="#F43F5E" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
              <line x1="${(rx + baseRx * 0.8).toFixed(1)}" y1="${(ey + 14)}" x2="${(rx + baseRx * 1.6).toFixed(1)}" y2="${(ey + 8)}" stroke="#F43F5E" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
              <line x1="${(rx + baseRx * 1.4).toFixed(1)}" y1="${(ey + 14)}" x2="${(rx + baseRx * 2.2).toFixed(1)}" y2="${(ey + 8)}" stroke="#F43F5E" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
            </g>
          `;
        }

        // 25. EXCITED (Item E1)
        case 'excited': {
          return `
            <g ${filterAttr}>
              <!-- Sparkle Star Eyes -->
              <polygon points="${lx},${(ey - 9)} ${(lx + 3)},${(ey - 3)} ${(lx + 9)},${ey} ${(lx + 3)},${(ey + 3)} ${lx},${(ey + 9)} ${(lx - 3)},${(ey + 3)} ${(lx - 9)},${ey} ${(lx - 3)},${(ey - 3)}" fill="${themeCol}" filter="url(#${p}-accent-glow)" />
              <polygon points="${rx},${(ey - 9)} ${(rx + 3)},${(ey - 3)} ${(rx + 9)},${ey} ${(rx + 3)},${(ey + 3)} ${rx},${(ey + 9)} ${(rx - 3)},${(ey + 3)} ${(rx - 9)},${ey} ${(rx - 3)},${(ey - 3)}" fill="${themeCol}" filter="url(#${p}-accent-glow)" />
              <!-- Wide excited open smile -->
              <path class="mouth" d="M ${(cx - mWidth*0.65).toFixed(1)} ${(my - 3)} Q ${cx} ${(my + 12)}, ${(cx + mWidth*0.65).toFixed(1)} ${(my - 3)} Z" fill="${c}" />
              <!-- Sparkle Bursts -->
              <polygon points="${(rx + 18)},${(ey - 18)} ${(rx + 20)},${(ey - 16)} ${(rx + 22)},${(ey - 18)} ${(rx + 20)},${(ey - 20)}" fill="${themeCol}" opacity="0.9" />
              <polygon points="${(lx - 20)},${(ey - 14)} ${(lx - 18)},${(ey - 12)} ${(lx - 16)},${(ey - 14)} ${(lx - 18)},${(ey - 16)}" fill="${themeCol}" opacity="0.9" />
            </g>
          `;
        }

        // 26. SCARED (Item E1)
        case 'scared': {
          const bigR = (baseRx * 1.35).toFixed(1);
          return `
            <g ${filterAttr}>
              <circle cx="${lx}" cy="${ey}" r="${bigR}" fill="none" stroke="${c}" stroke-width="2" />
              <circle cx="${lx}" cy="${ey}" r="${(baseRx * 0.35).toFixed(1)}" fill="${c}" />
              <circle cx="${rx}" cy="${ey}" r="${bigR}" fill="none" stroke="${c}" stroke-width="2" />
              <circle cx="${rx}" cy="${ey}" r="${(baseRx * 0.35).toFixed(1)}" fill="${c}" />
              <!-- Chatter mouth -->
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${my} Q ${(cx - mWidth/4).toFixed(1)} ${(my - 3)}, ${cx} ${my} Q ${(cx + mWidth/4).toFixed(1)} ${(my + 3)}, ${(cx + mWidth/2).toFixed(1)} ${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Vertical purple stress lines on brow -->
              <line x1="${(cx - 8)}" y1="${(ey - 22)}" x2="${(cx - 8)}" y2="${(ey - 13)}" stroke="#818CF8" stroke-width="1.6" stroke-linecap="round" opacity="0.8" />
              <line x1="${cx}" y1="${(ey - 24)}" x2="${cx}" y2="${(ey - 13)}" stroke="#818CF8" stroke-width="1.6" stroke-linecap="round" opacity="0.8" />
              <line x1="${(cx + 8)}" y1="${(ey - 22)}" x2="${(cx + 8)}" y2="${(ey - 13)}" stroke="#818CF8" stroke-width="1.6" stroke-linecap="round" opacity="0.8" />
            </g>
          `;
        }

        // 27. ANNOYED (Item E1)
        case 'annoyed': {
          const slitW = (baseRx * 1.4).toFixed(1);
          return `
            <g ${filterAttr}>
              <line x1="${(lx - slitW)}" y1="${ey}" x2="${(lx + +slitW)}" y2="${ey}" stroke="${c}" stroke-width="${(3.2 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <line x1="${(rx - slitW)}" y1="${ey}" x2="${(rx + +slitW)}" y2="${ey}" stroke="${c}" stroke-width="${(3.2 * eyeScale).toFixed(1)}" stroke-linecap="round" />
              <line class="mouth" x1="${(cx - mWidth/2).toFixed(1)}" y1="${(my - 1)}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${(my + 3)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" />
              <!-- Annoyance cross mark -->
              <path d="M ${(rx + 12)} ${(ey - 20)} L ${(rx + 20)} ${(ey - 20)} M ${(rx + 16)} ${(ey - 24)} L ${(rx + 16)} ${(ey - 16)}" stroke="#EF4444" stroke-width="2" stroke-linecap="round" />
            </g>
          `;
        }

        // 28. BORED (Item E1)
        case 'bored': {
          const bW = (baseRx * 1.2).toFixed(1);
          return `
            <g ${filterAttr}>
              <!-- Droopy half-lids -->
              <path class="eye-left" d="M ${(lx - bW)} ${ey} L ${(lx + +bW)} ${ey} A ${bW} ${(bW * 0.9)} 0 0 1 ${(lx - bW)} ${ey} Z" fill="${c}" />
              <path class="eye-right" d="M ${(rx - bW)} ${ey} L ${(rx + +bW)} ${ey} A ${bW} ${(bW * 0.9)} 0 0 1 ${(rx - bW)} ${ey} Z" fill="${c}" />
              <line class="mouth" x1="${(cx - mWidth/3).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/3).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.0" stroke-linecap="round" />
            </g>
          `;
        }

        // 29. PROUD (Item E1)
        case 'proud':
        case 'celebrating': {
          const arcW = (baseRx * 1.35).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 1)} Q ${lx} ${(ey - 9)}, ${(lx + +arcW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey + 1)} Q ${rx} ${(ey - 9)}, ${(rx + +arcW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <!-- Smug smirk -->
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${my} Q ${cx} ${(my + 2)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 4)}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none" />
              <!-- Sparkle shine -->
              <polygon points="${(rx + 16)},${(ey - 6)} ${(rx + 18)},${(ey - 4)} ${(rx + 20)},${(ey - 6)} ${(rx + 18)},${(ey - 8)}" fill="${themeCol}" />
            </g>
          `;
        }

        // 30. WORRIED (Item E1)
        case 'worried': {
          return `
            <g ${filterAttr}>
              <!-- Upward tilted eyebrows -->
              <line x1="${(lx - 8)}" y1="${(ey - 6)}" x2="${(lx + 7)}" y2="${(ey - 11)}" stroke="${c}" stroke-width="2.0" stroke-linecap="round" opacity="0.85" />
              <line x1="${(rx - 7)}" y1="${(ey - 11)}" x2="${(rx + 8)}" y2="${(ey - 6)}" stroke="${c}" stroke-width="2.0" stroke-linecap="round" opacity="0.85" />
              <ellipse class="eye-left" cx="${lx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${(ey + 2)}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <!-- Quivering frown mouth -->
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my + 3)} Q ${cx} ${(my - 4)}, ${(cx + mWidth/2).toFixed(1)} ${(my + 3)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
            </g>
          `;
        }

        // 31. GRATEFUL (Item E1)
        case 'grateful': {
          const arcW = (baseRx * 1.35).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${ey} Q ${lx} ${(ey - 8)}, ${(lx + +arcW)} ${ey}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${ey} Q ${rx} ${(ey - 8)}, ${(rx + +arcW)} ${ey}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 2)} Q ${cx} ${(my + 6)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 2)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Pink blush -->
              <ellipse cx="${(lx - baseRx * 1.5).toFixed(1)}" cy="${(ey + 10)}" rx="${(6 * eyeScale).toFixed(1)}" ry="${(3.5 * eyeScale).toFixed(1)}" fill="#F43F5E" opacity="0.4" />
              <ellipse cx="${(rx + baseRx * 1.5).toFixed(1)}" cy="${(ey + 10)}" rx="${(6 * eyeScale).toFixed(1)}" ry="${(3.5 * eyeScale).toFixed(1)}" fill="#F43F5E" opacity="0.4" />
              <!-- Floating small heart -->
              <path d="M ${(rx + 16)} ${(ey - 18)} C ${(rx + 16)} ${(ey - 18)}, ${(rx + 12)} ${(ey - 23)}, ${(rx + 12)} ${(ey - 26)} A 3 3 0 0 1 ${(rx + 16)} ${(ey - 29)} A 3 3 0 0 1 ${(rx + 20)} ${(ey - 26)} C ${(rx + 20)} ${(ey - 23)}, ${(rx + 16)} ${(ey - 18)}, ${(rx + 16)} ${(ey - 18)} Z" fill="#F43F5E" opacity="0.85" />
            </g>
          `;
        }

        // 32. GOODBYE (Item E1 & Item B1)
        case 'goodbye': {
          const arcW = (baseRx * 1.35).toFixed(1);
          return `
            <g ${filterAttr}>
              <path class="eye-left" d="M ${(lx - arcW)} ${(ey + 1)} Q ${lx} ${(ey - 9)}, ${(lx + +arcW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="eye-right" d="M ${(rx - arcW)} ${(ey + 1)} Q ${rx} ${(ey - 9)}, ${(rx + +arcW)} ${(ey + 1)}" stroke="${c}" stroke-width="${(2.8 * eyeScale).toFixed(1)}" stroke-linecap="round" fill="none" />
              <path class="mouth" d="M ${(cx - mWidth/2).toFixed(1)} ${(my - 2)} Q ${cx} ${(my + 6)}, ${(cx + mWidth/2).toFixed(1)} ${(my - 2)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none" />
              <!-- Cute waving little robot hand -->
              <g class="waving-hand" transform="translate(${(rx + 18)}, ${(ey - 6)})">
                <path d="M 0 6 C 0 6, 6 2, 8 -4 C 9 -7, 6 -9, 4 -7 C 2 -5, 0 0, 0 0" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none" />
                <path d="M 5 -3 C 5 -3, 8 -7, 10 -6 C 11 -5, 10 -3, 8 -1" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none" />
                <path d="M 6 -1 C 6 -1, 10 -3, 11 -2 C 12 -1, 11 1, 9 2" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none" />
              </g>
            </g>
          `;
        }

        default:
          return `
            <g ${filterAttr}>
              <ellipse class="eye-left" cx="${lx}" cy="${ey}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <ellipse class="eye-right" cx="${rx}" cy="${ey}" rx="${baseRx}" ry="${baseRy}" fill="${c}" />
              <line class="mouth" x1="${(cx - mWidth/2).toFixed(1)}" y1="${my}" x2="${(cx + mWidth/2).toFixed(1)}" y2="${my}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" />
            </g>
          `;
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PetRenderer;
  }
  global.PetRenderer = PetRenderer;
})(typeof window !== 'undefined' ? window : global);
