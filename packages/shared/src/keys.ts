/** Redis keys shared between packages (web session checks read what core moderation writes). */
export const kvKeys = {
  /** Sessions issued before this epoch-ms are invalid (set when a user is banned). */
  sessionsValidAfter: (userId: string) => `sessions-valid-after:${userId}`,
};
