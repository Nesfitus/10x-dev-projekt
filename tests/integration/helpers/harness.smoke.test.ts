import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient } from "./supabase-test-clients";
import { createTestUser, deleteTestUser } from "./test-user";
import { createLockedMatchFixture, createOpenMatchFixture, deleteMatchFixture } from "./tournament-fixtures";

const adminClient = createTestAdminClient();
let userId: string;

beforeAll(async () => {
  const testUser = await createTestUser(adminClient);
  userId = testUser.userId;
});

// Kolejność: mecze/predykcje przed userem — auth.users nie ma ON DELETE CASCADE
// z matches.created_by / predictions.user_id (patrz plan.md).
afterAll(async () => {
  if (userId) {
    await deleteTestUser(adminClient, userId);
  }
});

describe("integration test harness (smoke)", () => {
  it("tworzy i kasuje zablokowany mecz-fixture podpięty pod istniejący aktywny turniej", async () => {
    const fixture = await createLockedMatchFixture(adminClient, userId);
    expect(fixture.matchId).toBeTruthy();
    expect(fixture.tournamentId).toBeTruthy();

    const { data } = await adminClient.from("matches").select("id").eq("id", fixture.matchId).single();
    expect(data?.id).toBe(fixture.matchId);

    await deleteMatchFixture(adminClient, fixture.matchId);

    const { data: afterDelete } = await adminClient
      .from("matches")
      .select("id")
      .eq("id", fixture.matchId)
      .maybeSingle();
    expect(afterDelete).toBeNull();
  });

  it("tworzy i kasuje otwarty mecz-fixture (przed startem)", async () => {
    const fixture = await createOpenMatchFixture(adminClient, userId);
    expect(fixture.matchId).toBeTruthy();

    await deleteMatchFixture(adminClient, fixture.matchId);
  });
});
