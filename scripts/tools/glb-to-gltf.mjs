// Converte um .glb em .gltf (JSON com buffer embutido em base64).
//   node scripts/tools/glb-to-gltf.mjs entrada.glb saida.gltf
import { readFileSync, writeFileSync } from 'node:fs';
const [input, output] = process.argv.slice(2);
const buf = readFileSync(input);
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('arquivo não é GLB');
let offset = 12;
let json = null, bin = null;
while (offset < buf.length) {
  const len = buf.readUInt32LE(offset);
  const type = buf.readUInt32LE(offset + 4);
  const data = buf.subarray(offset + 8, offset + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  if (type === 0x004e4942) bin = data;
  offset += 8 + len;
}
if (bin) json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
writeFileSync(output, JSON.stringify(json));
console.log(`ok: ${output} (${(JSON.stringify(json).length / 1024).toFixed(0)} KB)`);
