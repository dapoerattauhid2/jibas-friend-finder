import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCard } from "./StatsCard";
import { Users } from "lucide-react";

describe("StatsCard", () => {
  it("renders title and value", () => {
    render(<StatsCard title="Total Siswa" value={150} icon={Users} />);
    expect(screen.getByText("Total Siswa")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<StatsCard title="Revenue" value="Rp 5.000.000" icon={Users} />);
    expect(screen.getByText("Rp 5.000.000")).toBeInTheDocument();
  });

  it("renders positive trend", () => {
    render(<StatsCard title="Siswa" value={100} icon={Users} trend={{ value: 12, label: "dari bulan lalu" }} />);
    expect(screen.getByText("+12%")).toBeInTheDocument();
    expect(screen.getByText("dari bulan lalu")).toBeInTheDocument();
  });

  it("renders negative trend", () => {
    render(<StatsCard title="Tunggakan" value={5} icon={Users} trend={{ value: -8 }} />);
    expect(screen.getByText("-8%")).toBeInTheDocument();
  });

  it("renders zero trend", () => {
    render(<StatsCard title="Stabil" value={50} icon={Users} trend={{ value: 0 }} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
