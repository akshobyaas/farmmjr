import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useForgotPasswordForm } from "./useForgotPasswordForm";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("useForgotPasswordForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("handleSubmit requests a reset for the typed email and sets submitted", async () => {
    const requestPasswordReset = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ requestPasswordReset });
    const { result } = renderHook(() => useForgotPasswordForm());
    act(() => result.current.setEmail("ravi@test.com"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(requestPasswordReset).toHaveBeenCalledWith("ravi@test.com");
    expect(result.current.submitted).toBe(true);
  });

  test("shows the rate-limit message on a 429", async () => {
    const requestPasswordReset = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ requestPasswordReset });
    const { result } = renderHook(() => useForgotPasswordForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Too many requests. Please wait a minute and try again.");
  });

  test("shows the generic error on any other failure", async () => {
    const requestPasswordReset = vi.fn().mockRejectedValue({ response: { status: 500 } });
    useAuth.mockReturnValue({ requestPasswordReset });
    const { result } = renderHook(() => useForgotPasswordForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Something went wrong. Please try again.");
  });
});
