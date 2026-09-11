import { readFileSync, appendFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
  signal: AbortSignal.timeout(30000),
});
if (!response.ok && response.status !== 404) {
  throw new Error(`npm version lookup failed: HTTP ${response.status}`);
}
const publish = response.status === 404;
const tag = version.includes('-') ? 'next' : 'latest';
appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\ntag=${tag}\n`);
console.log(publish ? `Ready to publish ${name}@${version} to ${tag}.` : `${name}@${version} is already published; skipping publication. Bump package.json and package-lock.json to release changes.`);
