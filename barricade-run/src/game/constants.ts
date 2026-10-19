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

/** Hand-held placards: English, Hinglish and Hindi slogans of the street protest. */
export const PLACARDS = [
  "STOP PAPER LEAK",
  "RE-NEET NOW",
  "JUSTICE FOR NEET STUDENTS",
  "OUR FUTURE IS NOT FOR SALE",
  "STOP VOTE CHORI",
  "WHERE IS MY VOTE?",
  "SAVE DEMOCRACY",
  "NO MORE DHANDLI",
  "END CORRUPTION",
  "EVERY VOTE COUNTS",
  "VOTE CHORI BAND KARO",
  "NEET PHIR SE KARAO",
  "DHANDLI NAHI CHALEGI",
  "HUMEIN JAWAB CHAHIYE",
  "पेपर लीक बंद करो",
  "वोट चोरी बंद करो",
  "भ्रष्टाचार बंद करो",
  "छात्रों को न्याय दो",
  "धांधली नहीं चलेगी",
];

/** Cloth banners carried across the sidewalk by two marchers. */
export const BANNERS = [
  "NEET PAPER LEAK: RE-EXAM NOW",
  "STOP VOTE CHORI • SAVE DEMOCRACY",
  "STUDENTS AGAINST CORRUPTION",
  "छात्र एकता ज़िंदाबाद",
  "वोट चोरी बंद करो",
  "OUR VOTE, OUR RIGHT",
  "PAPER LEAK = BETRAYAL OF STUDENTS",
];

/** Hoardings on the buildings: [header, headline]. */
export const BILLBOARDS: [string, string][] = [
  ["BREAKING", "NEET PAPER LEAKED"],
  ["ASK THEM", "WHO STOLE MY VOTE?"],
  ["BREAKING", "RE-NEET NOW, SAY STUDENTS"],
  ["आज की ख़बर", "पेपर लीक पर हंगामा"],
  ["BREAKING", "VOTE CHORI ALLEGED"],
  ["DEMAND", "CORRUPTION-FREE EXAMS"],
];

export const FONT = 'system-ui, "Segoe UI", "Nirmala UI", "Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif';
