import { dangalDef } from "./dangal/def";
import { driveDef } from "./drive/def";
import { localDef } from "./local/def";
import { railDef } from "./rail/def";
import { runnerDef } from "./runner/def";
import type { GameDef } from "./shared/types";

/** Every game in the arcade, in hub order. */
export const GAMES: GameDef[] = [runnerDef, driveDef, railDef, dangalDef, localDef];
