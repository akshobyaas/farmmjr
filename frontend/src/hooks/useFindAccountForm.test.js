import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useFindAccountForm } from "./useFindAccountForm";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("useFindAccountForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("handleSubmit requests the account for the typed email and sets submitted", async () => {
    const findAccount = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ findAccount });
    const { result } = renderHook(() => useFindAccountForm());
    act(() => result.current.setEmail("ravi@test.com"));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(findAccount).toHaveBeenCalledWith("ravi@test.com");
    expect(result.current.submitted).toBe(true);
  });

  test("shows the rate-limit message on a 429", async () => {
    const findAccount = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ findAccount });
    const { result } = renderHook(() => useFindAccountForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Too many requests. Please wait a minute and try again.");
  });

  test("shows the generic error on any other failure", async () => {
    const findAccount = vi.fn().mockRejectedValue({ response: { status: 500 } });
    useAuth.mockReturnValue({ findAccount });
    const { result } = renderHook(() => useFindAccountForm());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Something went wrong. Please try again.");
  });
});
