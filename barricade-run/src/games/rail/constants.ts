/** Rail Roko tuning. World units are metres; +z points down the line. The trolley rides at z = 0. */

export const LANE_W = 2.7;
export type Track = -1 | 0 | 1;
/** Half the distance between the two rails of one track. */
export const GAUGE_HALF = 0.76;
export const BALLAST_HALF = LANE_W * 1.5 + 0.6;
/** Raised walkway beside the line where the protesters stand. */
export const PLATFORM_X = BALLAST_HALF + 0.9;
export const PLATFORM_H = 0.95;
export const PLATFORM_END = PLATFORM_X + 5;
export const VIEW_DIST = 140;

export const CAM_H = 4.0;
export const CAM_BACK = 6.5;
export const CAM_BACK_PORTRAIT = 8;

/** The trolley spans z from -CART_BACK to CART_FRONT. A trolley stays on the rails: it never jumps. */
export const CART_BACK = 0.45;
export const CART_FRONT = 1.25;
export const CART_HALF_W = 0.8;
export const RIDER_TOP = 2.35;
export const DUCK_TOP = 1.05;

export const DUCK_TIME = 0.75;
export const SWITCH_RATE = 12;

/** The bell clears railway police off your track this far ahead, then needs time to recharge. */
export const BELL_RANGE = 40;
export const BELL_COOLDOWN = 5;

export const START_SPEED = 17;
export const MAX_SPEED = 38;
export const SPEED_GAIN = 0.16;

/** Length range of a stretch where one track has been pulled up. */
export const GAP_MIN = 26;
export const GAP_MAX = 60;

/** A station (with shelters and boards) every STATION_EVERY metres, STATION_LEN long. */
export const STATION_EVERY = 320;
export const STATION_LEN = 110;
