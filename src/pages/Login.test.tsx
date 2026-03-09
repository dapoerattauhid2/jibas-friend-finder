import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";

const mockSignIn = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email and password fields", () => {
    renderLogin();
    expect(screen.getByText("JIBAS")).toBeInTheDocument();
    expect(screen.getByText("Masuk ke Akun")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /masuk/i })).toBeInTheDocument();
  });

  it("shows validation errors for empty fields", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    await waitFor(() => {
      expect(screen.getByText("Format email tidak valid")).toBeInTheDocument();
    });
  });

  it("calls signIn and navigates on success", async () => {
    mockSignIn.mockResolvedValue({ error: null });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@sekolah.sch.id" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("test@sekolah.sch.id", "password123");
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("displays error message on login failure", async () => {
    mockSignIn.mockResolvedValue({ error: "Email atau password salah" });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@sekolah.sch.id" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(screen.getByText("Email atau password salah")).toBeInTheDocument();
    });
  });

  it("toggles password visibility", () => {
    renderLogin();
    const passwordInput = screen.getByPlaceholderText("Masukkan password");
    expect(passwordInput).toHaveAttribute("type", "password");

    // Click the toggle button (ghost button inside password field)
    const toggleButtons = screen.getAllByRole("button");
    const eyeButton = toggleButtons.find((btn) => btn.getAttribute("type") === "button");
    if (eyeButton) {
      fireEvent.click(eyeButton);
      expect(passwordInput).toHaveAttribute("type", "text");
    }
  });
});
