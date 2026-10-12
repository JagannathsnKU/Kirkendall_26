declare const __ANTI_CHEAT__: boolean

/**
 * Photo metadata, duplicate, and daily-limit checks. On unless .env sets ANTI_CHEAT=0,
 * which is meant for local testing only.
 */
export const ANTI_CHEAT = __ANTI_CHEAT__
