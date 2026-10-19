/** World units are metres. +z points down the road, away from the camera. The player runs at z = 0. */

export const LANE_W = 2.4;
export const LANES = [-1, 0, 1] as const;
export type Lane = (typeof LANES)[number];

export const ROAD_HALF = 4.0;
export const SIDEWALK_END = 10.5;
export const BUILDING_X = 11;
export const VIEW_DIST = 140;

export const CAM_H = 3.6;
export const CAM_BACK = 6;
export const NEAR_Z = -CAM_BACK + 0.6;

export const PLAYER_HALF_W = 0.4;
export const PLAYER_HALF_D = 0.45;
export const PLAYER_H = 1.75;
export const CROUCH_H = 0.85;

export const GRAVITY = 30;
export const JUMP_V = 10.5;
export const FAST_FALL_V = -16;
export const CROUCH_TIME = 0.7;
export const LANE_SWITCH_RATE = 16;

export const START_SPEED = 15;
export const MAX_SPEED = 34;
export const SPEED_GAIN = 0.16;

/** Seconds the police stay on your heels after a stumble. A second stumble in that window gets you caught. */
export const CHASE_TIME = 6;
export const START_CHASE_TIME = 2.5;
export const INVULN_TIME = 2.5;

export const FREE_LIFELINES = 1;
export const MAX_LIFELINES = 3;
export const LIFELINE_DECISION_TIME = 6;

export const OBSTACLE = {
  barricade: { w: 2.1, h: 1.05, len: 0.5 },
  banner: { w: 2.3, h: 2.4, len: 0.3, clearance: 1.15 },
  police: { w: 0.9, h: 1.85, len: 0.6 },
  bus: { w: 2.3, h: 3.1, len: 11 },
} as const;

export const PLACARDS = [
  "HEAR US",
  "JUSTICE NOW",
  "OUR VOICE",
  "STAND UP",
  "NO MORE",
  "EQUAL RIGHTS",
  "FREE SPEECH",
  "WE WANT JOBS",
  "PEACE",
  "SAVE OUR CITY",
  "ENOUGH!",
  "UNITY",
];
