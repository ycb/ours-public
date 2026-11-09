/** Query keys hold only static names and opaque ids — never titles, descriptions, or other content. */
export const paletteKeys = {
  all: ["palette"] as const,
  categories: () => ["palette", "categories"] as const,
  members: () => ["palette", "members"] as const,
  items: () => ["palette", "items"] as const,
  views: () => ["palette", "views"] as const,
  inboxMessages: () => ["palette", "inbox-messages"] as const,
  revisionStamps: () => ["palette", "revision-stamps"] as const,
  inboxPicks: () => ["palette", "inbox-picks"] as const,
  inboxMemories: () => ["palette", "inbox-memories"] as const,
  dates: () => ["palette", "dates"] as const,
  item: (itemId: string) => ["palette", "item", itemId] as const,
  comments: (itemId: string) => ["palette", "item", itemId, "comments"] as const,
  revisions: (itemId: string) => ["palette", "item", itemId, "revisions"] as const,
  memories: (itemId: string) => ["palette", "item", itemId, "memories"] as const,
};

export const activityKeys = {
  all: ["activity"] as const,
};

/** The eligible pool and anything else Roulette caches (Task 8). */
export const rouletteKeys = {
  all: ["roulette"] as const,
};
