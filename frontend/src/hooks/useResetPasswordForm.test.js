import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { useResetPasswordForm } from "./useResetPasswordForm";
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

describe("useResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test("rejects a mismatched confirmation locally", async () => {
    const confirmPasswordReset = vi.fn();
    useAuth.mockReturnValue({ confirmPasswordReset });
    const { result } = renderHook(() => useResetPasswordForm("uid123", "tok456"));
    act(() => result.current.setNewPassword("abc12345"));
    act(() => result.current.setConfirmPw("different"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(confirmPasswordReset).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Passwords do not match.");
  });

  test("on success, sets success and navigates to /login after a delay", async () => {
    const confirmPasswordReset = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ confirmPasswordReset });
    const { result } = renderHook(() => useResetPasswordForm("uid123", "tok456"));
    act(() => result.current.setNewPassword("abc12345"));
    act(() => result.current.setConfirmPw("abc12345"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(confirmPasswordReset).toHaveBeenCalledWith("uid123", "tok456", "abc12345", "abc12345");
    expect(result.current.success).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  test("surfaces the backend's new_password field error", async () => {
    const confirmPasswordReset = vi.fn().mockRejectedValue({ response: { data: { new_password: ["Too weak."] } } });
    useAuth.mockReturnValue({ confirmPasswordReset });
    const { result } = renderHook(() => useResetPasswordForm("uid123", "tok456"));
    act(() => result.current.setNewPassword("abc12345"));
    act(() => result.current.setConfirmPw("abc12345"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Too weak.");
  });

  test("falls back to the invalid-link message for any other failure", async () => {
    const confirmPasswordReset = vi.fn().mockRejectedValue({ response: { data: {} } });
    useAuth.mockReturnValue({ confirmPasswordReset });
    const { result } = renderHook(() => useResetPasswordForm("uid123", "tok456"));
    act(() => result.current.setNewPassword("abc12345"));
    act(() => result.current.setConfirmPw("abc12345"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("This reset link is invalid or has expired. Please request a new one.");
  });
});
