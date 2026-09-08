import { describe, expect, it, vi } from "vitest";

import {
  executeDeleteUserData,
  type DeleteUserDataDeps,
} from "@/lib/account/delete-user-data";

function makeDeps(overrides: Partial<DeleteUserDataDeps> = {}): DeleteUserDataDeps & {
  order: string[];
} {
  const order: string[] = [];
  return {
    order,
    deleteActionBatches: vi.fn(async () => {
      order.push("batches");
      return 2;
    }),
    deleteSources: vi.fn(async () => {
      order.push("sources");
      return 5;
    }),
    deleteConnections: vi.fn(async () => {
      order.push("connections");
      return 1;
    }),
    ...overrides,
  };
}

describe("executeDeleteUserData", () => {
  it("deletes batches, sources, then connections and reports counts", async () => {
    const deps = makeDeps();
    const result = await executeDeleteUserData(deps);
    expect(result).toEqual({ actionBatches: 2, sources: 5, connections: 1 });
    expect(deps.order).toEqual(["batches", "sources", "connections"]);
  });

  it("reports zeros when there is nothing to delete", async () => {
    const deps = makeDeps({
      deleteActionBatches: async () => 0,
      deleteSources: async () => 0,
      deleteConnections: async () => 0,
    });
    const result = await executeDeleteUserData(deps);
    expect(result).toEqual({ actionBatches: 0, sources: 0, connections: 0 });
  });

  it("propagates storage failures without masking them", async () => {
    const deps = makeDeps({
      deleteSources: async () => {
        throw new Error("db_delete_failed");
      },
    });
    await expect(executeDeleteUserData(deps)).rejects.toThrow("db_delete_failed");
  });
});
