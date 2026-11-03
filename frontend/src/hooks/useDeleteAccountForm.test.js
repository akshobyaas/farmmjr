import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useDeleteAccountForm } from "./useDeleteAccountForm";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("useDeleteAccountForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("starts out not confirming, with the confirm step revealed by startConfirming", () => {
    useAuth.mockReturnValue({ deleteAccount: vi.fn() });
    const { result } = renderHook(() => useDeleteAccountForm());
    expect(result.current.confirming).toBe(false);
    act(() => result.current.startConfirming());
    expect(result.current.confirming).toBe(true);
  });

  test("cancelConfirming hides the confirm step and clears the typed password", () => {
    useAuth.mockReturnValue({ deleteAccount: vi.fn() });
    const { result } = renderHook(() => useDeleteAccountForm());
    act(() => result.current.startConfirming());
    act(() => result.current.setPassword("secret"));
    act(() => result.current.cancelConfirming());
    expect(result.current.confirming).toBe(false);
    expect(result.current.password).toBe("");
  });

  test("handleDelete calls deleteAccount with the typed password and navigates to login on success", async () => {
    const deleteAccount = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ deleteAccount });
    const { result } = renderHook(() => useDeleteAccountForm());
    act(() => result.current.setPassword("FarmerPass#123"));
    await act(async () => {
      await result.current.handleDelete({ preventDefault: () => {} });
    });
    expect(deleteAccount).toHaveBeenCalledWith("FarmerPass#123");
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  test("shows the server's incorrect-password message on a wrong password", async () => {
    const deleteAccount = vi.fn().mockRejectedValue({
      response: { status: 400, data: { password: ["Incorrect password."] } },
    });
    useAuth.mockReturnValue({ deleteAccount });
    const { result } = renderHook(() => useDeleteAccountForm());
    await act(async () => {
      await result.current.handleDelete({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Incorrect password.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("shows a generic error on any other failure", async () => {
    const deleteAccount = vi.fn().mockRejectedValue({ response: { status: 500 } });
    useAuth.mockReturnValue({ deleteAccount });
    const { result } = renderHook(() => useDeleteAccountForm());
    await act(async () => {
      await result.current.handleDelete({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Could not delete your account. Please try again.");
  });
});
