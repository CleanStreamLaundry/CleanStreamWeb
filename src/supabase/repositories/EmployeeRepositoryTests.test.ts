import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmployeeRepository } from "./EmployeeRepository";
import { SupabaseClient } from "@supabase/supabase-js";
import type { AuthService } from "../../interfaces/AuthService";

// ─── Mock Services ────────────────────────────────────────────────────────────

const mockGetUserID = vi.fn<AuthService['getUserID']>();

vi.mock("../../di/container", () => ({
  useAuth: () => ({
    getUserID: mockGetUserID,
  }),
}));

// ─── Supabase Client Mock ─────────────────────────────────────────────────────

const createMockClient = () => {
  const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected fetch'));
  const client = new SupabaseClient('https://example.invalid', 'test-key', {
    accessToken: async () => 'test-token',
    global: { fetch: mockFetch },
  });
  const query = client.from('profiles');
  const roleFilter = query.update({});
  const employeeFilter = query.select();
  const deleteFilter = query.delete();
  const mockFrom = vi.spyOn(client, 'from').mockReturnValue(query);
  const mockUpdate = vi.spyOn(query, 'update').mockReturnValue(roleFilter);
  const mockInsert = vi.spyOn(query, 'insert');
  const mockDelete = vi.spyOn(query, 'delete').mockReturnValue(deleteFilter);
  const mockEq = vi.spyOn(roleFilter, 'eq');
  vi.spyOn(query, 'select').mockReturnValue(employeeFilter);
  const mockNeqChain = vi.spyOn(employeeFilter, 'neq');
  const mockInResolved = vi.spyOn(employeeFilter, 'in');
  const mockLocalEqDelete = vi.spyOn(deleteFilter, 'eq');
  return { client, mockFetch, mockFrom, mockUpdate, mockInsert, mockDelete, mockEq, mockNeqChain, mockInResolved, mockLocalEqDelete };
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockUserID = "uuid-current-admin";
const mockTargetUserID = "uuid-target-user";

const mockAdminForm = {
  email: "john@example.com",
  locationID: 1,
};

const mockEmployeeData = [
  {
    location_id: 1,
    profiles: { full_name: "Alice Smith", email: "alice@example.com" },
  },
  {
    location_id: 2,
    profiles: { full_name: "Bob Jones", email: "bob@example.com" },
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EmployeeRepository", () => {
  let repo: EmployeeRepository;
  let mockFetch: ReturnType<typeof createMockClient>['mockFetch'];
  let mockFrom: ReturnType<typeof createMockClient>['mockFrom'];
  let mockUpdate: ReturnType<typeof createMockClient>['mockUpdate'];
  let mockInsert: ReturnType<typeof createMockClient>['mockInsert'];
  let mockDelete: ReturnType<typeof createMockClient>['mockDelete'];
  let mockEq: ReturnType<typeof createMockClient>['mockEq'];
  let mockNeqChain: ReturnType<typeof createMockClient>['mockNeqChain'];
  let mockInResolved: ReturnType<typeof createMockClient>['mockInResolved'];
  let mockLocalEqDelete: ReturnType<typeof createMockClient>['mockLocalEqDelete'];

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockClient();
    ({ mockFetch, mockFrom, mockUpdate, mockInsert, mockDelete, mockEq, mockNeqChain, mockInResolved, mockLocalEqDelete } = mocks);
    repo = new EmployeeRepository(mocks.client);
    mockGetUserID.mockResolvedValue(mockUserID);
  });

  // ── changeUserRole ────────────────────────────────────────────────────────

  describe("changeUserRole", () => {
    it("queries the profiles table", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));

      await repo.assignAdminRole("john@example.com");

      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });

    it("updates the role to Admin for the given email", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));

      await repo.assignAdminRole("john@example.com");

      expect(mockUpdate).toHaveBeenCalledWith({ roles: "Admin" });
      expect(mockEq).toHaveBeenCalledWith("email", "john@example.com");
    });

    it("returns the user ID from the updated profile", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));

      const result = await repo.assignAdminRole("john@example.com");

      expect(result).toBe(mockTargetUserID);
    });

    it("returns undefined when the response data is empty", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([]));

      const result = await repo.assignAdminRole("john@example.com");

      expect(result).toBeUndefined();
    });

    it("throws when Supabase returns an error", async () => {
      mockFetch.mockResolvedValueOnce(Response.json({ message: "Update failed" }, { status: 400 }));

      await expect(repo.assignAdminRole("john@example.com")).rejects.toThrow(
        "Update failed",
      );
    });
  });

  // ── assignAdminLocation ───────────────────────────────────────────────────

  describe("assignAdminLocation", () => {
    beforeEach(() => {
      // changeUserRole succeeds and resolves the target user ID
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));
    });

    it("inserts into the Location_to_Admin table", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await repo.assignAdminLocation(mockAdminForm);

      expect(mockFrom).toHaveBeenCalledWith("Location_to_Admin");
    });

    it("inserts the correct location and user IDs", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await repo.assignAdminLocation(mockAdminForm);

      expect(mockInsert).toHaveBeenCalledWith({
        location_id: mockAdminForm.locationID,
        user_id: mockTargetUserID,
      });
    });

    it("resolves without a value on success", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await expect(
        repo.assignAdminLocation(mockAdminForm),
      ).resolves.toBeUndefined();
    });

    it("throws when the insert returns an error", async () => {
      mockFetch.mockResolvedValueOnce(Response.json({ message: "Insert failed" }, { status: 400 }));

      await expect(repo.assignAdminLocation(mockAdminForm)).rejects.toThrow(
        "Insert failed",
      );
    });

    it("throws when changeUserRole fails before the insert", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(Response.json({ message: "Profile not found" }, { status: 400 }));

      await expect(repo.assignAdminLocation(mockAdminForm)).rejects.toThrow(
        "Profile not found",
      );
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // ── fetchEmployees ────────────────────────────────────────────────────────

  describe("fetchEmployees", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(Response.json(mockEmployeeData));
    });

    it("queries the Location_to_Admin table", async () => {
      await repo.fetchEmployees([1, 2]);

      expect(mockFrom).toHaveBeenCalledWith("Location_to_Admin");
    });

    it("excludes the current user from results", async () => {
      await repo.fetchEmployees([1, 2]);

      expect(mockNeqChain).toHaveBeenCalledWith("user_id", mockUserID);
    });

    it("filters by the provided location IDs", async () => {
      await repo.fetchEmployees([1, 2]);

      expect(mockInResolved).toHaveBeenCalledWith("location_id", [1, 2]);
    });

    it("maps the response to EmployeeRecord shape", async () => {
      const result = await repo.fetchEmployees([1, 2]);

      expect(result).toEqual([
        { locationID: 1, name: "Alice Smith", email: "alice@example.com" },
        { locationID: 2, name: "Bob Jones", email: "bob@example.com" },
      ]);
    });

    it("returns an empty array when there are no matching employees", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([]));

      const result = await repo.fetchEmployees([1, 2]);

      expect(result).toEqual([]);
    });

    it("handles profiles with missing fields gracefully", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ location_id: 1, profiles: null }]));

      const result = await repo.fetchEmployees([1]);

      expect(result).toEqual([
        { locationID: 1, name: undefined, email: undefined },
      ]);
    });

    it("throws when Supabase returns an error", async () => {
      mockFetch.mockResolvedValueOnce(Response.json({ message: "Fetch failed" }, { status: 400 }));

      await expect(repo.fetchEmployees([1, 2])).rejects.toThrow("Fetch failed");
    });
  });

  // ── removeAdminRole ───────────────────────────────────────────────────────

  describe("removeAdminRole", () => {
    it("queries the profiles table", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));

      await repo.removeAdminRole("john@example.com");

      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });

    it("updates the role to User for the given email", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));

      await repo.removeAdminRole("john@example.com");

      expect(mockUpdate).toHaveBeenCalledWith({ roles: "User" });
      expect(mockEq).toHaveBeenCalledWith("email", "john@example.com");
    });

    it("returns the user ID from the updated profile", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]));

      const result = await repo.removeAdminRole("john@example.com");

      expect(result).toBe(mockTargetUserID);
    });

    it("returns undefined when the response data is empty", async () => {
      mockFetch.mockResolvedValueOnce(Response.json([]));

      const result = await repo.removeAdminRole("john@example.com");

      expect(result).toBeUndefined();
    });

    it("throws when Supabase returns an error", async () => {
      mockFetch.mockResolvedValueOnce(Response.json({ message: "Update failed" }, { status: 400 }));

      await expect(repo.removeAdminRole("john@example.com")).rejects.toThrow(
        "Update failed",
      );
    });
  });

  // ── removeAdminLocation ───────────────────────────────────────────────────

describe("removeAdminLocation", () => {
  beforeEach(() => {
    mockFetch
      .mockResolvedValueOnce(Response.json([{ id: mockTargetUserID }]))
      .mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("deletes from the Location_to_Admin table", async () => {
    await repo.removeAdminLocation("john@example.com");

    expect(mockFrom).toHaveBeenCalledWith("Location_to_Admin");
  });

  it("deletes the row matching the resolved user ID", async () => {
    await repo.removeAdminLocation("john@example.com");

    expect(mockDelete).toHaveBeenCalled();
    expect(mockLocalEqDelete).toHaveBeenCalledWith("user_id", mockTargetUserID);
  });

  it("resolves without a value on success", async () => {
    await expect(
      repo.removeAdminLocation("john@example.com"),
    ).resolves.toBeUndefined();
  });

  it("throws when the delete returns an error", async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ message: "Delete failed" }, { status: 400 }));

    await expect(
      repo.removeAdminLocation("john@example.com"),
    ).rejects.toThrow("Delete failed");
  });

  it("throws when removeAdminRole fails before the delete", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(Response.json({ message: "Profile not found" }, { status: 400 }));

    await expect(
      repo.removeAdminLocation("john@example.com"),
    ).rejects.toThrow("Profile not found");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
});
