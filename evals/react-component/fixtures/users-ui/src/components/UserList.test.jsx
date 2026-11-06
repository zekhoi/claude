import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UserList } from "./UserList.jsx";

const users = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
  { id: 2, name: "Alan Turing", email: "alan@example.com" },
];

describe("UserList", () => {
  it("lists users", () => {
    render(<UserList users={users} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows an empty state", () => {
    render(<UserList users={[]} />);
    expect(screen.getByText("No users yet.")).toBeTruthy();
  });
});
