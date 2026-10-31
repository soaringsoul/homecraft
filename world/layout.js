// 1 block = 1 m. x east, z south, y up.
export const ISLAND = { x0: -36, x1: 38, z0: -26, z1: 31 };
export const HOUSE = { x0: -6, x1: 6, z0: -9, z1: 3, height: 8 };
export const UPPER_FLOOR = 4;
export const STAIRS = { x0: -5.3, x1: -3.7, z0: -4.5, z1: 2.5 };
export const INTRO = { pos: [52, 40, 66], portrait: [83, 64, 106], look: [0, 0, 2] };
export const GARAGE = { x0: 9, x1: 23, z0: -4, z1: 10, gateZ0: 0.5, gateZ1: 5.5, car: [15.5, 3] };

// The open stairwell follows the west edge; the raised back section is the
// upper floor, while the south section remains the ground floor.
export function floorAt(x, z) {
  // A one-metre rooftop walkway links the exterior elevator landing to the
  // helipad. The roof blocks at y=8 provide its walkable surface at y=9.
  if (x >= -2.5 && x < HOUSE.x1 && z >= -3.5 && z < -2.5) return HOUSE.height + 1;
  if (x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < STAIRS.z0) return UPPER_FLOOR;
  if (x >= STAIRS.x0 && x < STAIRS.x1 && z >= STAIRS.z0 && z < STAIRS.z1) {
    return (STAIRS.z1 - z) * UPPER_FLOOR / (STAIRS.z1 - STAIRS.z0);
  }
  return 0;
}
export const SPAWN = { x: 0.5, z: 18, heading: Math.PI };
export const STATIONS = [
  { id: 'mailbox', name: '留言', en: 'Mailbox', icon: 'mail', at: [0.5, 23.9], look: [0.5, 25.5] },
  { id: 'portal', name: '传送门', en: 'Portal', icon: 'portal', at: [8, 23.1], look: [8, 25.5] },
];
export const MAILBOX = { x: 0.5, z: 25.5, yaw: Math.PI };
export const PORTAL = { x: 8, z: 25.5, yaw: Math.PI };
export const TREES = [[30, -12]];
