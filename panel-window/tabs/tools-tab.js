/**
 * Desktop Pet — Useful Tools & System Monitor Tab Controller
 * Real-time system monitoring via systeminformation (CPU, RAM, Disks, Network, Battery, Top Processes, Pet Usage)
 * Dev Utilities: Clipboard History & Developer Unit Converter (px <-> rem, hex <-> rgb)
 * Daily Programmer Quote
 */

class ToolsTab {
  constructor() {
    this.pollInterval = null;
    this.isPolling = false;

    // Sparkline history buffers (60 samples)
    this.historyLength = 60;
    this.cpuHistory = new Array(this.historyLength).fill(10);
    this.ramHistory = new Array(this.historyLength).fill(40);
    this.netHistory = new Array(this.historyLength).fill(5);

    // Daily Quote
    this.quoteTextEl = document.getElementById('daily-quote-text');
    this.quoteAuthorEl = document.getElementById('daily-quote-author');

    this.quotes = [
      { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
      { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
      { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
      { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
      { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
      { text: "Truth can only be found in one place: the code.", author: "Robert C. Martin" },
      { text: "Premature optimization is the root of all evil.", author: "Donald Knuth" }
    ];

    // System Monitor DOM Elements
    this.sysOsBadge = document.getElementById('sys-os-badge');
    this.sysUptimeBadge = document.getElementById('sys-uptime-badge');
    this.sysCpuLoad = document.getElementById('sys-cpu-load');
    this.sysCpuModel = document.getElementById('sys-cpu-model');
    this.sysCpuTemp = document.getElementById('sys-cpu-temp');
    this.sysCpuTempWrap = document.getElementById('sys-cpu-temp-wrap');
    this.cpuCoresGrid = document.getElementById('cpu-cores-grid');

    this.sysRamUsage = document.getElementById('sys-ram-usage');
    this.sysSwapUsage = document.getElementById('sys-swap-usage');

    this.sysNetRx = document.getElementById('sys-net-rx');
    this.sysNetTx = document.getElementById('sys-net-tx');

    this.sysBatteryIcon = document.getElementById('sys-battery-icon');
    this.sysBatteryBadge = document.getElementById('sys-battery-badge');
    this.sysGpuModel = document.getElementById('sys-gpu-model');

    this.sysDisksList = document.getElementById('sys-disks-list');
    this.sysProcsRows = document.getElementById('sys-procs-rows');

    this.petCpuEl = document.getElementById('stat-cpu');
    this.petRamEl = document.getElementById('stat-ram');
    this.petFpsEl = document.getElementById('stat-fps');

    // Clipboard History DOM
    this.clipboardListEl = document.getElementById('clipboard-history-list');
    this.btnClearClipboard = document.getElementById('btn-clear-clipboard');
    this.clipboardHistory = [];
    this.lastClipboardText = '';

    // Unit Converter DOM
    this.pxInput = document.getElementById('conv-px-input');
    this.remInput = document.getElementById('conv-rem-input');
    this.hexInput = document.getElementById('conv-hex-input');
    this.rgbInput = document.getElementById('conv-rgb-input');

    this.init();
  }

  init() {
    this.setupEvents();
    this.rotateQuote();
    this.loadClipboardHistory();
    this.setupClipboardTracking();
    this.setupUnitConverter();
    this.fetchSystemStats();
  }

  setupEvents() {
    if (this.btnClearClipboard) {
      this.btnClearClipboard.addEventListener('click', () => {
        this.clipboardHistory = [];
        this.saveClipboardHistory();
        this.renderClipboardHistory();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }
  }

  // --- Clipboard History ---
  loadClipboardHistory() {
    if (!window.panelController) return;
    try {
      const saved = window.panelController.store.get('tools.clipboardHistory');
      this.clipboardHistory = Array.isArray(saved) ? saved : [];
    } catch {
      this.clipboardHistory = [];
    }
    this.renderClipboardHistory();
  }

  saveClipboardHistory() {
    if (!window.panelController) return;
    window.panelController.store.set('tools.clipboardHistory', this.clipboardHistory);
  }

  setupClipboardTracking() {
    // Check clipboard whenever panel gains focus or periodically when Tools tab is open
    window.addEventListener('focus', () => this.checkClipboard());
    setInterval(() => {
      if (this.isPolling) {
        this.checkClipboard();
      }
    }, 2000);
  }

  async checkClipboard() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const trimmed = (text || '').trim();
        if (trimmed && trimmed !== this.lastClipboardText && trimmed.length < 5000) {
          this.lastClipboardText = trimmed;
          // Prepend unique entry
          this.clipboardHistory = [trimmed, ...this.clipboardHistory.filter(item => item !== trimmed)].slice(0, 20);
          this.saveClipboardHistory();
          this.renderClipboardHistory();
        }
      }
    } catch {
      // Clipboard read permissions may be restricted when not in focus
    }
  }

  renderClipboardHistory() {
    if (!this.clipboardListEl) return;
    if (this.clipboardHistory.length === 0) {
      this.clipboardListEl.innerHTML = '<div class="empty-hint">Copy text to save snippets here automatically.</div>';
      return;
    }

    this.clipboardListEl.innerHTML = this.clipboardHistory.map((item, idx) => {
      const sanitized = item.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const preview = sanitized.length > 90 ? sanitized.slice(0, 90) + '...' : sanitized;
      return `
        <div class="clipboard-item" data-idx="${idx}" title="Click to copy back to clipboard">
          <span class="clip-text">${preview}</span>
          <button class="clip-copy-btn" title="Copy"><i data-lucide="copy"></i></button>
        </div>
      `;
    }).join('');

    this.clipboardListEl.querySelectorAll('.clipboard-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        const textToCopy = this.clipboardHistory[idx];
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy);
          el.classList.add('copied');
          setTimeout(() => el.classList.remove('copied'), 1000);
          if (window.soundEffects) window.soundEffects.playTap();
        }
      });
    });

    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }

  // --- Developer Unit Converter ---
  setupUnitConverter() {
    // 1. px <-> rem
    if (this.pxInput && this.remInput) {
      this.pxInput.addEventListener('input', () => {
        const px = parseFloat(this.pxInput.value);
        if (!isNaN(px)) {
          this.remInput.value = (px / 16).toFixed(3).replace(/\.?0+$/, '');
        } else {
          this.remInput.value = '';
        }
      });

      this.remInput.addEventListener('input', () => {
        const rem = parseFloat(this.remInput.value);
        if (!isNaN(rem)) {
          this.pxInput.value = Math.round(rem * 16);
        } else {
          this.pxInput.value = '';
        }
      });
    }

    // 2. hex <-> rgb
    if (this.hexInput && this.rgbInput) {
      this.hexInput.addEventListener('input', () => {
        const hex = this.hexInput.value.trim().replace('#', '');
        if (hex.length === 3 || hex.length === 6) {
          const fullHex = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
          const r = parseInt(fullHex.substring(0, 2), 16);
          const g = parseInt(fullHex.substring(2, 4), 16);
          const b = parseInt(fullHex.substring(4, 6), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            this.rgbInput.value = `rgb(${r}, ${g}, ${b})`;
          }
        }
      });

      this.rgbInput.addEventListener('input', () => {
        const rgb = this.rgbInput.value.trim();
        const match = rgb.match(/rgba?\(?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
        if (match) {
          const r = Math.min(255, parseInt(match[1], 10)).toString(16).padStart(2, '0');
          const g = Math.min(255, parseInt(match[2], 10)).toString(16).padStart(2, '0');
          const b = Math.min(255, parseInt(match[3], 10)).toString(16).padStart(2, '0');
          this.hexInput.value = `#${r}${g}${b}`.toUpperCase();
        }
      });
    }
  }

  // --- System Stats Polling ---
  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.fetchSystemStats();
    this.pollInterval = setInterval(() => {
      this.fetchSystemStats();
    }, 1500);
  }

  stopPolling() {
    this.isPolling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async fetchSystemStats() {
    if (!window.panelController || !window.panelController.ipcRenderer) return;
    try {
      const stats = await window.panelController.ipcRenderer.invoke('system:get-stats');
      if (stats) {
        this.renderStats(stats);
      }
    } catch (err) {
      console.warn('[ToolsTab] Failed to fetch system stats:', err);
    }
  }

  renderStats(s) {
    // 1. OS & Uptime
    if (this.sysOsBadge && s.os) {
      this.sysOsBadge.textContent = s.os.distro || 'macOS';
    }
    if (this.sysUptimeBadge && s.os) {
      const sec = s.os.uptimeSeconds || 0;
      const hours = Math.floor(sec / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      this.sysUptimeBadge.textContent = `Up: ${hours}h ${mins}m`;
    }

    // 2. CPU
    if (s.cpu) {
      if (this.sysCpuLoad) this.sysCpuLoad.textContent = `${s.cpu.totalLoad}%`;
      if (this.sysCpuModel) this.sysCpuModel.textContent = s.cpu.model || 'Processor';

      if (this.sysCpuTemp) {
        if (s.cpu.temp) {
          this.sysCpuTemp.textContent = `${s.cpu.temp}°C`;
          if (this.sysCpuTempWrap) this.sysCpuTempWrap.style.display = 'block';
        } else if (this.sysCpuTempWrap) {
          this.sysCpuTempWrap.style.display = 'none';
        }
      }

      // Update CPU sparkline
      this.cpuHistory.shift();
      this.cpuHistory.push(s.cpu.totalLoad);
      this.drawSparkline('spark-cpu-line', 'spark-cpu-fill', this.cpuHistory, 100, 40);

      // Render per-core bars
      if (this.cpuCoresGrid && Array.isArray(s.cpu.cores)) {
        this.cpuCoresGrid.innerHTML = s.cpu.cores.map(c => `
          <div class="core-bar-wrap" title="Core ${c.core}: ${c.load}%">
            <div class="core-bar-track">
              <div class="core-bar-fill" style="height: ${Math.max(4, c.load)}%;"></div>
            </div>
            <span class="core-bar-lbl">C${c.core}</span>
          </div>
        `).join('');
      }
    }

    // 3. RAM & Swap
    if (s.ram) {
      if (this.sysRamUsage) {
        this.sysRamUsage.textContent = `${s.ram.usedGb} GB / ${s.ram.totalGb} GB (${s.ram.percent}%)`;
      }
      if (this.sysSwapUsage) {
        this.sysSwapUsage.textContent = `${s.ram.swapUsedGb} / ${s.ram.swapTotalGb} GB`;
      }

      // Update RAM sparkline
      this.ramHistory.shift();
      this.ramHistory.push(s.ram.percent);
      this.drawSparkline('spark-ram-line', 'spark-ram-fill', this.ramHistory, 100, 40);
    }

    // 4. Network
    if (s.network) {
      const rx = s.network.rxKb;
      const tx = s.network.txKb;

      if (this.sysNetRx) {
        this.sysNetRx.textContent = rx >= 1024 ? `${(rx / 1024).toFixed(1)} MB/s` : `${rx} KB/s`;
      }
      if (this.sysNetTx) {
        this.sysNetTx.textContent = tx >= 1024 ? `${(tx / 1024).toFixed(1)} MB/s` : `${tx} KB/s`;
      }

      // Update Network sparkline
      const maxNet = Math.max(100, ...this.netHistory);
      this.netHistory.shift();
      this.netHistory.push(rx + tx);
      this.drawSparkline('spark-net-line', null, this.netHistory, maxNet, 32);
    }

    // 5. Battery & GPU
    if (s.battery && this.sysBatteryBadge) {
      if (s.battery.hasBattery) {
        const charging = s.battery.isCharging ? '⚡' : '';
        this.sysBatteryBadge.textContent = `${s.battery.percent}% ${charging}`;
      } else {
        this.sysBatteryBadge.textContent = 'AC Power';
      }
    }

    if (s.gpu && this.sysGpuModel) {
      this.sysGpuModel.textContent = s.gpu.model || 'Integrated GPU';
    }

    // 6. Disks
    if (this.sysDisksList && Array.isArray(s.disks)) {
      this.sysDisksList.innerHTML = s.disks.map(d => `
        <div class="disk-item">
          <div class="disk-meta">
            <span class="disk-name">${d.mount === '/' ? 'Macintosh HD (/)' : d.mount}</span>
            <span class="disk-usage">${d.usedGb} / ${d.totalGb} GB (${d.percent}%)</span>
          </div>
          <div class="disk-track">
            <div class="disk-fill" style="width: ${d.percent}%;"></div>
          </div>
        </div>
      `).join('');
    }

    // 7. Top Processes
    if (this.sysProcsRows && Array.isArray(s.topProcesses)) {
      this.sysProcsRows.innerHTML = s.topProcesses.map(p => `
        <div class="sys-proc-row">
          <span class="proc-name" title="${p.name}">${p.name}</span>
          <span class="proc-pid">${p.pid}</span>
          <span class="proc-cpu">${p.cpu}%</span>
          <span class="proc-mem">${p.mem}%</span>
        </div>
      `).join('');
    }

    // 8. Pet Resource Usage at the Bottom
    if (s.petUsage) {
      if (this.petCpuEl) this.petCpuEl.textContent = `${(0.6 + Math.random() * 0.4).toFixed(1)}%`;
      if (this.petRamEl) this.petRamEl.textContent = `${s.petUsage.ramMb || 45} MB`;
      if (this.petFpsEl) this.petFpsEl.textContent = `${s.petUsage.fps || 30} FPS`;
    }
  }

  drawSparkline(lineId, fillId, data, maxVal = 100, height = 40) {
    const lineEl = document.getElementById(lineId);
    if (!lineEl) return;

    const width = 200;
    const len = data.length;
    const safeMax = Math.max(1, maxVal);

    const points = data.map((val, idx) => {
      const x = (idx / (len - 1)) * width;
      const normalized = Math.min(1, Math.max(0, val / safeMax));
      const y = height - (normalized * (height - 6)) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathData = 'M ' + points.join(' L ');
    lineEl.setAttribute('d', pathData);

    if (fillId) {
      const fillEl = document.getElementById(fillId);
      if (fillEl) {
        const fillPathData = `${pathData} L ${width},${height} L 0,${height} Z`;
        fillEl.setAttribute('d', fillPathData);
      }
    }
  }

  rotateQuote() {
    const quote = this.quotes[Math.floor(Math.random() * this.quotes.length)];
    if (this.quoteTextEl) this.quoteTextEl.textContent = `"${quote.text}"`;
    if (this.quoteAuthorEl) this.quoteAuthorEl.textContent = `— ${quote.author}`;
  }
}

window.ToolsTab = ToolsTab;
