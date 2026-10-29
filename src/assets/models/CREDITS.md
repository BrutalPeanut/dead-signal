# Character models

Built by `node scripts/build-models.mjs` from Kay Lousberg's KayKit character packs (CC0 1.0, credit appreciated, not required): https://kaylousberg.com

| File | Source | Used for |
|---|---|---|
| `courier.glb` | KayKit Adventurers 1.0, Rogue | The courier (all five skins, recoloured at runtime) |
| `skel_warrior.glb` | KayKit Skeletons 1.0, Skeleton Warrior | The Warden, Signal Colossus |
| `skel_rogue.glb` | KayKit Skeletons 1.0, Skeleton Rogue | Hive Mother |
| `skel_mage.glb` | KayKit Skeletons 1.0, Skeleton Mage | The Broadcaster |
| `skel_anims.glb` | KayKit Skeletons 1.0 rig | Shared boss animation clips |

The build keeps only the clips the game uses, resamples them, and shrinks the swatch textures to 256². Helmets, visors, packs, weapons, shields, brood sacs, towers and speaker cones are added in code (`src/render3d/authored.ts`). The infected horde is procedural (`src/render3d/crowd2.ts`).
