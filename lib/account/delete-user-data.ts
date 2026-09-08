/**
 * Full local data deletion (M4). Removes every row the user owns:
 * action batches (their items cascade), sources (enrichments,
 * recommendations, and remaining action items cascade), and platform
 * connections. The caller revokes the external OAuth grant best-effort
 * before invoking this — see POST /api/account/delete-data.
 *
 * The auth account itself is kept: the user can sign in again to an
 * empty library. Pure orchestration with injected deps (same pattern as
 * lib/sources/unsubscribe.ts) so counts and ordering are unit-testable.
 */

export interface DeleteUserDataDeps {
  deleteActionBatches(): Promise<number>;
  deleteSources(): Promise<number>;
  deleteConnections(): Promise<number>;
}

export interface DeleteUserDataResult {
  actionBatches: number;
  sources: number;
  connections: number;
}

export async function executeDeleteUserData(
  deps: DeleteUserDataDeps,
): Promise<DeleteUserDataResult> {
  const actionBatches = await deps.deleteActionBatches();
  const sources = await deps.deleteSources();
  const connections = await deps.deleteConnections();
  return { actionBatches, sources, connections };
}
