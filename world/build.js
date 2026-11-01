import * as THREE from 'three';
import { buildIsland } from '@engine/world/terrain.js';
import { buildForest } from '@engine/world/landscape.js';
import { BoxBatch } from '@engine/world/blocks.js';
import { canvasTexture } from '@engine/world/textures.js';
import { buildMountain } from '../examples/terry-home/world/mountain.js';
import { createCar } from '../examples/terry-home/world/car.js';
import { buildSailboat } from './sailboat.js';
import { buildPeople } from './people.js';
import { ISLAND, HOUSE, UPPER_FLOOR, STAIRS, BAKERY, GARAGE, TREES, SPAWN } from './layout.js';

export function build({ grid, layer, materials, stage }) {
  buildIsland(grid, ISLAND, { surfaceAt: () => 'grass', corner: 10, wobble: 0 });
  const house = buildHouse(grid, layer);
  const garage = buildGarage(grid, layer);
  const helicopter = buildHelicopter(layer);
  const elevator = buildElevator(layer);
  const mountain = buildMountain(layer, materials);
  const people = buildPeople(mountain);
  const sailboat = buildSailboat(layer, materials);
  stage.scene.add(mountain.group, people.mesh, sailboat.group);
  return {
    batches: {
      static: house.batch, garage: garage.batch, carLights: garage.carLights,
      heliBody: helicopter.body, heliRotor: helicopter.rotor,
      elevator: elevator.batch, elevatorPlatform: elevator.platform,
    }, planes: [garage.car, ...house.planes],
    obstacles: [...house.obstacles, ...garage.obstacles],
    bakes: house.bakes,
    forest: buildForest(grid, layer, TREES), sites: [mountain],
    named: { mountain, car: garage.car, helicopter: helicopter.pose, elevator: elevator.pose, people, sailboat },
  };
}

export function setup({ stage, world, nav, player, avatar, rig, sound }) {
  const car = world.car;
  const carLights = world.groups.carLights;
  const heli = world.helicopter;
  const sailboat = world.sailboat;
  const sailboatGroup = sailboat.group;
  const elevator = world.elevator;
  const heliBody = world.groups.heliBody, heliRotor = world.groups.heliRotor;
  const liftPlatform = world.groups.elevatorPlatform;
  const people = world.people;
  if (!car) return {};

  let x = GARAGE.car[0], z = GARAGE.car[1], heading = 0, speed = 0, driving = false;
  let hx = heli.x, hz = heli.z, hy = heli.y, hHeading = 0, hSpeed = 0, rotorAngle = 0, flying = false;
  let bx = sailboat.x, bz = sailboat.z, bHeading = sailboat.heading, bSpeed = 0, sailing = false, boatClock = 0;
  let liftY = 0, liftTarget = null, liftBusy = false;
  let weatherSheltering = false, shelterStage = 'idle';
  const held = new Set();
  const dogRaycaster = new THREE.Raycaster(), dogNdc = new THREE.Vector2();
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

  const boatHud = document.createElement('div');
  boatHud.style.cssText = hud.style.cssText;
  boatHud.innerHTML = '<div style="color:#93c5fd;font-size:12px;letter-spacing:.08em">SAILBOAT · 驾驶中</div><div data-boat-speed style="font-size:28px;font-weight:800;margin:2px 0">0 <small style="font-size:14px;color:#94a3b8">km/h</small></div><div>W/S 前进倒退 · A/D 转向</div><div data-pad style="display:flex;gap:6px;margin-top:10px"><button data-key="a" aria-label="左转">◀</button><button data-key="w" aria-label="前进">▲</button><button data-key="s" aria-label="倒退">▼</button><button data-key="d" aria-label="右转">▶</button></div><button data-exit type="button" style="margin-top:10px;padding:9px 14px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:800;cursor:pointer">E 下船</button>';
  document.body.append(boatHud);
  const boatSpeedLabel = boatHud.querySelector('[data-boat-speed]');
  for (const button of boatHud.querySelectorAll('[data-key]')) {
    button.style.cssText = 'flex:1;padding:9px 11px;border:1px solid #64748b;border-radius:8px;background:#263238;color:white;font-size:18px;touch-action:none';
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
  function poseSailboat() {
    sailboatGroup.position.set(bx, sailboat.y + Math.sin(boatClock * 0.9) * 0.045, bz);
    sailboatGroup.rotation.set(Math.sin(boatClock * 0.72) * 0.018, bHeading, Math.sin(boatClock * 0.84) * 0.03, 'YXZ');
  }
  function poseLift() { liftPlatform.position.set(elevator.x, liftY, elevator.z); }
  poseHeli(); poseSailboat(); poseLift();

  function nearCar() { return Math.hypot(player.pos.x - x, player.pos.z - z) < 4; }
  function nearHeli() { return Math.abs(player.y - (HOUSE.height + 1)) < 2 && Math.hypot(player.pos.x - hx, player.pos.z - hz) < 4; }
  function nearSailboat() { return player.mode === 'ground' && Math.hypot(player.pos.x - bx, player.pos.z - bz) < 7; }
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
  function enterSailboat() {
    if (sailing || driving || flying || liftBusy || !nearSailboat()) return false;
    sailing = true; bSpeed = 0; held.clear(); player.cancel();
    rig.skipIntro(); boatHud.style.display = 'block';
    return true;
  }
  function leaveSailboat() {
    if (!sailing) return;
    sailing = false; bSpeed = 0; held.clear();
    releaseRider(); boatHud.style.display = 'none';
    const shoreZ = Math.max(ISLAND.z0 + 2.5, Math.min(ISLAND.z1 - 2.5, bz));
    let shore = null;
    for (const x of [ISLAND.x1 - 1.8, ISLAND.x1 - 3.2, ISLAND.x1 - 4.8, ISLAND.x1 - 6.2]) {
      const candidate = nav.nearestStand(x, shoreZ);
      if (nav.canStand(candidate.x, candidate.z)) { shore = candidate; break; }
    }
    if (!shore) shore = nav.nearestStand(SPAWN.x, SPAWN.z);
    player.teleport(shore.x, shore.z);
    rig.recenter(player);
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

  function isInsideHouse() {
    return player.pos.x >= HOUSE.x0 && player.pos.x < HOUSE.x1
      && player.pos.z >= HOUSE.z0 && player.pos.z < HOUSE.z1 && player.y < HOUSE.height;
  }
  function isOnRoofWalkway() {
    return player.y > HOUSE.height / 2 && player.pos.x >= -2.5 && player.pos.x < HOUSE.x1
      && player.pos.z >= -3.5 && player.pos.z < -2.5;
  }
  function walkPlayerToShelter() {
    if (isInsideHouse()) { shelterStage = 'inside'; return; }
    if (player.swimming) {
      if (shelterStage !== 'swimming') {
        shelterStage = 'swimming';
        player.leavePool(0, 4, () => { shelterStage = 'waiting'; });
      }
      return;
    }
    if (player.flying) {
      if (shelterStage !== 'landing') { shelterStage = 'landing'; player.stopFlying(); }
      return;
    }
    if (player.mode !== 'ground') { shelterStage = 'waiting'; return; }
    if (isOnRoofWalkway()) {
      if (Math.hypot(player.pos.x - elevator.roofX, player.pos.z - elevator.roofZ) < 0.75) {
        if (startElevator()) shelterStage = 'elevator';
      } else if (shelterStage !== 'roof-walk' || !player.travelling) {
        shelterStage = player.goTo(elevator.roofX, elevator.roofZ) ? 'roof-walk' : 'waiting';
      }
      return;
    }
    if (player.island === 'mountain' && world.mountain) {
      if (shelterStage !== 'mountain' || !player.travelling) {
        const trailhead = world.mountain.spots()[0];
        const trail = world.mountain.route(
          player.pos.x, player.y, player.pos.z,
          trailhead.x, world.mountain.heightAt(trailhead.x, trailhead.z), trailhead.z,
        );
        trail.push({ x: 8, y: 0, z: -12 }, { x: 8, y: 0, z: 4.2 }, { x: 0, y: 0, z: 4.2 }, { x: 0, y: 0, z: 2.2 });
        shelterStage = player.follow(trail) ? 'mountain' : 'waiting';
      }
      return;
    }
    if (shelterStage === 'walking' && player.travelling) return;
    shelterStage = player.goTo(0, 1.4) ? 'walking' : 'waiting';
  }
  function setWeatherSheltering(on) {
    if (weatherSheltering === on) return;
    weatherSheltering = on;
    people?.setSheltering(on);
    if (!on) { shelterStage = 'idle'; return; }
    if (driving) leave();
    if (flying) leaveHeli();
    if (sailing) leaveSailboat();
    shelterStage = 'waiting';
    if (liftBusy) shelterStage = 'elevator';
    else if (flying) shelterStage = 'roof-walk';
    walkPlayerToShelter();
  }
  function syncWeatherShelter() {
    const menu = document.querySelector('#weatherMenu');
    const mode = menu?.querySelector('[data-weather][aria-checked="true"]')?.dataset.weather;
    const label = document.querySelector('#moodButton')?.getAttribute('aria-label') || '';
    setWeatherSheltering(mode === 'rain' || mode === 'thunder'
      || (mode === 'auto' && /(雨|雷|rain|thunder|storm)/i.test(label)));
  }
  const weatherMenu = document.querySelector('#weatherMenu'), weatherButton = document.querySelector('#moodButton');
  const weatherObserver = new MutationObserver(syncWeatherShelter);
  if (weatherMenu) weatherObserver.observe(weatherMenu, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
  if (weatherButton) weatherObserver.observe(weatherButton, { attributes: true, attributeFilter: ['aria-label'] });
  syncWeatherShelter();
  function interact() {
    if (enterHeli()) return true;
    if (startElevator()) return true;
    if (enterSailboat()) return true;
    return enter();
  }
  function tap(x, y) {
    if (rig.introActive) return false;
    dogNdc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    dogRaycaster.setFromCamera(dogNdc, stage.camera);
    if (people?.hitDog?.(dogRaycaster.ray)) { sound?.play('bark'); return true; }
    if (nearSailboat() && dogRaycaster.intersectObject(sailboatGroup, true).length) return enterSailboat();
    return false;
  }

  const drivingKeys = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','p',' ','control']);
  function keydown(e) {
    const key = e.key.toLowerCase();
    if (!driving && !flying && !sailing && !liftBusy && (key === 'e' || key === 'f') && !e.repeat && (nearHeli() || nearLift() || nearCar() || nearSailboat())) {
      e.preventDefault(); e.stopImmediatePropagation(); interact(); return;
    }
    if (liftBusy) { if (drivingKeys.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    if (!driving && !flying && !sailing) return;
    if (drivingKeys.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
    if ((key === 'e' || key === 'p') && !e.repeat) {
      if (driving) leave(); else if (flying) leaveHeli(); else leaveSailboat();
      return;
    }
    held.add(key);
  }
  function keyup(e) { held.delete(e.key.toLowerCase()); }
  function blur() { held.clear(); }
  addEventListener('keydown', keydown, true);
  addEventListener('keyup', keyup, true);
  addEventListener('blur', blur);
  exitButton.addEventListener('click', leave);
  heliHud.querySelector('[data-exit]').addEventListener('click', leaveHeli);
  boatHud.querySelector('[data-exit]').addEventListener('click', leaveSailboat);

  return {
    tap,
    update(dt, elapsed) {
      people?.update(dt);
      boatClock += Math.min(dt, 0.1);
      if (weatherSheltering) {
        if (driving) leave();
        if (flying) leaveHeli();
        if (sailing) leaveSailboat();
        if (liftBusy) shelterStage = 'elevator';
        else walkPlayerToShelter();
      }
      poseSailboat();
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
      if (sailing) {
        const forward = held.has('w') || held.has('arrowup');
        const reverse = held.has('s') || held.has('arrowdown');
        const steer = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
        bSpeed += (forward ? 2.4 : reverse ? -1.8 : 0) * dt;
        if (!forward && !reverse) bSpeed *= Math.max(0, 1 - dt * 0.65);
        bSpeed = Math.max(-2, Math.min(4.8, bSpeed));
        bHeading -= steer * Math.min(1, Math.abs(bSpeed) / 1.2) * 0.72 * dt * Math.sign(bSpeed || 1);
        const nx = bx + Math.sin(bHeading) * bSpeed * dt;
        const nz = bz + Math.cos(bHeading) * bSpeed * dt;
        if (nx >= ISLAND.x1 + 2.8 && nx <= ISLAND.x1 + 25 && nz >= ISLAND.z0 + 3 && nz <= ISLAND.z1 - 3) { bx = nx; bz = nz; }
        else bSpeed = 0;
        poseSailboat(); player.pos.set(bx, bz);
        const bob = Math.sin(boatClock * 0.9) * 0.045;
        seatRider(bx, sailboat.y + 0.58 + bob, bz, bHeading, -0.32, -0.78, -0.3);
        boatSpeedLabel.innerHTML = `${Math.round(Math.abs(bSpeed) * 3.6)} <small style="font-size:14px;color:#94a3b8">km/h</small>`;
        const fx = Math.sin(bHeading), fz = Math.cos(bHeading);
        stage.camera.position.set(bx - fx * 7, sailboat.y + 3.3 + bob, bz - fz * 7);
        stage.camera.lookAt(bx, sailboat.y + 1.0 + bob, bz);
        hint.style.display = 'none';
        return;
      }
      if (!driving) {
        const label = nearHeli() ? '按 E 驾驶直升机' : nearLift() ? '按 E 乘电梯' : nearCar() ? '按 E 驾驶' : nearSailboat() ? '按 E 登上帆船' : '';
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
  // Distinct stone tile identifies the public bakery floor directly below the loft.
  grid.fill(BAKERY.x0, -1, BAKERY.z0, BAKERY.x1, 0, BAKERY.z1, 'travertine');

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

  const bakeryObstacles = [];
  const bakeryWall = (x, z, w, d, obstacle) => {
    B.box(x, 0, z, w, 2.36, d, { tex: 'plaster' });
    B.box(x, 0, z, w + 0.02, 0.16, d + 0.02, { tex: 'wood_panel' });
    if (obstacle) bakeryObstacles.push(obstacle);
  };
  // The wall facing the hall has a broad walk-in opening; the side and back
  // partitions make the space beneath the loft read as a separate shop.
  bakeryWall(-2.56, -4.56, 0.88, 0.16, { x0: -3.02, x1: -2.1, z0: -4.68, z1: -4.44, level: 0 });
  bakeryWall(4.26, -4.56, 2.48, 0.16, { x0: 2.98, x1: 5.54, z0: -4.68, z1: -4.44, level: 0 });
  bakeryWall(-3.06, -6.25, 0.16, 3.5, { x0: -3.2, x1: -2.92, z0: -8.02, z1: -4.48, level: 0 });
  bakeryWall(2.06, -6.25, 0.16, 3.5, { x0: 1.92, x1: 2.2, z0: -8.02, z1: -4.48, level: 0 });
  bakeryWall(-0.5, -8.06, 5.12, 0.16, { x0: -3.08, x1: 2.08, z0: -8.2, z1: -7.92, level: 0 });

  // Warm fascia and a compact painted sign in front of the open entrance.
  B.box(0.45, 2.36, -4.56, 5.08, 0.58, 0.18, { tex: 'wood_panel' });
  B.box(0.45, 2.39, -4.44, 4.88, 0.52, 0.05, { tex: 'paint', tint: 0x713b46 });
  const signTexture = canvasTexture(768, 96, (ctx, w, h) => {
    ctx.fillStyle = '#713b46'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e7c987'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff3dc'; ctx.font = '700 36px system-ui, sans-serif';
    ctx.fillText('锦一面包店', w / 2, 31);
    ctx.fillStyle = '#e7c987'; ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('BAKERY  ·  COFFEE', w / 2, 68);
  }, { pixelated: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.78, 0.47), new THREE.MeshBasicMaterial({ map: signTexture }));
  sign.position.set(0.45, 2.65, -4.405); sign.name = 'jin-yi-bakery-sign';

  const bakeryLook = { tex: 'oak' }, steelLook = { tex: 'stainless' };
  const obstacle = (x, z, w, d) => bakeryObstacles.push({
    x0: x - w / 2 - 0.05, x1: x + w / 2 + 0.05,
    z0: z - d / 2 - 0.05, z1: z + d / 2 + 0.05, level: 0,
  });

  // Low service counter near the entrance, leaving clear aisles on both sides.
  B.box(0, 0, -5.72, 1.52, 0.82, 0.62, { tex: 'wood_panel' });
  B.box(0, 0.82, -5.72, 1.64, 0.12, 0.72, { tex: 'oak' });
  B.box(0, 0.24, -5.395, 1.28, 0.16, 0.035, { tex: 'paint', tint: 0x713b46 });
  B.box(0, 0.55, -5.37, 1.1, 0.04, 0.035, { tex: 'black_metal' });
  obstacle(0, -5.72, 1.64, 0.74);

  // Refrigerated glass case with pastry shelves and a cool lit nameplate.
  const fridgeX = -2.24, fridgeZ = -7.08;
  B.box(fridgeX, 0, fridgeZ, 1.12, 0.42, 1.02, steelLook);
  B.box(fridgeX, 0.42, fridgeZ, 1.03, 0.9, 0.91, { tex: 'glass', glass: true });
  for (const dx of [-0.52, 0.52]) for (const dz of [-0.46, 0.46]) {
    B.box(fridgeX + dx, 0.42, fridgeZ + dz, 0.07, 0.95, 0.07, { tex: 'stainless' });
  }
  for (const y of [0.77, 1.08]) B.box(fridgeX, y, fridgeZ, 0.96, 0.035, 0.8, { tex: 'stainless' });
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const px = fridgeX - 0.31 + col * 0.31, py = 0.81 + row * 0.31, pz = fridgeZ + 0.12;
    const crust = (row + col) % 2 ? 0xc98945 : 0xe3b56b;
    B.box(px, py, pz, 0.2, 0.12, 0.2, { tex: 'paint', tint: crust });
    B.box(px, py + 0.11, pz + 0.01, 0.12, 0.04, 0.12, { tex: 'paint', tint: 0xffe2a8 });
  }
  B.box(fridgeX, 0.13, fridgeZ + 0.53, 0.76, 0.12, 0.025, { tex: 'paint', tint: 0xc7ebf2, emissive: 0.45 });
  obstacle(fridgeX, fridgeZ, 1.2, 1.1);

  // Coffee preparation station and espresso machine behind the service bar.
  const coffeeX = -0.75, coffeeZ = -7.55;
  B.box(coffeeX, 0, coffeeZ, 1.2, 0.78, 0.68, { tex: 'wood_panel' });
  B.box(coffeeX, 0.78, coffeeZ, 1.3, 0.12, 0.78, bakeryLook);
  B.box(coffeeX - 0.2, 0.9, coffeeZ, 0.68, 0.56, 0.5, steelLook);
  B.box(coffeeX - 0.2, 1.42, coffeeZ, 0.72, 0.12, 0.54, { tex: 'black_metal' });
  B.box(coffeeX - 0.2, 1.14, coffeeZ + 0.27, 0.58, 0.34, 0.04, { tex: 'black_metal' });
  B.box(coffeeX - 0.2, 1.18, coffeeZ + 0.3, 0.36, 0.18, 0.025, { tex: 'paint', tint: 0xc98955 });
  for (const dx of [-0.37, -0.03]) {
    B.box(coffeeX + dx, 0.84, coffeeZ + 0.4, 0.12, 0.18, 0.04, { tex: 'black_metal' });
    B.box(coffeeX + dx, 1.04, coffeeZ + 0.35, 0.05, 0.1, 0.08, { tex: 'stainless' });
  }
  // Two ceramic cups and their saucers sit beside the machine.
  for (const dx of [0.24, 0.46]) {
    B.box(coffeeX + dx, 0.91, coffeeZ + 0.13, 0.2, 0.035, 0.2, { tex: 'linen' });
    B.box(coffeeX + dx, 0.95, coffeeZ + 0.13, 0.12, 0.16, 0.12, { tex: 'linen' });
    B.box(coffeeX + dx, 1.1, coffeeZ + 0.13, 0.13, 0.025, 0.13, { tex: 'paint', tint: 0x6b3f35 });
  }
  obstacle(coffeeX, coffeeZ, 1.35, 0.82);

  // Three-tier wooden bread rack, stocked with several small golden loaves.
  const rackX = 0.85, rackZ = -7.52;
  for (const dx of [-0.25, 0.25]) B.box(rackX + dx, 0, rackZ, 0.07, 1.9, 0.07, { tex: 'wood_panel' });
  for (const y of [0.45, 1.03, 1.61]) {
    B.box(rackX, y, rackZ, 0.62, 0.07, 0.64, { tex: 'oak' });
    for (let col = 0; col < 3; col++) {
      const x = rackX - 0.19 + col * 0.19;
      B.box(x, y + 0.07, rackZ + 0.02, 0.15, 0.13, 0.24, { tex: 'paint', tint: col % 2 ? 0xd5a25d : 0xb9783d });
      B.box(x, y + 0.19, rackZ + 0.025, 0.09, 0.035, 0.15, { tex: 'paint', tint: 0xf1cf91 });
    }
  }
  obstacle(rackX, rackZ, 0.72, 0.74);

  // Tall supply cupboard with divided doors, shelves and dark pull handles.
  const cabinetX = -2.34, cabinetZ = -5.7;
  B.box(cabinetX, 0, cabinetZ, 0.88, 1.82, 0.58, { tex: 'wood_panel' });
  B.box(cabinetX, 1.82, cabinetZ, 0.98, 0.1, 0.66, { tex: 'oak' });
  B.box(cabinetX - 0.21, 0.17, cabinetZ + 0.3, 0.36, 1.55, 0.035, { tex: 'walnut' });
  B.box(cabinetX + 0.21, 0.17, cabinetZ + 0.3, 0.36, 1.55, 0.035, { tex: 'walnut' });
  for (const y of [0.65, 1.17]) B.box(cabinetX, y, cabinetZ, 0.8, 0.055, 0.5, { tex: 'oak' });
  for (const dx of [-0.08, 0.08]) B.box(cabinetX + dx, 0.9, cabinetZ + 0.34, 0.035, 0.18, 0.04, { tex: 'black_metal' });
  obstacle(cabinetX, cabinetZ, 1.0, 0.68);

  // Low pendant shades warm the pastry and coffee counters after dark.
  for (const [x, z] of [[-1.75, -6.3], [0.85, -6.35]]) {
    B.box(x, 2.55, z, 0.035, 0.25, 0.035, { tex: 'black_metal' });
    B.box(x, 2.3, z, 0.38, 0.2, 0.38, { tex: 'paint', tint: 0xffdfa8, emissive: 0.75 });
  }

  // Upstairs bed and a compact TV table, kept clear of the stair landing.
  const bedX = 4.1, bedZ = -6.7;
  B.box(bedX, UPPER_FLOOR, bedZ, 2.3, 0.3, 2.2, { tex: 'paint', tint: 0x56307f });
  B.box(bedX, UPPER_FLOOR + 0.3, bedZ, 2.15, 0.2, 2.05, { tex: 'velvet', tint: 0x8053b8 });
  B.box(bedX, UPPER_FLOOR, bedZ - 1.04, 2.3, 0.85, 0.12, { tex: 'paint', tint: 0x684092 });
  B.box(bedX, UPPER_FLOOR + 0.5, bedZ - 0.72, 0.9, 0.14, 0.48, { tex: 'linen', tint: 0xf18bc4 });

  const tableX = -4.5, tableZ = -7.35, tableW = 1.25, tableD = 0.72;
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
    planes: [sign],
    bakes: [
      { id: 'bakery-pastry-counter', position: [-1.75, 2.55, -6.3], power: 1.8, radius: 5 },
      { id: 'bakery-coffee-bar', position: [0.85, 2.55, -6.35], power: 1.6, radius: 5 },
    ],
    obstacles: [
      ...bakeryObstacles,
      { x0: bedX - 1.2, x1: bedX + 1.2, z0: bedZ - 1.15, z1: bedZ + 1.15, level: 1 },
      { x0: tableX - 0.7, x1: tableX + 0.7, z0: tableZ - 0.45, z1: tableZ + 0.45, level: 1 },
    ],
  };
}
