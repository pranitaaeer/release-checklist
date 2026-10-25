
import { describe, it, expect, vi } from "vitest";
import { createResolvers, steps } from "../schema.js";

function createMockPool() {
  return {
    query: vi.fn(),
  } as any;
}

describe("Release Checklist GraphQL resolvers", () => {
  it("returns all checklist steps", () => {
    const pool = createMockPool();
    const resolvers = createResolvers(pool);

    expect(resolvers.Query.checklistSteps()).toEqual(steps);
    expect(steps).toHaveLength(10);
  });

  it("returns releases ordered by date", async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 1,
          name: "Release A",
          release_date: "2026-11-01",
          additional_info: "First release",
          completed_steps: [],
        },
      ],
    });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Query.releases();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Release A");
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT * FROM releases ORDER BY release_date ASC, id DESC",
    );
  });

  it("returns null when a release does not exist", async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rows: [] });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Query.release(null, { id: "999" });

    expect(result).toBeNull();
  });

  it("rejects an empty release name", async () => {
    const pool = createMockPool();
    const resolvers = createResolvers(pool);

    await expect(
      resolvers.Mutation.createRelease(null, {
        name: "   ",
        date: "2026-11-01",
      }),
    ).rejects.toThrow("Release name is required");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects a date with the wrong format", async () => {
    const pool = createMockPool();
    const resolvers = createResolvers(pool);

    await expect(
      resolvers.Mutation.createRelease(null, {
        name: "Release B",
        date: "01-11-2026",
      }),
    ).rejects.toThrow("Date must use YYYY-MM-DD format");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("creates a release and trims its name", async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 12,
          name: "Release B",
          release_date: "2026-11-01",
          additional_info: "Demo",
          completed_steps: [],
        },
      ],
    });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Mutation.createRelease(null, {
      name: "  Release B  ",
      date: "2026-11-01",
      additionalInfo: "Demo",
    });

    expect(result.name).toBe("Release B");
    expect(result.id).toBe("12");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO releases"),
      ["Release B", "2026-11-01", "Demo"],
    );
  });

  it("updates a release's additional information", async () => {
    const pool = createMockPool();

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: "Release A",
          release_date: "2026-11-01",
          additional_info: "Old info",
          completed_steps: [],
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: "Release A",
          release_date: "2026-11-01",
          additional_info: "Updated info",
          completed_steps: [],
        }],
      });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Mutation.updateRelease(null, {
      id: "1",
      additionalInfo: "Updated info",
    });

    expect(result.additionalInfo).toBe("Updated info");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid checklist step index", async () => {
    const pool = createMockPool();
    const resolvers = createResolvers(pool);

    await expect(
      resolvers.Mutation.toggleStep(null, {
        id: "1",
        stepIndex: 10,
        completed: true,
      }),
    ).rejects.toThrow("Invalid checklist step");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("toggles a checklist step to completed", async () => {
    const pool = createMockPool();

    pool.query
      .mockResolvedValueOnce({
        rows: [{ completed_steps: [] }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: "Release A",
          release_date: "2026-11-01",
          additional_info: "",
          completed_steps: [0],
        }],
      });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Mutation.toggleStep(null, {
      id: "1",
      stepIndex: 0,
      completed: true,
    });

    expect(result.completedSteps).toEqual([0]);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it("deletes a release and returns true when a row is deleted", async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rowCount: 1 });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Mutation.deleteRelease(null, {
      id: "1",
    });

    expect(result).toBe(true);
  });

  it("returns false when no release was deleted", async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValue({ rowCount: 0 });

    const resolvers = createResolvers(pool);
    const result = await resolvers.Mutation.deleteRelease(null, {
      id: "999",
    });

    expect(result).toBe(false);
  });
});
