import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useResendVerification } from "./useResendVerification";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("useResendVerification", () => {
  beforeEach(() => vi.clearAllMocks());

  test("handleSubmit resends to the typed email and sets submitted", async () => {
    const resendVerification = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ resendVerification, changeUnverifiedEmail: vi.fn() });
    const { result } = renderHook(() => useResendVerification());
    act(() => result.current.setEmail("ravi@test.com"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(resendVerification).toHaveBeenCalledWith("ravi@test.com");
    expect(result.current.submitted).toBe(true);
  });

  test("handleSubmit shows the rate-limit message on a 429", async () => {
    const resendVerification = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ resendVerification, changeUnverifiedEmail: vi.fn() });
    const { result } = renderHook(() => useResendVerification());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Too many requests. Please wait a minute and try again.");
  });

  test("handleChangeEmailSubmit changes the email and sets changeSubmitted", async () => {
    const changeUnverifiedEmail = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ resendVerification: vi.fn(), changeUnverifiedEmail });
    const { result } = renderHook(() => useResendVerification());
    act(() => {
      result.current.setChangeUsername("ravi");
      result.current.setChangePassword("secret");
      result.current.setNewEmail("new@test.com");
    });
    await act(async () => {
      await result.current.handleChangeEmailSubmit({ preventDefault: () => {} });
    });
    expect(changeUnverifiedEmail).toHaveBeenCalledWith("ravi", "secret", "new@test.com");
    expect(result.current.changeSubmitted).toBe(true);
  });

  test("handleChangeEmailSubmit surfaces the backend's non_field_errors message", async () => {
    const changeUnverifiedEmail = vi
      .fn()
      .mockRejectedValue({ response: { data: { non_field_errors: ["Incorrect password."] } } });
    useAuth.mockReturnValue({ resendVerification: vi.fn(), changeUnverifiedEmail });
    const { result } = renderHook(() => useResendVerification());
    await act(async () => {
      await result.current.handleChangeEmailSubmit({ preventDefault: () => {} });
    });
    expect(result.current.changeError).toBe("Incorrect password.");
  });

  test("handleChangeEmailSubmit falls back to a per-field error (new_email)", async () => {
    const changeUnverifiedEmail = vi
      .fn()
      .mockRejectedValue({ response: { data: { new_email: ["Already in use."] } } });
    useAuth.mockReturnValue({ resendVerification: vi.fn(), changeUnverifiedEmail });
    const { result } = renderHook(() => useResendVerification());
    await act(async () => {
      await result.current.handleChangeEmailSubmit({ preventDefault: () => {} });
    });
    expect(result.current.changeError).toBe("Already in use.");
  });
});
