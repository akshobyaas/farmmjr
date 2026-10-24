import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useLoginForm } from "./useLoginForm";
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

describe("useLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("navigates to the dashboard on successful login", async () => {
    const login = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ login });
    const { result } = renderHook(() => useLoginForm());
    act(() => {
      result.current.setUsername("ravi");
      result.current.setPassword("secret");
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(login).toHaveBeenCalledWith("ravi", "secret");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  test("a 429 shows the rate-limit message", async () => {
    const login = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ login });
    const { result } = renderHook(() => useLoginForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Too many attempts. Please wait a minute and try again.");
    expect(result.current.needsVerification).toBe(false);
  });

  test("an email_not_verified code shows the verification message and flag", async () => {
    const login = vi.fn().mockRejectedValue({ response: { data: { code: ["email_not_verified"] } } });
    useAuth.mockReturnValue({ login });
    const { result } = renderHook(() => useLoginForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Please verify your email address before logging in.");
    expect(result.current.needsVerification).toBe(true);
  });

  test("any other failure shows the generic incorrect-credentials message", async () => {
    const login = vi.fn().mockRejectedValue({ response: { status: 400 } });
    useAuth.mockReturnValue({ login });
    const { result } = renderHook(() => useLoginForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Incorrect username or password. Please try again.");
  });
});
