import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders siswa aktif badge", () => {
    render(<StatusBadge status="aktif" type="siswa" />);
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });

  it("renders presensi hadir badge", () => {
    render(<StatusBadge status="H" type="presensi" />);
    expect(screen.getByText("Hadir")).toBeInTheDocument();
  });

  it("renders pembayaran lunas badge", () => {
    render(<StatusBadge status="lunas" type="pembayaran" />);
    expect(screen.getByText("Lunas")).toBeInTheDocument();
  });

  it("renders pembayaran tunggak badge with bold style", () => {
    render(<StatusBadge status="tunggak" type="pembayaran" />);
    expect(screen.getByText("Tunggakan")).toBeInTheDocument();
  });

  it("renders raw status for unknown status", () => {
    render(<StatusBadge status="unknown_status" type="siswa" />);
    expect(screen.getByText("unknown_status")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<StatusBadge status="aktif" type="siswa" className="custom-class" />);
    const badge = screen.getByText("Aktif");
    expect(badge.className).toContain("custom-class");
  });
});
