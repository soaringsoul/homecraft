import { buildIsland } from '@engine/world/terrain.js';
import { buildForest } from '@engine/world/landscape.js';
import { BoxBatch } from '@engine/world/blocks.js';
import { buildMountain } from '../examples/terry-home/world/mountain.js';
import { createCar } from '../examples/terry-home/world/car.js';
import { ISLAND, HOUSE, UPPER_FLOOR, STAIRS, GARAGE, TREES } from './layout.js';

export function build({ grid, layer, materials, stage }) {
  buildIsland(grid, ISLAND, { surfaceAt: () => 'grass', corner: 10, wobble: 0 });
  const house = buildHouse(grid, layer);
  const garage = buildGarage(grid, layer);
  const helicopter = buildHelicopter(layer);
  const elevator = buildElevator(layer);
  const mountain = buildMountain(layer, materials);
  stage.scene.add(mountain.group);
  return {
    batches: {
      static: house.batch, garage: garage.batch, carLights: garage.carLights,
      heliBody: helicopter.body, heliRotor: helicopter.rotor,
      elevator: elevator.batch, elevatorPlatform: elevator.platform,
    }, planes: [garage.car],
    obstacles: [...house.obstacles, ...garage.obstacles],
    forest: buildForest(grid, layer, TREES), sites: [mountain],
    named: { mountain, car: garage.car, helicopter: helicopter.pose, elevator: elevator.pose },
  };
}

export function setup({ stage, world, player, avatar, rig }) {
  const car = world.car;
  const carLights = world.groups.carLights;
  const heli = world.helicopter;
  const elevator = world.elevator;
  const heliBody = world.groups.heliBody, heliRotor = world.groups.heliRotor;
  const liftPlatform = world.groups.elevatorPlatform;
  if (!car) return {};

  let x = GARAGE.car[0], z = GARAGE.car[1], heading = 0, speed = 0, driving = false;
  let hx = heli.x, hz = heli.z, hy = heli.y, hHeading = 0, hSpeed = 0, rotorAngle = 0, flying = false;
  let liftY = 0, liftTarget = null, liftBusy = false;
  const held = new Set();
  const blobScale = avatar.blob.scale.clone();
  const carCompile = car.material.onBeforeCompile;
  car.material.onBeforeCompile = (shader, renderer) => {
    carCompile?.(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'if (vCarFinish > 1.5 && vCarFinish < 2.5) diffuseColor.a = 0.45;\n#include <opaque_fragment>');
  };
  car.material.customProgramCacheKey = () => 'car-matte-fitted-lamps-driver-glass-v1';
  car.material.transparent = true; car.material.depthWrite = false; car.material.needsUpdate = true;
  function seatRider(px, py, pz, yaw, localX = 0, localZ = 0, bodyDrop = -0.3) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    avatar.root.position.set(px + localX * c + localZ * s, py, pz - localX * s + localZ * c);
    avatar.root.rotation.y = yaw;
    avatar.body.visible = true;
    avatar.body.position.set(0, bodyDrop, 0);
    avatar.body.rotation.set(-0.06, 0, 0);
    avatar.legR.rotation.set(-1.25, 0, 0); avatar.legL.rotation.set(-1.25, 0, 0);
    avatar.armR.rotation.set(-1.15, 0, -0.12); avatar.armL.rotation.set(-1.15, 0, 0.12);
    avatar.blob.scale.set(0, 0, 0);
  }
  function releaseRider() {
    avatar.body.visible = true;
    avatar.body.position.set(0, 0, 0); avatar.body.rotation.set(0, 0, 0);
    avatar.legR.rotation.set(0, 0, 0); avatar.legL.rotation.set(0, 0, 0);
    avatar.armR.rotation.set(0, 0, 0); avatar.armL.rotation.set(0, 0, 0);
    avatar.blob.scale.copy(blobScale);
  }
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:20;padding:16px 18px;border:1px solid #334155;border-radius:18px;background:#101a18ed;color:#e5e7eb;font:600 14px/1.55 system-ui,sans-serif;box-shadow:0 10px 32px #0006;min-width:260px;display:none';
  hud.innerHTML = '<div style="color:#34d399;font-size:12px;letter-spacing:.08em">MODEL Y · 驾驶中</div><div data-speed style="font-size:28px;font-weight:800;margin:2px 0">0 <small style="font-size:14px;color:#94a3b8">km/h</small></div><div>W/S 加速倒车 · A/D 转向</div><div data-pad style="display:flex;gap:6px;margin-top:10px"><button data-key="a" aria-label="左转">◀</button><button data-key="w" aria-label="前进">▲</button><button data-key="s" aria-label="倒车">▼</button><button data-key="d" aria-label="右转">▶</button></div><button data-exit type="button" style="margin-top:10px;padding:9px 14px;border:0;border-radius:10px;background:#ef4444;color:white;font-weight:800;cursor:pointer">P 停车下车</button>';
  document.body.append(hud);
  const speedLabel = hud.querySelector('[data-speed]');
  const exitButton = hud.querySelector('[data-exit]');
  for (const button of hud.querySelectorAll('[data-key]')) {
    button.style.cssText = 'flex:1;padding:9px 11px;border:1px solid #64748b;border-radius:8px;background:#263238;color:white;font-size:18px;touch-action:none';
    const key = button.dataset.key;
    button.addEventListener('pointerdown', e => { e.preventDefault(); held.add(key); button.setPointerCapture(e.pointerId); });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => held.delete(key));
  }
  const hint = document.createElement('button');
  hint.type = 'button'; hint.textContent = '按 E 互动';
  hint.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:20;padding:12px 20px;border:1px solid #64748b;border-radius:12px;background:#101a18ed;color:white;font:700 16px system-ui,sans-serif;display:none;touch-action:manipulation';
  document.body.append(hint);
  hint.addEventListener('click', interact);

  const heliHud = document.createElement('div');
  heliHud.style.cssText = hud.style.cssText;
  heliHud.innerHTML = '<div style="color:#c4b5fd;font-size:12px;letter-spacing:.08em">HELICOPTER · 飞行中</div><div data-heli-speed style="font-size:28px;font-weight:800;margin:2px 0">0 <small style="font-size:14px;color:#94a3b8">km/h</small></div><div>W/S 前后 · A/D 转向 · Space 上升 · Ctrl 下降</div><div data-pad style="display:flex;gap:5px;margin-top:10px;flex-wrap:wrap"><button data-key="a">◀</button><button data-key="w">前进</button><button data-key="s">后退</button><button data-key="d">▶</button><button data-key=" ">上升</button><button data-key="control">下降</button></div><button data-exit type="button" style="margin-top:10px;padding:9px 14px;border:0;border-radius:10px;background:#7c3aed;color:white;font-weight:800;cursor:pointer">E / P 降落并下机</button>';
  document.body.append(heliHud);
  const heliSpeedLabel = heliHud.querySelector('[data-heli-speed]');
  for (const button of heliHud.querySelectorAll('[data-key]')) {
    button.style.cssText = 'flex:1;padding:8px 9px;border:1px solid #64748b;border-radius:8px;background:#263238;color:white;font-size:14px;touch-action:none';
    const key = button.dataset.key;
    button.addEventListener('pointerdown', e => { e.preventDefault(); held.add(key); button.setPointerCapture(e.pointerId); });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => held.delete(key));
  }

  function pose() {
    car.position.set(x, 0, z); car.rotation.y = heading; car.updateMatrix();
    if (carLights) { carLights.position.set(x, 0, z); carLights.rotation.y = heading; }
  }
  pose();
  function poseHeli() {
    heliBody.position.set(hx, hy, hz); heliBody.rotation.y = hHeading;
    heliRotor.position.set(hx, hy, hz); heliRotor.rotation.y = hHeading + rotorAngle;
  }
  function poseLift() { liftPlatform.position.set(elevator.x, liftY, elevator.z); }
  poseHeli(); poseLift();

  function nearCar() { return Math.hypot(player.pos.x - x, player.pos.z - z) < 4; }
  function nearHeli() { return Math.abs(player.y - (HOUSE.height + 1)) < 2 && Math.hypot(player.pos.x - hx, player.pos.z - hz) < 4; }
  function nearLift() {
    const top = player.y > HOUSE.height / 2;
    return top
      ? Math.hypot(player.pos.x - elevator.roofX, player.pos.z - elevator.roofZ) < 3.5
      : Math.hypot(player.pos.x - elevator.x, player.pos.z - elevator.z) < 3.5;
  }
  function enter() {
    if (driving || !nearCar()) return false;
    driving = true; speed = 0; held.clear();
    rig.skipIntro();
    hud.style.display = 'block';
    return true;
  }
  function leave() {
    if (!driving) return;
    driving = false; speed = 0; held.clear();
    releaseRider();
    player.teleport(x, z + 2.8);
    rig.recenter(player);
    hud.style.display = 'none';
  }

  function enterHeli() {
    if (flying || !nearHeli()) return false;
    flying = true; hSpeed = 0; held.clear();
    rig.skipIntro(); heliHud.style.display = 'block';
    return true;
  }
  function leaveHeli() {
    if (!flying) return;
    flying = false; hSpeed = 0; held.clear(); hy = HOUSE.height + 1;
    hx = heli.x; hz = heli.z; hHeading = 0; poseHeli();
    releaseRider();
    player.teleport(heli.x + 2.5, heli.z);
    rig.recenter(player); heliHud.style.display = 'none';
  }
  function startElevator() {
    if (liftBusy || !nearLift()) return false;
    liftBusy = true; held.clear();
    liftTarget = player.y > HOUSE.height / 2 ? 0 : HOUSE.height + 1;
    rig.skipIntro();
    return true;
  }
  function finishElevator() {
    liftY = liftTarget; poseLift();
    liftBusy = false;
    releaseRider();
    if (liftTarget > 0) player.teleport(elevator.roofX, elevator.roofZ);
    else player.teleport(elevator.x, elevator.z);
    rig.recenter(player);
    liftTarget = null;
  }
  function interact() {
    if (enterHeli()) return true;
    if (startElevator()) return true;
    return enter();
  }

  const drivingKeys = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','p',' ','control']);
  function keydown(e) {
    const key = e.key.toLowerCase();
    if (!driving && !flying && !liftBusy && (key === 'e' || key === 'f') && !e.repeat && (nearHeli() || nearLift() || nearCar())) {
      e.preventDefault(); e.stopImmediatePropagation(); interact(); return;
    }
    if (liftBusy) { if (drivingKeys.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    if (!driving && !flying) return;
    if (drivingKeys.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
    if ((key === 'e' || key === 'p') && !e.repeat) { driving ? leave() : leaveHeli(); return; }
    held.add(key);
  }
  function keyup(e) { held.delete(e.key.toLowerCase()); }
  function blur() { held.clear(); }
  addEventListener('keydown', keydown, true);
  addEventListener('keyup', keyup, true);
  addEventListener('blur', blur);
  exitButton.addEventListener('click', leave);
  heliHud.querySelector('[data-exit]').addEventListener('click', leaveHeli);

  return {
    update(dt, elapsed) {
      if (liftBusy) {
        hint.textContent = liftTarget > 0 ? '电梯上行中…' : '电梯下行中…'; hint.style.display = 'block';
        const liftDelta = liftTarget - liftY;
        liftY += Math.sign(liftDelta) * Math.min(Math.abs(liftDelta), 6 * Math.min(elapsed || dt, 0.1));
        player.pos.set(elevator.x, elevator.z);
        avatar.root.position.set(elevator.x, liftY + 0.18, elevator.z + 0.36);
        avatar.root.rotation.y = 0; avatar.blob.scale.set(0, 0, 0);
        if (Math.abs(liftTarget - liftY) < 0.01) finishElevator();
        else poseLift();
        stage.camera.position.set(elevator.x + 4.5, liftY + 3.2, elevator.z + 5);
        stage.camera.lookAt(elevator.x, liftY + 1, elevator.z);
        return;
      }
      if (flying) {
        const forward = held.has('w') || held.has('arrowup'), reverse = held.has('s') || held.has('arrowdown');
        const steer = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
        const lift = held.has(' ');
        const descend = held.has('control') || held.has('shift');
        hSpeed += (forward ? 5 : reverse ? -4 : 0) * dt;
        if (!forward && !reverse) hSpeed *= Math.max(0, 1 - dt * 1.4);
        hSpeed = Math.max(-3, Math.min(8, hSpeed));
        hHeading += steer * 1.25 * dt * Math.sign(hSpeed || 1);
        hy = Math.max(HOUSE.height + 1, Math.min(30, hy + ((lift ? 1 : 0) - (descend ? 1 : 0)) * 4 * dt));
        const nx = hx - Math.sin(hHeading) * hSpeed * dt, nz = hz - Math.cos(hHeading) * hSpeed * dt;
        if (nx > ISLAND.x0 + 3 && nx < ISLAND.x1 - 3 && nz > ISLAND.z0 + 3 && nz < ISLAND.z1 - 3) { hx = nx; hz = nz; }
        else hSpeed = 0;
        rotorAngle += dt * (5 + Math.min(1, Math.abs(hSpeed) / 8) * 18);
        poseHeli();
        player.pos.set(hx, hz);
        seatRider(hx, hy + 0.05, hz, hHeading + Math.PI, 0, 0.75, -0.1);
        heliSpeedLabel.innerHTML = `${Math.round(Math.abs(hSpeed) * 3.6)} <small style="font-size:14px;color:#94a3b8">km/h</small>`;
        const fx = -Math.sin(hHeading), fz = -Math.cos(hHeading);
      stage.camera.position.set(hx - fx * 7 + Math.cos(hHeading) * 3, hy + 3.5, hz - fz * 7 - Math.sin(hHeading) * 3);
        stage.camera.lookAt(hx, hy + 0.6, hz);
        hint.style.display = 'none';
        return;
      }
      if (!driving) {
        const label = nearHeli() ? '按 E 驾驶直升机' : nearLift() ? '按 E 乘电梯' : nearCar() ? '按 E 驾驶' : '';
        hint.textContent = label; hint.style.display = label ? 'block' : 'none';
        return;
      }
      const forward = held.has('w') || held.has('arrowup');
      const reverse = held.has('s') || held.has('arrowdown');
      const steer = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
      speed += (forward ? 8 : reverse ? -6 : 0) * dt;
      if (!forward && !reverse) speed *= Math.max(0, 1 - dt * 1.25);
      speed = Math.max(-4, Math.min(11, speed));
      heading -= steer * Math.min(1, Math.abs(speed) / 3) * 1.05 * dt * Math.sign(speed || 1);
      const nx = x + Math.cos(heading) * speed * dt;
      const nz = z - Math.sin(heading) * speed * dt;
      const insideIsland = nx > -33 && nx < 35 && nz > -23 && nz < 28;
      const clearOfHouse = nx < HOUSE.x0 - 2 || nx > HOUSE.x1 + 2 || nz < HOUSE.z0 - 2 || nz > HOUSE.z1 + 2;
      const withinGarage = nx > GARAGE.x0 + 1 && nx < GARAGE.x1 - 1 && nz > GARAGE.z0 + 1 && nz < GARAGE.z1 - 1;
      const throughGate = nx > GARAGE.x1 - 1 && nz > GARAGE.gateZ0 + 1 && nz < GARAGE.gateZ1 - 1;
      const pastGarage = nx > GARAGE.x1 + 2;
      if (insideIsland && (clearOfHouse || withinGarage || throughGate || pastGarage)) { x = nx; z = nz; }
      else speed = 0;
      pose();
      player.pos.set(x, z);
      seatRider(x, 0.16, z, heading + Math.PI / 2, 0.28, -0.3, -0.3);
      const kmh = Math.round(Math.abs(speed) * 3.6);
      speedLabel.innerHTML = `${kmh} <small style="font-size:14px;color:#94a3b8">km/h</small>`;
      const fx = Math.cos(heading), fz = -Math.sin(heading);
      stage.camera.position.set(x - fx * 7 - Math.sin(heading) * 2, 3.3, z - fz * 7 - Math.cos(heading) * 2);
      stage.camera.lookAt(x, 0.85, z);
      hint.style.display = 'none';
    },
    warmup() {},
  };
}

function buildHelicopter(layer) {
  const body = new BoxBatch(layer), rotor = new BoxBatch(layer);
  body.at(0, 0, 0, 0, () => {
    const paint = { tex: 'paint', tint: 0x7651a8 };
    body.box(0, 0.34, 0, 1.55, 0.42, 2.85, paint);
    body.box(0, 0.48, 1.27, 1.55, 0.7, 1.55, { tex: 'paint', tint: 0x8e68bc });
    body.box(0, 0.7, 1.95, 0.28, 0.24, 2.2, { tex: 'paint', tint: 0x9b7bc4 });
    body.box(0, 0.64, 3.05, 0.78, 0.86, 0.18, { tex: 'paint', tint: 0x68438e });
    body.box(0, 1.45, 3.05, 1.55, 0.12, 0.12, { tex: 'black_metal' });
    // A roomy glazed cockpit lets the pink-clad rider remain visible while seated.
    body.box(0, 0.78, -1.24, 1.38, 1.2, 0.06, { tex: 'glass', glass: true });
    body.box(-0.77, 0.78, -0.62, 0.04, 1.2, 1.25, { tex: 'glass', glass: true });
    body.box(0.77, 0.78, -0.62, 0.04, 1.2, 1.25, { tex: 'glass', glass: true });
    body.box(0, 1.97, -0.62, 1.52, 0.06, 1.3, { tex: 'glass', glass: true });
    for (const side of [-1, 1]) for (const zz of [-1.24, 0.02]) {
      body.box(side * 0.72, 0.7, zz, 0.14, 1.34, 0.14, paint);
    }
    body.box(0, 1.3, 0, 0.18, 0.74, 0.18, { tex: 'black_metal' });
    for (const side of [-1, 1]) {
      body.box(side * 0.82, 0.02, 0, 0.09, 0.1, 3.5, { tex: 'black_metal' });
      body.box(side * 0.82, 0.08, -0.55, 0.09, 0.5, 0.1, { tex: 'black_metal' });
    }
  });
  rotor.at(0, 0, 0, 0, () => {
    rotor.box(0, 2.02, 0, 5.6, 0.08, 0.2, { tex: 'black_metal' });
    rotor.box(0, 2.02, 0, 5.6, 0.08, 0.2, { tex: 'black_metal' }, { ry: Math.PI / 2 });
  });
  return { body, rotor, pose: { x: -1, y: HOUSE.height + 1, z: -3 } };
}

function buildElevator(layer) {
  const batch = new BoxBatch(layer), platform = new BoxBatch(layer);
  const x = 7.65, z = -3, h = HOUSE.height + 1;
  for (const dx of [-1.08, 1.08]) for (const dz of [-1.08, 1.08]) {
    batch.box(x + dx, 0, z + dz, 0.12, h + 0.3, 0.12, { tex: 'black_metal' });
  }
  batch.box(x, h + 0.1, z - 1.08, 2.25, 0.16, 0.12, { tex: 'black_metal' });
  batch.box(x - 1.08, 0, z, 0.04, h, 2.15, { tex: 'glass', glass: true });
  batch.box(x + 1.08, 0, z, 0.04, h, 2.15, { tex: 'glass', glass: true });
  batch.box(x, 0, z - 1.08, 2.15, h, 0.035, { tex: 'glass', glass: true });
  // Open east face is the elevator entrance. A small lit call panel marks it.
  batch.box(x + 1.22, 0.9, z + 1.28, 0.11, 0.48, 0.12, { tex: 'paint', tint: 0x7c3aed, emissive: 0.25 });
  platform.at(0, 0, 0, 0, () => {
    platform.box(0, 0, 0, 2.05, 0.18, 2.05, { tex: 'stainless' });
    platform.box(-0.92, 0.18, 0, 0.08, 1.75, 2.05, { tex: 'glass', glass: true });
    platform.box(0.92, 0.18, 0, 0.08, 1.75, 2.05, { tex: 'glass', glass: true });
    platform.box(0, 0.18, -0.92, 1.85, 1.75, 0.08, { tex: 'glass', glass: true });
    platform.box(0, 0.18, 0.92, 0.82, 1.75, 0.08, { tex: 'glass', glass: true });
  });
  return { batch, platform, pose: { x, z, roofX: HOUSE.x1 - 0.6, roofZ: z } };
}

function buildGarage(grid, layer) {
  const B = new BoxBatch(layer), carLights = new BoxBatch(layer);
  const { x0, x1, z0, z1, gateZ0, gateZ1, car: [carX, carZ] } = GARAGE;
  grid.fill(x0, -1, z0, x1, 0, z1, 'pavers');
  // Paved approach through the east-side exit.
  grid.fill(x1, -1, gateZ0, x1 + 4, 0, gateZ1, 'pavers');

  const wallH = 1.25, wallT = 0.24;
  const wall = (x, z, w, d) => B.box(x, 0, z, w, wallH, d, { tex: 'white_brick' });
  wall(x0, (z0 + z1) / 2, wallT, z1 - z0);
  wall((x0 + x1) / 2, z0, x1 - x0, wallT);
  wall((x0 + x1) / 2, z1, x1 - x0, wallT);
  wall(x1, (z0 + gateZ0) / 2, wallT, gateZ0 - z0);
  wall(x1, (gateZ1 + z1) / 2, wallT, z1 - gateZ1);

  // Dark coping and four posts mark the opening while leaving a clear exit.
  const post = (x, z) => B.box(x, 0, z, 0.34, 1.5, 0.34, { tex: 'black_metal' });
  for (const x of [x0, x1]) for (const z of [z0, z1]) post(x, z);
  post(x1, gateZ0); post(x1, gateZ1);
  const car = createCar(carLights, 0, 0); // front points east, through the gate
  car.position.set(carX, 0, carZ); car.updateMatrix();
  return {
    batch: B,
    carLights,
    car,
    obstacles: [
      { x0: x0 - 0.2, x1: x0 + 0.2, z0, z1, level: 0 },
      { x0, x1, z0: z0 - 0.2, z1: z0 + 0.2, level: 0 },
      { x0, x1, z0: z1 - 0.2, z1: z1 + 0.2, level: 0 },
      { x0: x1 - 0.2, x1: x1 + 0.2, z0, z1: gateZ0, level: 0 },
      { x0: x1 - 0.2, x1: x1 + 0.2, z0: gateZ1, z1, level: 0 },
    ],
  };
}

function buildHouse(grid, layer) {
  const { x0, x1, z0, z1, height } = HOUSE;
  grid.define('house_roof', { tex: { top: 'roof', side: 'black_metal', bottom: 'wood_panel' }, merge: true });
  grid.define('house_frame', { tex: { all: 'black_metal' }, merge: true, map: '#34383e' });
  grid.define('upper_floor', { tex: { top: 'wood_floor', side: 'wood_panel', bottom: 'wood_panel' }, merge: true });
  // Ground-level floor sits on top of the island, at y = -1.
  grid.fill(x0, -1, z0, x1, 0, z1, 'planks');

  // Raise the back of the house into a loft, leaving the south half open as
  // the lower storey and the west-edge stairwell clear.
  grid.fill(x0, UPPER_FLOOR - 1, z0, x1, UPPER_FLOOR, STAIRS.z0, 'upper_floor');

  // Transparent glass around the square shell. The south wall has a central,
  // two-block-wide opening facing the spawn point.
  for (let y = 0; y < height; y++) {
    for (let x = x0 - 1; x <= x1; x++) {
      const doorway = x >= -1 && x < 1 && y < 3;
      grid.set(x, y, z0 - 1, 'glass', 'wallN');
      if (!doorway) grid.set(x, y, z1, 'glass', 'wallS');
    }
    for (let z = z0; z < z1; z++) {
      grid.set(x0 - 1, y, z, 'glass', 'wallW');
      grid.set(x1, y, z, 'glass', 'wallE');
    }
  }

  // A flat, walkable roof with a low parapet keeps the house silhouette clear.
  grid.fill(x0 - 1, height, z0 - 1, x1 + 1, height + 1, z1 + 1, 'house_roof', 'roof');
  for (let x = x0 - 1; x <= x1; x++) {
    grid.set(x, height + 1, z0 - 1, 'house_frame', 'roof');
    grid.set(x, height + 1, z1, 'house_frame', 'roof');
  }
  for (let z = z0; z < z1; z++) {
    grid.set(x0 - 1, height + 1, z, 'house_frame', 'roof');
    grid.set(x1, height + 1, z, 'house_frame', 'roof');
  }

  // Slim metal mullions and floor bands keep the transparent walls readable
  // without changing the house's square outline or height.
  // Twenty-four compact risers climb four metres over the west edge of the
  // house. The layout's floorAt() follows their treads for walking and routing.
  const B = new BoxBatch(layer);
  const wallZ = [z0 - 1, z1];
  const post = (x, z) => B.box(x, 0, z, 0.1, height, 0.1, { tex: 'black_metal' });
  for (const z of wallZ) {
    for (let x = x0 - 1; x <= x1; x += 3) {
      if (z === z1 && x >= -1 && x < 1) continue;
      post(x, z);
    }
    if (z !== z1 || x1 < -1 || x1 >= 1) post(x1, z);
    for (const y of [UPPER_FLOOR, height - 0.1]) {
      B.box((x0 + x1 - 1) / 2, y, z, x1 - x0 + 1, 0.1, 0.1, { tex: 'black_metal' });
    }
  }
  for (const x of [x0 - 1, x1]) {
    for (let z = z0 + 2; z < z1; z += 3) post(x, z);
    for (const y of [UPPER_FLOOR, height - 0.1]) {
      B.box(x, y, (z0 + z1 - 1) / 2, 0.1, 0.1, z1 - z0 + 1, { tex: 'black_metal' });
    }
  }
  const steps = 24, run = (STAIRS.z1 - STAIRS.z0) / steps;
  const stairX = (STAIRS.x0 + STAIRS.x1) / 2, stairWidth = STAIRS.x1 - STAIRS.x0;
  for (let i = 0; i < steps; i++) {
    const z = STAIRS.z1 - (i + 0.5) * run;
    const top = (i + 1) * UPPER_FLOOR / steps;
    B.box(stairX, 0, z, stairWidth, Math.max(0.04, top - 0.06), run, { tex: 'wood_panel' });
    B.box(stairX, top - 0.06, z, stairWidth, 0.06, run, { tex: 'wood_floor' });
  }
  // A simple handrail along the room-facing edge of the flight.
  const slope = Math.atan2(UPPER_FLOOR, STAIRS.z1 - STAIRS.z0);
  const railX = STAIRS.x1 - 0.06;
  B.box(railX, UPPER_FLOOR / 2 + 0.9 - 0.05, (STAIRS.z0 + STAIRS.z1) / 2,
    0.07, 0.1, Math.hypot(UPPER_FLOOR, STAIRS.z1 - STAIRS.z0), { tex: 'black_metal' }, { rx: slope });
  for (let i = 0; i <= 5; i++) {
    const z = STAIRS.z1 - i * (STAIRS.z1 - STAIRS.z0) / 5;
    const y = i * UPPER_FLOOR / 5 + 0.1;
    B.box(railX, y, z, 0.07, 0.8, 0.07, { tex: 'black_metal' });
  }

  // Upstairs bed and a compact TV table, kept clear of the stair landing.
  const bedX = -2.4, bedZ = -6.7;
  B.box(bedX, UPPER_FLOOR, bedZ, 2.3, 0.3, 2.2, { tex: 'paint', tint: 0x56307f });
  B.box(bedX, UPPER_FLOOR + 0.3, bedZ, 2.15, 0.2, 2.05, { tex: 'velvet', tint: 0x8053b8 });
  B.box(bedX, UPPER_FLOOR, bedZ - 1.04, 2.3, 0.85, 0.12, { tex: 'paint', tint: 0x684092 });
  B.box(bedX, UPPER_FLOOR + 0.5, bedZ - 0.72, 0.9, 0.14, 0.48, { tex: 'linen', tint: 0xf18bc4 });

  const tableX = 2.35, tableZ = -7.35, tableW = 1.25, tableD = 0.72;
  B.box(tableX, UPPER_FLOOR + 0.66, tableZ, tableW, 0.08, tableD, { tex: 'oak' });
  for (const dx of [-0.52, 0.52]) for (const dz of [-0.27, 0.27]) {
    B.box(tableX + dx, UPPER_FLOOR, tableZ + dz, 0.07, 0.66, 0.07, { tex: 'oak' });
  }
  const tvX = tableX, tvZ = tableZ - 0.12;
  B.box(tvX, UPPER_FLOOR + 0.74, tvZ, 0.94, 0.58, 0.1, { tex: 'black_metal' });
  B.box(tvX, UPPER_FLOOR + 0.8, tvZ + 0.061, 0.8, 0.43, 0.02,
    { tex: 'screen', tint: 0x9bcfff, emissive: 0.8 });
  B.box(tvX, UPPER_FLOOR + 0.74, tvZ, 0.12, 0.12, 0.28, { tex: 'black_metal' });
  return {
    batch: B,
    obstacles: [
      { x0: bedX - 1.2, x1: bedX + 1.2, z0: bedZ - 1.15, z1: bedZ + 1.15, level: 1 },
      { x0: tableX - 0.7, x1: tableX + 0.7, z0: tableZ - 0.45, z1: tableZ + 0.45, level: 1 },
    ],
  };
}
