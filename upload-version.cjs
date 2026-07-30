const qiniu = require('qiniu');
const fs = require('fs');
const path = require('path');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'qiniu-credentials.json'), 'utf-8'));
const mac = new qiniu.auth.digest.Mac(creds.ak, creds.sk);
const config = new qiniu.conf.Config();
const formUploader = new qiniu.form_up.FormUploader(config);
const putExtra = new qiniu.form_up.PutExtra();
const cdnManager = new qiniu.cdn.CdnManager(mac);

function uploadToken(key) {
  const putPolicy = new qiniu.rs.PutPolicy({ scope: `${creds.bucket}:${key}` });
  return putPolicy.uploadToken(mac);
}

function refreshCdn(urls) {
  return new Promise((resolve) => {
    cdnManager.refreshUrls(urls, (err, body, info) => {
      if (err) { console.warn('  CDN refresh:', err.message || err); return resolve(); }
      console.log('  CDN refreshed:', urls.join(', '));
      resolve();
    });
  });
}

function upload(localPath, key) {
  return new Promise((resolve, reject) => {
    console.log(`Uploading ${localPath} → ${creds.domain}/${key} ...`);
    formUploader.putFile(uploadToken(key), key, localPath, putExtra, (err, body, info) => {
      if (err) return reject(err);
      if (info.statusCode === 200) {
        console.log(`  Done: ${creds.domain}/${key}`);
        resolve();
      } else {
        reject(new Error(`HTTP ${info.statusCode}: ${JSON.stringify(body)}`));
      }
    });
  });
}

async function main() {
  const files = [
    { local: path.join(__dirname, 'public', 'version.json'), key: 'version.json' },
    { local: path.join(__dirname, 'public', 'tab.ogg'), key: 'tab.ogg' },
    { local: path.join(__dirname, 'public', '14.png'), key: '14.png' },
    { local: path.join(__dirname, 'public', '审判曲？.mp3'), key: 'calibration.mp3' },
  ];

  for (const f of files) {
    if (!fs.existsSync(f.local)) {
      console.log(`  SKIP (not found): ${f.local}`);
      continue;
    }
    await upload(f.local, f.key);
  }

  const urls = files.filter(f => fs.existsSync(f.local)).map(f => `${creds.domain}/${f.key}`);
  if (urls.length > 0) await refreshCdn(urls);

  console.log('All done.');
}

main().catch(err => { console.error(err); process.exit(1); });
