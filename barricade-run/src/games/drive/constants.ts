/** Barricade Drive tuning. World units are metres; +z points down the road. The car's rear bumper is at z = 0. */

export const LANE_COUNT = 4;
export const LANE_W = 2.7;
export const ROAD_HALF = (LANE_COUNT * LANE_W) / 2;
export const VIEW_DIST = 150;

export const CAM_H = 3.8;
export const CAM_BACK = 7.5;
export const CAM_BACK_PORTRAIT = 9;

export const CAR_HALF_W = 0.88;
export const CAR_LEN = 4.0;

export const START_SPEED = 22;
export const MAX_SPEED = 46;
export const SPEED_GAIN = 0.17;
export const LANE_SWITCH_RATE = 10;

export const BOOST_TIME = 3;
export const BOOST_MULT = 1.45;
/** One nitro charge is a third of the meter. */
export const BOOST_COST = 1 / 3;
export const BRAKE_TIME = 0.7;
export const BRAKE_MULT = 0.55;

export const SMASH_POINTS = 25;

export const laneX = (lane: number) => (lane - (LANE_COUNT - 1) / 2) * LANE_W;
