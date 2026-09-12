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

export interface Match {
  id: string;
  tournament_id: string;
  home_team: string;
  away_team: string;
  scheduled_at: string;
  actual_home_score: number | null;
  actual_away_score: number | null;
  created_by: string;
  created_at: string;
}

export interface Prediction {
  id: string;
  match_id: string;
  user_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  points: number | null;
  created_at: string;
}
