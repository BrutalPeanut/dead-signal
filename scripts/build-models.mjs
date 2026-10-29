// Builds the Option D character assets from Kay Lousberg's KayKit packs (CC0).
//   node scripts/build-models.mjs        (downloads sources into .cache/kaykit, writes src/assets/models)
// Output:
//   courier.glb      KayKit Rogue mesh + rig + hero clips, original palette (skins recolour at runtime)
//   skel_warrior.glb, skel_mage.glb, skel_rogue.glb   meshes + rig only
//   skel_anims.glb   the shared skeleton rig with boss clips (no meshes)
// Textures are downscaled from 1024² to 256² (they are flat swatch palettes) and clips resampled.
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { PNG } from 'pngjs';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

const CACHE = '.cache/kaykit';
const OUT = 'src/assets/models';
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });
const ADV = 'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/';
const SKL = 'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf/';
const SOURCES = { Rogue: ADV, Skeleton_Warrior: SKL, Skeleton_Mage: SKL, Skeleton_Rogue: SKL };

for (const [name, base] of Object.entries(SOURCES)) {
  const f = `${CACHE}/${name}.glb`;
  if (existsSync(f)) continue;
  const r = await fetch(base + name + '.glb');
  if (!r.ok) throw new Error(`download ${name}: ${r.status}`);
  writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  console.log('downloaded', name);
}

const io = new NodeIO();

function shrink(png, size) {
  const out = new PNG({ width: size, height: size });
  const k = png.width / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const si = (Math.floor((y + 0.5) * k) * png.width + Math.floor((x + 0.5) * k)) * 4;
      const di = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = png.data[si + c];
    }
  return out;
}

async function make(src, out, { dropNodes = [], keepAnims = [], meshes = true }) {
  const doc = await io.read(`${CACHE}/${src}.glb`);
  const root = doc.getRoot();
  for (const n of root.listNodes()) {
    if (dropNodes.includes(n.getName())) n.dispose();
    else if (!meshes && n.getMesh()) n.dispose();
  }
  for (const a of root.listAnimations()) {
    if (keepAnims.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const t of root.listTextures()) {
    const png = shrink(PNG.sync.read(Buffer.from(t.getImage())), 256);
    t.setImage(new Uint8Array(PNG.sync.write(png)));
  }
  await doc.transform(resample(), prune(), dedup());
  const bin = await io.writeBinary(doc);
  writeFileSync(`${OUT}/${out}`, bin);
  console.log(out, (bin.byteLength / 1024).toFixed(0) + ' KB', root.listAnimations().map((a) => a.getName()).join(','));
}

await make('Rogue', 'courier.glb', {
  dropNodes: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'],
  keepAnims: ['Idle', 'Running_A', '1H_Ranged_Aiming', 'Hit_A', 'Death_A', 'Cheer'],
});
for (const [src, out] of [['Skeleton_Warrior', 'skel_warrior.glb'], ['Skeleton_Mage', 'skel_mage.glb'], ['Skeleton_Rogue', 'skel_rogue.glb']]) await make(src, out, {});
await make('Skeleton_Warrior', 'skel_anims.glb', {
  meshes: false,
  dropNodes: ['Skeleton_Warrior_Helmet'],
  keepAnims: ['Idle_Combat', 'Walking_D_Skeletons', 'Running_A', '1H_Melee_Attack_Chop', 'Block', 'Taunt', 'Spellcast_Shoot', '1H_Ranged_Shoot', 'Spawn_Ground_Skeletons', 'Death_A', 'Hit_A'],
});
