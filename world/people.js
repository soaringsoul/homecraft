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
  const indoorSpots = [[-2.8, 0, 0.8], [2.8, 0, 0.8], [-2.5, 0, -2.5], [2.5, 0, -2.5], [0, 0, -1.4], [0, 0, 1.2]];
  const actors = [
    { path: loop([[-4.8, 5.4], [-2.8, 5.4], [-2.8, 8.1], [-4.8, 8.1]]), speed: 0.55, palette: { skin: 0xe9b895, hair: 0x432b25, top: 0x48a8a0, trim: 0xd6c27a, pants: 0x334c75, shoes: 0xe8e1d8 } },
    { path: loop([[2, 5.2], [4.6, 5.2], [4.6, 8.3], [2, 8.3]]), speed: 0.62, palette: { skin: 0xf1c49c, hair: 0x5a3226, top: 0xf08abc, trim: 0xf6bed8, pants: 0x7654a0, shoes: 0xf2eee8, pony: true } },
    { path: loop([[10.5, 12.6], [18.8, 12.6], [18.8, 15.4], [10.5, 15.4]]), speed: 0.78, palette: { skin: 0xd99c72, hair: 0x262326, top: 0x426f9f, trim: 0x9bbbd8, pants: 0x343b42, shoes: 0x242629, bag: 0x9b6847 } },
    { path: loop([[25.8, 7.4], [30.2, 7.4], [30.2, 11.5], [25.8, 11.5]]), speed: 0.68, palette: { skin: 0xe5b18a, hair: 0x30261f, top: 0xd46e43, trim: 0xe8bd75, pants: 0x52663b, shoes: 0x554638, bag: 0x70482e } },
    { path: [], speed: 1.15, stride: 0.82, bob: 0.055, armSwing: 0.68, legSwing: 0.8, palette: { skin: 0xd9a27c, hair: 0x342822, top: 0x56a45a, trim: 0xf0d178, pants: 0x534d75, shoes: 0x504238, bag: 0x735333 } },
    { path: loop([[-1.8, 13.2], [1.8, 13.2], [1.8, 16.2], [-1.8, 16.2]]), speed: 0.48, stride: 0.42, bob: 0.025, poodle: true, palette: { coat: 0x1b1c22, curl: 0x292a31, muzzle: 0x383940, collar: 0x9b4d91, tag: 0xf0c76a, eye: 0xc49a66 } },
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
    actor.normalPath = actor.path;
    actor.homeSpot = indoorSpots[index];
    actor.loop = true;
    actor.arrived = false;
    actor.resumePath = null;
    const first = actor.path[0];
    actor.x = first[0]; actor.y = first[1]; actor.z = first[2];
    actor.heading = 0; actor.segment = 0; actor.progress = 0; actor.phase = index * 1.4;
    actor.matrix = new THREE.Matrix4();

    if (actor.poodle) {
      // A compact black toy poodle: rounded coat tufts, floppy ears, short legs,
      // and a small plum collar. All parts still share the villagers' one draw call.
      add(index, 'body', 0, 0.02, 0, 0.48, 0.34, 0.68, c.coat);
      add(index, 'body', 0, 0.19, 0.02, 0.36, 0.13, 0.5, c.curl);
      add(index, 'body', -0.19, 0.04, 0.08, 0.16, 0.21, 0.2, c.curl);
      add(index, 'body', 0.19, 0.04, 0.08, 0.16, 0.21, 0.2, c.coat);
      add(index, 'body', -0.17, 0.03, -0.21, 0.15, 0.2, 0.19, c.coat);
      add(index, 'body', 0.17, 0.03, -0.21, 0.15, 0.2, 0.19, c.curl);
      add(index, 'body', 0, -0.02, 0.31, 0.42, 0.08, 0.08, c.collar);
      add(index, 'body', 0, -0.11, 0.36, 0.1, 0.11, 0.04, c.tag);
      add(index, 'head', 0, 0, 0, 0.38, 0.37, 0.34, c.coat);
      add(index, 'head', 0, 0.16, -0.01, 0.2, 0.16, 0.19, c.curl);
      add(index, 'head', -0.14, 0.12, 0.04, 0.16, 0.15, 0.16, c.curl);
      add(index, 'head', 0.14, 0.12, 0.04, 0.16, 0.15, 0.16, c.coat);
      add(index, 'head', -0.19, -0.07, -0.05, 0.14, 0.26, 0.16, c.coat);
      add(index, 'head', 0.19, -0.07, -0.05, 0.14, 0.26, 0.16, c.curl);
      add(index, 'head', 0, -0.09, 0.2, 0.23, 0.17, 0.18, c.muzzle);
      add(index, 'head', 0, -0.04, 0.3, 0.09, 0.07, 0.05, 0x090a0d);
      for (const side of [-1, 1]) {
        add(index, 'head', side * 0.095, 0.045, 0.17, 0.045, 0.045, 0.025, c.eye);
        add(index, 'head', side * 0.095, 0.045, 0.19, 0.018, 0.02, 0.012, 0xf1dfc2);
      }
      for (const side of [-1, 1]) {
        add(index, side < 0 ? 'legR' : 'legL', side * -0.03, -0.105, 0.22, 0.14, 0.22, 0.14, c.coat);
        add(index, side < 0 ? 'legR' : 'legL', side * -0.03, -0.19, 0.24, 0.17, 0.1, 0.18, c.curl);
        add(index, side < 0 ? 'legR' : 'legL', side * -0.03, -0.105, -0.22, 0.14, 0.22, 0.14, c.curl);
        add(index, side < 0 ? 'legR' : 'legL', side * -0.03, -0.19, -0.24, 0.17, 0.1, 0.18, c.coat);
      }
      add(index, 'tail', 0, 0, -0.08, 0.16, 0.16, 0.16, c.curl);
      return;
    }

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
  let sheltering = false;

  function setPath(actor, points, loopPath) {
    const path = [[actor.x, actor.y, actor.z]];
    for (let i = 0; i < points.length; i++) {
      const point = points[i], last = path[path.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]) > 0.04) path.push(point);
    }
    if (path.length === 1) path.push([actor.x + 0.1, actor.y, actor.z]);
    actor.path = path; actor.segment = 0; actor.progress = 0;
    actor.loop = loopPath; actor.arrived = false;
  }

  function nearestPathPoint(actor, path) {
    let nearest = 0, best = Infinity;
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const px = Array.isArray(point) ? point[0] : point.x;
      const py = Array.isArray(point) ? point[1] : point.y;
      const pz = Array.isArray(point) ? point[2] : point.z;
      const dx = px - actor.x, dy = py - actor.y, dz = pz - actor.z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < best) { best = distance; nearest = i; }
    }
    return nearest;
  }

  function setSheltering(on) {
    if (sheltering === on) return;
    sheltering = on;
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i], points = [];
      actor.resumePath = null;
      if (on) {
        if (actor.x >= -6 && actor.x < 6 && actor.z >= -9 && actor.z < 3 && actor.y < 8) {
          actor.path = [[actor.x, actor.y, actor.z]];
          actor.segment = 0; actor.progress = 0; actor.loop = false; actor.arrived = true;
          continue;
        }
        if (i === 4) {
          const nearest = nearestPathPoint(actor, mountainRoute);
          for (let j = nearest; j >= 0; j--) {
            const p = mountainRoute[j]; points.push([p.x, p.y, p.z]);
          }
          points.push([8, 0, -12], [8, 0, 4.2], [0, 0, 4.2], [0, 0, 2.2], actor.homeSpot);
        } else if (i === 2) {
          points.push([8, 0, 12], [8, 0, 4.2], [0, 0, 4.2], [0, 0, 2.2], actor.homeSpot);
        } else if (i === 3) {
          points.push([25, 0, 12], [8, 0, 12], [8, 0, 4.2], [0, 0, 4.2], [0, 0, 2.2], actor.homeSpot);
        } else {
          points.push([0, 0, 4.2], [0, 0, 2.2], actor.homeSpot);
        }
        setPath(actor, points, false);
      } else if (actor.arrived || (actor.x >= -6 && actor.x < 6 && actor.z >= -9 && actor.z < 3 && actor.y < 8)) {
        points.push([0, 0, 2.2], [0, 0, 4.2]);
        if (i === 2) points.push([8, 0, 4.2], [8, 0, 12]);
        else if (i === 3) points.push([8, 0, 4.2], [8, 0, 12], [25, 0, 12]);
        else if (i === 4) points.push([8, 0, 4.2], [8, 0, -12]);
        points.push(actor.normalPath[0]);
        actor.resumePath = actor.normalPath;
        setPath(actor, points, false);
      } else {
        const path = actor.normalPath, nearest = nearestPathPoint(actor, path);
        for (let j = 0; j < path.length; j++) points.push(path[(nearest + j) % path.length]);
        setPath(actor, points, true);
      }
    }
  }

  function update(dt) {
    const step = Math.min(dt, 0.1);
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.arrived && a.resumePath) {
        const resumePath = a.resumePath;
        a.resumePath = null;
        setPath(a, resumePath, true);
      }
      const path = a.path;
      let distance = a.speed * step;
      while (distance > 0) {
        const next = a.segment + 1 < path.length ? a.segment + 1 : a.loop ? 0 : -1;
        if (next < 0) { a.progress = 0; a.arrived = true; distance = 0; break; }
        const from = path[a.segment], to = path[next];
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
        const length = Math.hypot(dx, dy, dz), left = length - a.progress;
        if (length < 0.001 || left < 0.001) {
          if (a.segment + 1 < path.length) a.segment++;
          else if (a.loop) a.segment = 0;
          else { a.segment = path.length - 1; a.arrived = true; distance = 0; }
          a.progress = 0; continue;
        }
        const travel = Math.min(distance, left);
        a.progress += travel; distance -= travel;
        if (a.progress >= length - 0.001) {
          if (a.segment + 1 < path.length) a.segment++;
          else if (a.loop) a.segment = 0;
          else { a.segment = path.length - 1; a.arrived = true; distance = 0; }
          a.progress = 0;
        }
      }
      const next = a.segment + 1 < path.length ? a.segment + 1 : a.loop ? 0 : -1;
      const from = path[a.segment], to = path[next < 0 ? a.segment : next];
      const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
      const length = Math.hypot(dx, dy, dz), t = length > 0 ? a.progress / length : 0;
      a.x = from[0] + dx * t; a.y = from[1] + dy * t; a.z = from[2] + dz * t;
      if (length > 0) a.heading = Math.atan2(dx, dz);
      a.phase += step * (a.arrived ? 1.8 : 8);
      rootPosition.set(a.x, a.y, a.z);
      rootRotation.setFromAxisAngle(Y_AXIS, a.heading);
      rootMatrix.compose(rootPosition, rootRotation, ONE);
      a.matrix.copy(rootMatrix);
    }

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], a = actors[p.actor], walk = a.arrived ? 0 : 1;
      const bob = Math.abs(Math.sin(a.phase)) * (a.bob ?? 0.035) * walk;
      const swing = Math.sin(a.phase) * (a.stride ?? 0.48) * walk;
      if (p.parent === 'body') {
        parentPosition.set(0, (a.poodle ? 0.39 : 0.95) + bob, 0); parentRotation.identity();
      } else if (p.parent === 'head') {
        parentPosition.set(0, (a.poodle ? 0.68 : 1.49) + bob, a.poodle ? 0.27 : 0); parentRotation.setFromAxisAngle(Z_AXIS, Math.sin(a.phase * 0.5) * (a.poodle ? 0.035 : 0.025));
      } else if (p.parent === 'tail') {
        parentPosition.set(0, 0.52, -0.3); parentRotation.setFromAxisAngle(Y_AXIS, Math.sin(a.phase * 1.7) * 0.28);
      } else if (p.parent === 'armR' || p.parent === 'armL') {
        const right = p.parent === 'armR';
        parentPosition.set(right ? -0.32 : 0.32, 1.19 + bob, 0);
        parentRotation.setFromAxisAngle(Z_AXIS, (right ? swing : -swing) * (a.armSwing ?? 0.55));
      } else {
        const right = p.parent === 'legR';
        parentPosition.set(right ? (a.poodle ? -0.14 : -0.12) : (a.poodle ? 0.14 : 0.12), a.poodle ? 0.22 : 0.64, 0);
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
  const dogActor = actors.findIndex(actor => actor.poodle);
  const dogBounds = new THREE.Box3();
  function hitDog(ray) {
    if (dogActor < 0) return false;
    const dog = actors[dogActor];
    dogBounds.min.set(dog.x - 0.48, dog.y - 0.05, dog.z - 0.62);
    dogBounds.max.set(dog.x + 0.48, dog.y + 1.02, dog.z + 0.62);
    return ray.intersectsBox(dogBounds);
  }
  return { mesh, update, setSheltering, hitDog };
}
