import assert from "node:assert/strict";
import { test } from "node:test";
import { addTodo, listTodos } from "./todos.js";

test("adds a todo", () => {
  const todo = addTodo("  write docs ");
  assert.equal(todo.title, "write docs");
  assert.ok(listTodos().some((t) => t.id === todo.id));
});
