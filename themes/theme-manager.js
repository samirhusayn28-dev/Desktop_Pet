/**
 * Desktop Pet — Unified Accent Color Engine
 * Uses a single accent color (--accent) with color-mix() variants.
 * Removed per-provider auto-theming as requested.
 */

const DEFAULT_ACCENT = '#FF7A2F';

class ThemeManager {
  static getDefaultAccent() {
    return DEFAULT_ACCENT;
  }

  static getContrastColor(hex) {
    try {
      let clean = (hex || DEFAULT_ACCENT).replace('#', '');
      if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
      const r = parseInt(clean.substring(0, 2), 16) / 255;
      const g = parseInt(clean.substring(2, 4), 16) / 255;
      const b = parseInt(clean.substring(4, 6), 16) / 255;
      const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      const lum = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      return lum > 0.45 ? '#111113' : '#FFFFFF';
    } catch (e) {
      return '#FFFFFF';
    }
  }

  static applyAccentColor(doc, hex = DEFAULT_ACCENT) {
    const root = (doc && doc.documentElement) || document.documentElement;
    const cleanHex = hex || DEFAULT_ACCENT;

    root.style.setProperty('--accent', cleanHex);
    const onAccent = this.getContrastColor(cleanHex);
    root.style.setProperty('--theme-on-accent', onAccent);
    root.style.setProperty('--accent-contrast', onAccent);

    root.style.setProperty('--accent-glow', `color-mix(in srgb, ${cleanHex} 75%, transparent)`);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${cleanHex} 16%, transparent)`);
    root.style.setProperty('--accent-strong', `color-mix(in srgb, ${cleanHex} 32%, transparent)`);
    root.style.setProperty('--accent-light', `color-mix(in srgb, ${cleanHex} 70%, white)`);
    root.style.setProperty('--accent-border', `color-mix(in srgb, ${cleanHex} 32%, transparent)`);
    root.style.setProperty('--accent-focus', `color-mix(in srgb, ${cleanHex} 40%, transparent)`);
    root.style.setProperty('--accent-scrollbar', `color-mix(in srgb, ${cleanHex} 45%, transparent)`);
    root.style.setProperty('--accent-scrollbar-hover', `color-mix(in srgb, ${cleanHex} 80%, transparent)`);
    root.style.setProperty('--accent-card-tint', `color-mix(in srgb, ${cleanHex} 7%, #1B1B22)`);

    // Backwards-compatible mappings to cover every existing selector
    root.style.setProperty('--theme-primary', cleanHex);
    root.style.setProperty('--theme-glow', `color-mix(in srgb, ${cleanHex} 75%, transparent)`);
    root.style.setProperty('--theme-primary-alpha', `color-mix(in srgb, ${cleanHex} 16%, transparent)`);
    root.style.setProperty('--theme-primary-alpha-strong', `color-mix(in srgb, ${cleanHex} 32%, transparent)`);
    root.style.setProperty('--theme-accent-light', `color-mix(in srgb, ${cleanHex} 70%, white)`);
    root.style.setProperty('--theme-card-border', `color-mix(in srgb, ${cleanHex} 32%, transparent)`);
  }

  // Legacy compatibility stub
  static applyThemeToDocument(doc, themeId) {
    // Retain single accent color regardless of themeId
    const store = (typeof window !== 'undefined' && window.panelController && window.panelController.store)
      ? window.panelController.store
      : null;
    const savedAccent = store ? store.get('settings.appearance.accentColor') : DEFAULT_ACCENT;
    this.applyAccentColor(doc, savedAccent || DEFAULT_ACCENT);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, DEFAULT_ACCENT };
}
if (typeof window !== 'undefined') {
  window.ThemeManager = ThemeManager;
  window.DEFAULT_ACCENT = DEFAULT_ACCENT;
}
