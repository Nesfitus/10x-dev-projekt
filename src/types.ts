export type UserRole = "admin" | "user";

export interface Profile {
  id: string;
  role: UserRole;
  disabled: boolean;
  created_at: string;
}

export type TournamentStatus = "active" | "closed";

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  status: TournamentStatus;
  created_by: string;
  created_at: string;
}
