// Confirm the mechanism: it is not "html is ignored" but "body is a separate root, so nothing
// set on <html> propagates into it". Those predict different failures, and the second one has
// a sharper consequence: an inherited property set ONLY on <html> is lost entirely, while the
// same property set on <body> reaches everything below it.
//
// Predictive test: put font-family on <html> AND on <body> with the SAME value -> looks
// identical to body-only. Put font-family on <html>, and on <body> set a DIFFERENT family ->
// if body is a separate root, the body value wins cleanly for all descendants (no
// cross-inheritance weirdness).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The isolated @formepdf install lives outside the repo (the repo must not depend on it).
// Point SPIKE_ENGINE_DIR at that install's node_modules; default is a sibling spike dir.
function engineUrl(pkg) {
  const dir = process.env.SPIKE_ENGINE_DIR;
  if (!dir) {
    throw new Error('set SPIKE_ENGINE_DIR to the node_modules dir holding @formepdf/*');
  }
  // Resolve the entry from the package's own `main`: the packages do not share a layout
  // (@formepdf/html is ./index.js while the others are ./dist/index.js).
  const pkgDir = path.join(dir, '@formepdf', pkg || 'html');
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const main = (manifest.main || 'index.js').replace(/^\.\//, '');
  return pathToFileURL(path.join(pkgDir, main)).href;
}
const FONT = process.env.SPIKE_CJK_FONT;
const fontBytes = fs.readFileSync(FONT);
const CJK = '张三';

async function main() {
  const htmlMod = await import(engineUrl());
  await htmlMod.init();

  const render = (html) => {
    const res = htmlMod.renderHtml(html, {
      fonts: [
        // Only one family is registered, so "which font won" is observable via the subset.
        { family: 'ResumeCJK', data: new Uint8Array(fontBytes), weight: 400 },
      ],
    });
    const raw = Buffer.from(res.pdf).toString('latin1');
    return {
      subset: /Identity-H/.test(raw),
      warnings: (res.warnings ?? []).length,
    };
  };

  // 1. html-only: predicted LOST
  console.log('html only            ' + JSON.stringify(render(`<html><head><style>html{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`)));
  // 2. body-only: predicted APPLIED
  console.log('body only            ' + JSON.stringify(render(`<html><head><style>body{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`)));
  // 3. Both, same value: predicted APPLIED
  console.log('html + body (same)   ' + JSON.stringify(render(`<html><head><style>html{font-family:"ResumeCJK"}body{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`)));
  // 4. Unregistered name on body, registered on html: if body is a root, the body's
  //    unregistered name wins and CJK is lost. If inheritance from html reached body, the
  //    registered family could still be available.
  console.log('html=good body=other ' + JSON.stringify(render(`<html><head><style>html{font-family:"ResumeCJK"}body{font-family:"NoSuchFont"}</style></head><body><p>${CJK}</p></body></html>`)));

  // 5. Does the child combinator work at all? Compare `html > body` against `body`.
  console.log('html > body          ' + JSON.stringify(render(`<html><head><style>html > body{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`)));
  console.log('body > p             ' + JSON.stringify(render(`<html><head><style>body > p{font-family:"ResumeCJK"}</style></head><body><p>${CJK}</p></body></html>`)));
  console.log('div > p              ' + JSON.stringify(render(`<html><head><style>div > p{font-family:"ResumeCJK"}</style></head><body><div><p>${CJK}</p></div></body></html>`)));
}

main().catch((e) => {
  console.log('FATAL ' + e.stack);
  process.exit(1);
});
