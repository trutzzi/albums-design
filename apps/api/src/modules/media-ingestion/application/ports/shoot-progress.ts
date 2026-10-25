/**
 * Where each shoot stands with its client, for the shoots list: its albums, and the links
 * the client was sent. Read for many shoots at once, so the list stays a handful of queries.
 */
export interface ShootProgress {
  albums: { id: string; status: string }[];
  picks: { status: string; clientName: string; pickedCount: number; submittedAt: string | null }[];
  reviews: { status: string; openComments: number }[];
  deliveries: { status: "ACTIVE" | "EXPIRED" | "REVOKED"; downloadCount: number; daysLeft: number }[];
}

export interface ShootProgressDirectory {
  forProjects(projectIds: string[]): Promise<Map<string, ShootProgress>>;
}
