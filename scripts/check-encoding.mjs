import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const textFile = /(?:\.(?:[cm]?[jt]sx?|json|ya?ml|mdx?|html?|css|scss|sql|prisma|toml|svg|txt|csv|tsv|xml|sh|ps1)|(?:^|\/)(?:Dockerfile[^/]*|\.[^/]+))$/i;
// Match multi-character corruption signatures, never isolated valid letters such as Ã or â.
const mojibake = /(?:[\u00c2\u00c3][\u0080-\u00bf]|\u00e2[\u0080-\u00bf\u20ac][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2010-\u203a\u20ac\u2122]|\u00f0\u0178|\u00ef\u00bb\u00bf|\ufffd|[\u0080-\u009f])/u;
let failures = 0;
let checked = 0;
for (const file of [...new Set(files)]) {
  if (!textFile.test(file)) continue;
  let bytes;
  try { bytes = readFileSync(new URL(file, new URL('../', import.meta.url))); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  checked++;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { console.error(`${file}: invalid UTF-8`); failures++; continue; }
  text.split(/\r?\n/).forEach((line, index) => {
    if (mojibake.test(line)) {
      // Do not log contents: an untracked file may contain credentials or personal data.
      console.error(`${file}:${index + 1}: possible mojibake; review the source`);
      failures++;
    }
  });
}
if (failures) process.exitCode = 1;
else console.log(`Encoding check passed (${checked} text files, valid UTF-8, no mojibake signatures).`);
