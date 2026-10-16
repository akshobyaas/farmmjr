import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordInput from "./PasswordInput";

function renderLabeled(props = {}) {
  render(
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" value="" onChange={() => {}} {...props} />
    </>
  );
}

describe("PasswordInput", () => {
  it("renders masked (type=password) by default, with a 'Show password' toggle", () => {
    renderLabeled();
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /show password/i })).toBeInTheDocument();
  });

  it("reveals the value as plain text when the toggle is clicked, and re-masks on a second click", async () => {
    renderLabeled();
    const toggle = screen.getByRole("button", { name: /show password/i });

    await userEvent.click(toggle);
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /show password/i })).toBeInTheDocument();
  });

  it("passes other input props straight through to the underlying input", () => {
    renderLabeled({ autoComplete: "new-password", required: true });
    const input = screen.getByLabelText(/^password$/i);
    expect(input).toHaveAttribute("autoComplete", "new-password");
    expect(input).toBeRequired();
  });

  it("does not submit the form when the toggle button is clicked", async () => {
    let submitted = false;
    render(
      <form onSubmit={(e) => { e.preventDefault(); submitted = true; }}>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" value="" onChange={() => {}} />
      </form>
    );
    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(submitted).toBe(false);
  });
});
