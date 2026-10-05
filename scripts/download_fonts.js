const https = require('https');
const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// Clean old files if any
fs.readdirSync(fontsDir).forEach(f => {
  if (f.endsWith('.woff2')) {
    fs.unlinkSync(path.join(fontsDir, f));
  }
});

const fontDefinitions = [
  {
    family: 'Nunito',
    weight: 400,
    style: 'normal',
    filename: 'nunito-400.woff2',
    url: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshdTQ3jw.woff2'
  },
  {
    family: 'Nunito',
    weight: 600,
    style: 'normal',
    filename: 'nunito-600.woff2',
    url: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDGUmdTQ3jw.woff2'
  },
  {
    family: 'Nunito',
    weight: 700,
    style: 'normal',
    filename: 'nunito-700.woff2',
    url: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmdTQ3jw.woff2'
  },
  {
    family: 'Fredoka',
    weight: 500,
    style: 'normal',
    filename: 'fredoka-500.woff2',
    url: 'https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OwyL8EemK.woff2'
  },
  {
    family: 'Fredoka',
    weight: 600,
    style: 'normal',
    filename: 'fredoka-600.woff2',
    url: 'https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OLyX8EemK.woff2'
  },
  {
    family: 'JetBrains Mono',
    weight: 400,
    style: 'normal',
    filename: 'jetbrainsmono-400.woff2',
    url: 'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTOlOV.woff2'
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  console.log('Downloading fonts...');
  let totalBytes = 0;

  for (const font of fontDefinitions) {
    const dest = path.join(fontsDir, font.filename);
    console.log(`Downloading ${font.family} ${font.weight} -> ${font.filename}`);
    await download(font.url, dest);
    const stat = fs.statSync(dest);
    totalBytes += stat.size;
  }

  console.log(`Downloaded ${fontDefinitions.length} font files. Total size: ${(totalBytes / 1024).toFixed(1)} KB`);

  // Write fonts.css for panel & general use
  let css = `/* Bundled offline fonts: Nunito, Fredoka, JetBrains Mono */\n/* SIL Open Font License (OFL-1.1) */\n\n`;
  for (const font of fontDefinitions) {
    css += `@font-face {\n`;
    css += `  font-family: '${font.family}';\n`;
    css += `  font-style: ${font.style};\n`;
    css += `  font-weight: ${font.weight};\n`;
    css += `  font-display: block;\n`;
    css += `  src: url('${font.filename}') format('woff2');\n`;
    css += `}\n\n`;
  }

  fs.writeFileSync(path.join(fontsDir, 'fonts.css'), css, 'utf8');
  console.log('Generated assets/fonts/fonts.css');

  // Also write bubble-fonts.css (ONLY Nunito 600 for pet bubble)
  let bubbleCss = `/* Pet Window offline font: Nunito 600 only */\n\n`;
  bubbleCss += `@font-face {\n`;
  bubbleCss += `  font-family: 'Nunito';\n`;
  bubbleCss += `  font-style: normal;\n`;
  bubbleCss += `  font-weight: 600;\n`;
  bubbleCss += `  font-display: block;\n`;
  bubbleCss += `  src: url('nunito-600.woff2') format('woff2');\n`;
  bubbleCss += `}\n`;
  fs.writeFileSync(path.join(fontsDir, 'bubble-fonts.css'), bubbleCss, 'utf8');
  console.log('Generated assets/fonts/bubble-fonts.css');

  // OFL License file
  const ofl = `SIL OPEN FONT LICENSE (OFL-1.1)

The fonts bundled in Desktop Pet (Nunito, Fredoka, JetBrains Mono) are licensed under the SIL Open Font License, Version 1.1.
- Nunito: Copyright (c) 2014, Vernon Adams (https://github.com/googlefonts/nunito)
- Fredoka: Copyright (c) 2021, The Fredoka Project Authors (https://github.com/hafonts/FredokaOne)
- JetBrains Mono: Copyright (c) 2020, JetBrains (https://github.com/JetBrains/JetBrainsMono)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at: http://scripts.sil.org/OFL
`;
  fs.writeFileSync(path.join(fontsDir, 'OFL.txt'), ofl, 'utf8');
  console.log('Generated assets/fonts/OFL.txt');
}

main().catch(console.error);
