import * as THREE from 'three';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);

function loop(points) { return points.map(([x, z]) => [x, 0, z]); }

export function buildPeople(mountain) {
  const [trailhead, summit] = mountain.spots();
  const trail = mountain.route(
    trailhead.x, mountain.heightAt(trailhead.x, trailhead.z), trailhead.z,
    summit.x, mountain.heightAt(summit.x, summit.z), summit.z,
  );
  return createPeople(trail);
}

function createPeople(mountainRoute) {
  const actors = [
    { path: loop([[-4.8, 5.4], [-2.8, 5.4], [-2.8, 8.1], [-4.8, 8.1]]), speed: 0.55, palette: { skin: 0xe9b895, hair: 0x432b25, top: 0x48a8a0, trim: 0xd6c27a, pants: 0x334c75, shoes: 0xe8e1d8 } },
    { path: loop([[2, 5.2], [4.6, 5.2], [4.6, 8.3], [2, 8.3]]), speed: 0.62, palette: { skin: 0xf1c49c, hair: 0x5a3226, top: 0xf08abc, trim: 0xf6bed8, pants: 0x7654a0, shoes: 0xf2eee8, pony: true } },
    { path: loop([[10.5, 12.6], [18.8, 12.6], [18.8, 15.4], [10.5, 15.4]]), speed: 0.78, palette: { skin: 0xd99c72, hair: 0x262326, top: 0x426f9f, trim: 0x9bbbd8, pants: 0x343b42, shoes: 0x242629, bag: 0x9b6847 } },
    { path: loop([[25.8, 7.4], [30.2, 7.4], [30.2, 11.5], [25.8, 11.5]]), speed: 0.68, palette: { skin: 0xe5b18a, hair: 0x30261f, top: 0xd46e43, trim: 0xe8bd75, pants: 0x52663b, shoes: 0x554638, bag: 0x70482e } },
    { path: [], speed: 1.15, stride: 0.82, bob: 0.055, armSwing: 0.68, legSwing: 0.8, palette: { skin: 0xd9a27c, hair: 0x342822, top: 0x56a45a, trim: 0xf0d178, pants: 0x534d75, shoes: 0x504238, bag: 0x735333 } },
  ];
  const parts = [];
  const add = (actorIndex, parent, x, y, z, w, h, d, color) => parts.push({
    actor: actorIndex, parent, x, y, z, w, h, d, color: new THREE.Color(color), index: parts.length,
  });

  actors.forEach((actor, index) => {
    const c = actor.palette;
    // Mountain route is created once. The hiker follows its stairs to the summit and back.
    if (index === 4) {
      for (let i = 0; i < mountainRoute.length; i++) actor.path.push([mountainRoute[i].x, mountainRoute[i].y, mountainRoute[i].z]);
      for (let i = mountainRoute.length - 2; i > 0; i--) actor.path.push([mountainRoute[i].x, mountainRoute[i].y, mountainRoute[i].z]);
    }
    const first = actor.path[0];
    actor.x = first[0]; actor.y = first[1]; actor.z = first[2];
    actor.heading = 0; actor.segment = 0; actor.progress = 0; actor.phase = index * 1.4;
    actor.matrix = new THREE.Matrix4();

    for (const side of [-1, 1]) {
      const leg = side < 0 ? 'legR' : 'legL';
      const arm = side < 0 ? 'armR' : 'armL';
      add(index, leg, 0, -0.23, 0, 0.16, 0.48, 0.18, c.pants);
      add(index, leg, 0, -0.51, 0.025, 0.2, 0.12, 0.25, c.shoes);
      add(index, arm, 0, -0.22, 0, 0.15, 0.5, 0.22, c.top);
      add(index, arm, 0, -0.48, 0.015, 0.13, 0.12, 0.19, c.skin);
    }
    add(index, 'body', 0, 0, 0, 0.48, 0.58, 0.28, c.top);
    add(index, 'body', 0, -0.12, 0.148, 0.13, 0.19, 0.018, c.trim);
    add(index, 'body', 0, 0.35, 0, 0.16, 0.12, 0.17, c.skin);
    add(index, 'head', 0, 0, 0, 0.34, 0.34, 0.29, c.skin);
    add(index, 'head', 0, 0.2, -0.005, 0.36, 0.09, 0.31, c.hair);
    add(index, 'head', 0, 0.1, 0.153, 0.28, 0.08, 0.035, c.hair);
    for (const side of [-1, 1]) {
      add(index, 'head', side * 0.155, 0, 0, 0.055, 0.23, 0.29, c.hair);
      add(index, 'head', side * 0.073, -0.06, 0.153, 0.045, 0.045, 0.025, 0x282326);
    }
    add(index, 'head', 0, -0.13, 0.16, 0.035, 0.035, 0.025, 0x754a45);
    if (c.pony) add(index, 'head', 0.16, -0.03, -0.18, 0.11, 0.22, 0.11, c.hair);
    if (c.bag) {
      add(index, 'body', 0, -0.08, -0.21, 0.34, 0.42, 0.16, c.bag);
      add(index, 'body', 0, -0.22, -0.3, 0.24, 0.12, 0.025, c.trim);
    }
  });

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
  mesh.name = 'walking-villagers';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  for (const part of parts) mesh.setColorAt(part.index, part.color);

  const rootPosition = new THREE.Vector3(), rootRotation = new THREE.Quaternion(), rootMatrix = new THREE.Matrix4();
  const parentPosition = new THREE.Vector3(), parentRotation = new THREE.Quaternion(), parentMatrix = new THREE.Matrix4();
  const localPosition = new THREE.Vector3(), localScale = new THREE.Vector3(), localMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4(), finalMatrix = new THREE.Matrix4();

  function update(dt) {
    const step = Math.min(dt, 0.1);
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i], path = a.path;
      let distance = a.speed * step;
      while (distance > 0) {
        const from = path[a.segment], to = path[(a.segment + 1) % path.length];
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
        const length = Math.hypot(dx, dy, dz), left = length - a.progress;
        if (length < 0.001 || left < 0.001) { a.segment = (a.segment + 1) % path.length; a.progress = 0; continue; }
        const travel = Math.min(distance, left);
        a.progress += travel; distance -= travel;
        if (a.progress >= length - 0.001) { a.segment = (a.segment + 1) % path.length; a.progress = 0; }
      }
      const from = path[a.segment], to = path[(a.segment + 1) % path.length];
      const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
      const length = Math.hypot(dx, dy, dz), t = length > 0 ? a.progress / length : 0;
      a.x = from[0] + dx * t; a.y = from[1] + dy * t; a.z = from[2] + dz * t;
      a.heading = Math.atan2(dx, dz);
      a.phase += step * 8;
      rootPosition.set(a.x, a.y, a.z);
      rootRotation.setFromAxisAngle(Y_AXIS, a.heading);
      rootMatrix.compose(rootPosition, rootRotation, ONE);
      a.matrix.copy(rootMatrix);
    }

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], a = actors[p.actor], bob = Math.abs(Math.sin(a.phase)) * (a.bob ?? 0.035);
      const swing = Math.sin(a.phase) * (a.stride ?? 0.48);
      if (p.parent === 'body') {
        parentPosition.set(0, 0.95 + bob, 0); parentRotation.identity();
      } else if (p.parent === 'head') {
        parentPosition.set(0, 1.49 + bob, 0); parentRotation.setFromAxisAngle(Z_AXIS, Math.sin(a.phase * 0.5) * 0.025);
      } else if (p.parent === 'armR' || p.parent === 'armL') {
        const right = p.parent === 'armR';
        parentPosition.set(right ? -0.32 : 0.32, 1.19 + bob, 0);
        parentRotation.setFromAxisAngle(Z_AXIS, (right ? swing : -swing) * (a.armSwing ?? 0.55));
      } else {
        const right = p.parent === 'legR';
        parentPosition.set(right ? -0.12 : 0.12, 0.64, 0);
        parentRotation.setFromAxisAngle(X_AXIS, right ? swing * (a.legSwing ?? 0.7) : -swing * (a.legSwing ?? 0.7));
      }
      parentMatrix.compose(parentPosition, parentRotation, ONE);
      worldMatrix.multiplyMatrices(a.matrix, parentMatrix);
      localPosition.set(p.x, p.y, p.z); localScale.set(p.w, p.h, p.d);
      localMatrix.compose(localPosition, parentRotation.identity(), localScale);
      finalMatrix.multiplyMatrices(worldMatrix, localMatrix);
      mesh.setMatrixAt(i, finalMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);
  mesh.computeBoundingSphere();
  return { mesh, update };
}
