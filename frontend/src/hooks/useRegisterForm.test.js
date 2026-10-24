import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useRegisterForm } from "./useRegisterForm";
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

describe("useRegisterForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("getPasswordHints: a short password fails minLength", () => {
    useAuth.mockReturnValue({ register: vi.fn() });
    const { result } = renderHook(() => useRegisterForm());
    act(() => result.current.handleChange({ target: { name: "password", value: "abc" } }));
    expect(result.current.hints).toEqual({ minLength: false, notAllNumeric: true });
  });

  test("getPasswordHints: an all-numeric password fails notAllNumeric", () => {
    useAuth.mockReturnValue({ register: vi.fn() });
    const { result } = renderHook(() => useRegisterForm());
    act(() => result.current.handleChange({ target: { name: "password", value: "12345678" } }));
    expect(result.current.hints).toEqual({ minLength: true, notAllNumeric: false });
  });

  test("handleSubmit rejects a mismatched password confirmation locally", async () => {
    const register = vi.fn();
    useAuth.mockReturnValue({ register });
    const { result } = renderHook(() => useRegisterForm());
    act(() => result.current.handleChange({ target: { name: "password", value: "password1" } }));
    act(() => result.current.handleChange({ target: { name: "password_confirm", value: "password2" } }));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(register).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Passwords do not match.");
  });

  test("handleSubmit registers as a farmer and navigates to /login on success", async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ register });
    const { result } = renderHook(() => useRegisterForm());
    act(() => result.current.handleChange({ target: { name: "username", value: "ravi" } }));
    act(() => result.current.handleChange({ target: { name: "password", value: "password1" } }));
    act(() => result.current.handleChange({ target: { name: "password_confirm", value: "password1" } }));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ username: "ravi", role: "farmer" }));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  test("handleSubmit surfaces the backend's first field error", async () => {
    const register = vi.fn().mockRejectedValue({ response: { data: { username: ["Already taken."] } } });
    useAuth.mockReturnValue({ register });
    const { result } = renderHook(() => useRegisterForm());
    act(() => result.current.handleChange({ target: { name: "password", value: "password1" } }));
    act(() => result.current.handleChange({ target: { name: "password_confirm", value: "password1" } }));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Already taken.");
  });
});
