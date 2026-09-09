export type UserRole = "admin" | "user";

export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
}
