/** Rules and texts shared by every game in the arcade. World units are metres; +z points away from the camera. */

export const AUTHOR = "Abhishek Pal";
export const ARCADE_NAME = "Barricade Arcade";

/** Seconds the police stay on your heels after a stumble. A second stumble in that window gets you caught. */
export const CHASE_TIME = 6;
export const START_CHASE_TIME = 2.5;
export const INVULN_TIME = 2.5;

export const FREE_LIFELINES = 1;
export const MAX_LIFELINES = 3;
export const LIFELINE_DECISION_TIME = 6;

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

export const HEADLINES = [
  "Students march against the NEET paper leak",
  'Aspirants demand "Re-NEET now"',
  "Protesters allege vote chori and dhandli in the elections",
  "Thousands on the streets demanding answers on corruption",
  "Police put up barricades across the city",
  "Chakka jam: traffic stuck as the march reaches the highway",
  "Rail roko: protesters stop trains at the junction",
];

export const FONT = 'system-ui, "Segoe UI", "Nirmala UI", "Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif';
