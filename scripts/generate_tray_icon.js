const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 200,
    height: 200,
    show: false,
    webPreferences: { offscreen: true }
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:transparent;">
        <canvas id="c" width="44" height="44"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');

          // Dark Squircle Icon for macOS menu bar
          ctx.beginPath();
          ctx.roundRect(4, 4, 36, 36, 12);
          ctx.fillStyle = '#14151C';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#FF7A2F';
          ctx.stroke();

          // Two white dot eyes
          ctx.beginPath();
          ctx.arc(15, 19, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(29, 19, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Cute smile
          ctx.beginPath();
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#FF7A2F';
          ctx.arc(22, 24, 5, 0.2, Math.PI - 0.2);
          ctx.stroke();
        </script>
      </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(r => setTimeout(r, 400));

  const dataUrl = await win.webContents.executeJavaScript(`
    document.getElementById('c').toDataURL('image/png')
  `);

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(assetsDir, 'tray-icon@2x.png'), Buffer.from(base64Data, 'base64'));

  // Also create 22x22 version
  const img = nativeImage.createFromDataURL(dataUrl);
  const resized = img.resize({ width: 22, height: 22 });
  fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), resized.toPNG());

  console.log('Tray icons generated successfully in assets/!');
  app.quit();
});
