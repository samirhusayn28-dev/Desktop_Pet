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

  static applyAccentColor(doc, hex = DEFAULT_ACCENT) {
    const root = (doc && doc.documentElement) || document.documentElement;
    const cleanHex = hex || DEFAULT_ACCENT;

    root.style.setProperty('--accent', cleanHex);
    root.style.setProperty('--accent-glow', `color-mix(in srgb, ${cleanHex} 75%, transparent)`);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${cleanHex} 16%, transparent)`);
    root.style.setProperty('--accent-strong', `color-mix(in srgb, ${cleanHex} 32%, transparent)`);
    root.style.setProperty('--accent-light', `color-mix(in srgb, ${cleanHex} 70%, white)`);
    root.style.setProperty('--accent-border', `color-mix(in srgb, ${cleanHex} 32%, transparent)`);

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
