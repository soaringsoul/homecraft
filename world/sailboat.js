import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';

const paint = tint => ({ tex: 'paint', tint });

export function buildSailboat(layer, materials) {
  const batch = new BoxBatch(layer), group = new THREE.Group();
  const box = (x, y, z, w, h, d, look) => batch.box(x, y, z, w, h, d, look, { shadow: false });

  batch.at(0, 0, 0, 0, () => {
    // A sturdy little clinker-style hull with a timber deck and blue gunwale.
    box(0, 0, 0, 1.35, 0.62, 4.8, paint(0x355d78));
    box(0, 0.12, 2.25, 0.9, 0.46, 0.62, paint(0x355d78));
    box(0, 0.5, 0, 1.52, 0.08, 4.0, { tex: 'wood_floor' });
    box(0, 0.56, -2.0, 1.34, 0.09, 0.45, { tex: 'wood_floor' });
    box(0, 0.56, 2.0, 1.14, 0.09, 0.5, { tex: 'wood_floor' });
    for (const side of [-1, 1]) {
      box(side * 0.67, 0.57, -0.1, 0.08, 0.16, 3.5, paint(0xf3eee2));
      box(side * 0.74, 0.42, -0.05, 0.07, 0.34, 3.8, paint(0x294252));
    }

    // Mast, boom and a stepped triangular sail keep the voxel-world look.
    box(0, 0.57, 0.15, 0.12, 3.55, 0.12, { tex: 'walnut' });
    box(-0.75, 0.92, 0.15, 1.55, 0.08, 0.08, { tex: 'walnut' });
    for (let row = 0; row < 8; row++) {
      const width = 2.55 * (1 - (row + 0.45) / 8);
      const y = 0.94 + row * 0.39;
      box(-width / 2, y, 0.11, width, 0.4, 0.055, row === 3 ? paint(0xc26750) : paint(0xf3ead5));
    }
    box(0, 0.74, -1.26, 0.32, 0.06, 0.32, { tex: 'walnut' });
    box(0.31, 0.76, -1.24, 0.07, 0.42, 0.07, { tex: 'black_metal' });
    box(0.15, 1.13, -1.24, 0.39, 0.07, 0.07, { tex: 'walnut' });

    // The boatman sits at the stern by the tiller, in a cap and blue coat.
    box(0.38, 0.65, -1.58, 0.3, 0.2, 0.32, paint(0x4c4b55));
    box(0.38, 0.79, -1.58, 0.34, 0.36, 0.28, paint(0x285b76));
    box(0.38, 1.14, -1.58, 0.28, 0.28, 0.27, paint(0xe1b28d));
    box(0.38, 1.39, -1.58, 0.34, 0.1, 0.32, paint(0x243d52));
    box(0.38, 1.47, -1.58, 0.22, 0.08, 0.22, paint(0x315d78));
    for (const side of [-1, 1]) {
      box(0.38 + side * 0.23, 0.91, -1.44, 0.12, 0.29, 0.12, paint(0x285b76));
      box(0.38 + side * 0.23, 0.73, -1.34, 0.1, 0.11, 0.11, paint(0xe1b28d));
    }
    // A little burgee above the sail.
    box(0.08, 4.0, 0.15, 0.36, 0.22, 0.055, paint(0xd46d55));
  });

  group.name = 'sailable-sailboat';
  for (const mesh of batch.build(materials)) group.add(mesh);
  const pose = { group, x: 42.2, y: -1.3, z: 4.5, heading: Math.PI / 2 };
  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.y = pose.heading;
  return pose;
}
