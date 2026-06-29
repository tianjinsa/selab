const fs = require('fs');
const https = require('https');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const fontDir = path.join(rootDir, 'static', 'fonts');
const fontVersions = {
  '0.3.1': {
    path: path.join(fontDir, 't-0.3.1.woff'),
    url: 'https://tdesign.gtimg.com/icon/0.3.1/fonts/t.woff',
  },
  '0.4.0': {
    path: path.join(fontDir, 't-0.4.0.woff'),
    url: 'https://tdesign.gtimg.com/icon/0.4.0/fonts/t.woff',
  },
};

const targets = [
  {
    path: path.join(rootDir, 'miniprogram_npm', 'tdesign-miniprogram', 'icon', 'icon.wxss'),
    fallbackVersion: '0.3.1',
  },
  {
    path: path.join(rootDir, 'node_modules', 'tdesign-miniprogram', 'miniprogram_dist', 'icon', 'icon.wxss'),
    fallbackVersion: '0.4.0',
  },
];

const buttonTargets = [
  {
    propsPath: path.join(rootDir, 'miniprogram_npm', 'tdesign-miniprogram', 'button', 'props.js'),
    wxmlPath: path.join(rootDir, 'miniprogram_npm', 'tdesign-miniprogram', 'button', 'button.wxml'),
  },
  {
    propsPath: path.join(rootDir, 'node_modules', 'tdesign-miniprogram', 'miniprogram_dist', 'button', 'props.js'),
    wxmlPath: path.join(rootDir, 'node_modules', 'tdesign-miniprogram', 'miniprogram_dist', 'button', 'button.wxml'),
  },
];

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Failed to download font: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (error) => {
        file.close();
        reject(error);
      });
  });
}

async function ensureFont() {
  fs.mkdirSync(fontDir, { recursive: true });
  await Promise.all(
    Object.values(fontVersions).map((font) => {
      if (fs.existsSync(font.path) && fs.statSync(font.path).size > 0) return Promise.resolve();
      return download(font.url, font.path);
    }),
  );
}

function detectVersion(content, fallbackVersion) {
  const match = content.match(/icon\/([0-9.]+)\/fonts\/t\.woff/);
  return match && fontVersions[match[1]] ? match[1] : fallbackVersion;
}

function patchWxss(target) {
  if (!fs.existsSync(target.path)) return false;
  const content = fs.readFileSync(target.path, 'utf8');
  const version = detectVersion(content, target.fallbackVersion);
  const fontBase64 = fs.readFileSync(fontVersions[version].path).toString('base64');
  const localFontFace = `@font-face{font-family:t;src:url(data:font/woff;base64,${fontBase64}) format('woff');font-weight:400;font-style:normal;}`;
  const next = content.replace(/@font-face\s*\{[\s\S]*?\}/, localFontFace);
  if (next === content) return false;
  fs.writeFileSync(target.path, next, 'utf8');
  return true;
}

function replaceFile(filePath, replacer) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  const next = replacer(content);
  if (next === content) return false;
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

function patchButtonProps(filePath) {
  return replaceFile(filePath, (content) =>
    content
      .replace(/loadingProps:\s*\{\s*type:\s*Object,\s*\}/, 'loadingProps: { type: Object, value: {} }')
      .replace(/loadingProps:\{type:Object\}/, 'loadingProps:{type:Object,value:{}}')
      .replace(/style:\{type:String\}/, 'style:{type:String,value:""}'));
}

function patchButtonWxml(filePath) {
  return replaceFile(filePath, (content) =>
    content.replace(
      /style="\{\{_\._style\(\[style,\s*customStyle\]\)\}\}"/g,
      'style="{{_._style([style, customStyle]) || \'\'}}"',
    ));
}

ensureFont()
  .then(() => {
    const patchedFonts = targets.filter(patchWxss);
    const patchedButtons = buttonTargets.reduce(
      (count, target) => count + Number(patchButtonProps(target.propsPath)) + Number(patchButtonWxml(target.wxmlPath)),
      0,
    );
    console.warn(`TDesign patched: ${patchedFonts.length} font file(s), ${patchedButtons} button file(s).`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
