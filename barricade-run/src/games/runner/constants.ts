/** Barricade Run tuning. World units are metres. +z points down the road, away from the camera. The player runs at z = 0. */

export const LANE_W = 2.4;
export type Lane = -1 | 0 | 1;

export const ROAD_HALF = 4.0;
export const SIDEWALK_END = 10.5;
export const BUILDING_X = 11;
export const VIEW_DIST = 140;

export const CAM_H = 3.6;
export const CAM_BACK = 6;

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
