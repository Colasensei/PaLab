/**
 * 七牛云对象存储上传脚本
 * 用法：node scripts/upload-qiniu.mjs <version>
 * 上传：version.json、Palab.apk、Palab-Setup-<version>.exe、14.png、tab.ogg
 */

import qiniu from 'qiniu';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== 配置 =====
const AK = 'vu34Tsc1OqHgrp9_v3Si7YiUl2khxzjdf5V1FY_6';
const SK = 'URkbIRAAEbgFS-FJR4CZ0sD8i2U8LuV0UC-tfpgR';
const BUCKET = 'palab-update';
const DOMAIN = 'http://tif6vakvn.hn-bkt.clouddn.com';

// ===== 上传 =====
const mac = new qiniu.auth.digest.Mac(AK, SK);
const config = new qiniu.conf.Config();
const formUploader = new qiniu.form_up.FormUploader(config);
const putExtra = new qiniu.form_up.PutExtra();

function uploadFile(key, localPath) {
  const putPolicy = new qiniu.rs.PutPolicy({ scope: BUCKET + ':' + key, expires: 7200 });
  const uploadToken = putPolicy.uploadToken(mac);
  return new Promise((resolve, reject) => {
    formUploader.putFile(uploadToken, key, localPath, putExtra, (err, body, info) => {
      if (err) { reject(err); return; }
      if (info.statusCode === 200) {
        console.log(`  ✅ ${key} 上传成功`);
        resolve(body);
      } else {
        console.log(`  ❌ ${key} 上传失败 (${info.statusCode}):`, body);
        reject(new Error(`HTTP ${info.statusCode}`));
      }
    });
  });
}

async function main() {
  const version = process.argv[2] || '0.3.3';
  const buildDir = path.resolve(__dirname, '..', '..', '..', '..', 'Documents', 'palab', version);
  const publicDir = path.resolve(__dirname, '..', 'public');

  console.log(`📦 上传 Palab v${version} 到七牛云 ${BUCKET}...\n`);

  const files = [
    { key: 'version.json', path: path.join(__dirname, '..', 'public', 'version.json') },
    { key: 'Palab.apk',    path: path.join(buildDir, 'Palab.apk') },
    { key: `Palab-Setup-${version}.exe`, path: path.join(buildDir, `Palab-Setup-${version}.exe`) },
    { key: '14.png',       path: path.join(publicDir, '14.png') },
    { key: 'tab.ogg',      path: path.join(publicDir, 'tab.ogg') },
  ];

  for (const f of files) {
    if (!fs.existsSync(f.path)) {
      console.log(`  ⚠️  跳过 ${f.key}：文件不存在 ${f.path}`);
      continue;
    }
    try { await uploadFile(f.key, f.path); } catch (e) { console.error(`  ❌ ${f.key}: ${e.message}`); }
  }

  console.log(`\n🎉 完成！访问地址：${DOMAIN}/version.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
