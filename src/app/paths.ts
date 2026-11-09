/** Route paths in one place. Only opaque ids ever appear in URLs. */
export const paths = {
  ideas: "/ideas",
  newIdea: "/ideas/new",
  idea: (id: string) => `/ideas/${id}`,
  editIdea: (id: string) => `/ideas/${id}/edit`,
  plan: "/plan",
  agreed: "/plan/agreed",
} as const;
