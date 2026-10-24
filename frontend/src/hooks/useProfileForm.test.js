import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useProfileForm } from "./useProfileForm";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockProfile = {
  id: 1,
  username: "farmer_ravi",
  email: "ravi@test.com",
  first_name: "Ravi",
  last_name: "K",
  phone_number: "9999999999",
  home_location: "Mysuru",
  preferred_language: "en",
};

describe("useProfileForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("loads the profile on mount", async () => {
    const getProfile = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile, updateProfile: vi.fn() });
    const { result } = renderHook(() => useProfileForm());
    await act(async () => {});
    expect(result.current.form).toEqual(mockProfile);
    expect(result.current.error).toBe("");
  });

  test("sets an error when the profile fails to load", async () => {
    const getProfile = vi.fn().mockRejectedValue(new Error("network"));
    useAuth.mockReturnValue({ getProfile, updateProfile: vi.fn() });
    const { result } = renderHook(() => useProfileForm());
    await act(async () => {});
    expect(result.current.error).toBeTruthy();
    expect(result.current.form).toBeNull();
  });

  test("handleChange updates the named field and clears success", async () => {
    const getProfile = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile, updateProfile: vi.fn() });
    const { result } = renderHook(() => useProfileForm());
    await act(async () => {});
    act(() => result.current.handleChange({ target: { name: "first_name", value: "Ravindra" } }));
    expect(result.current.form.first_name).toBe("Ravindra");
  });

  test("handleSubmit saves the editable fields and sets success", async () => {
    const getProfile = vi.fn().mockResolvedValue(mockProfile);
    const updateProfile = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ getProfile, updateProfile });
    const { result } = renderHook(() => useProfileForm());
    await act(async () => {});
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(updateProfile).toHaveBeenCalledWith({
      first_name: "Ravi",
      last_name: "K",
      phone_number: "9999999999",
      home_location: "Mysuru",
      preferred_language: "en",
    });
    expect(result.current.success).toBe(true);
  });

  test("handleSubmit sets an error on failure", async () => {
    const getProfile = vi.fn().mockResolvedValue(mockProfile);
    const updateProfile = vi.fn().mockRejectedValue(new Error("fail"));
    useAuth.mockReturnValue({ getProfile, updateProfile });
    const { result } = renderHook(() => useProfileForm());
    await act(async () => {});
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.success).toBe(false);
  });
});
