const todos = [];
let nextId = 1;

export function addTodo(title) {
  if (typeof title !== "string" || title.trim() === "") {
    throw new Error("title is required");
  }
  const todo = { id: nextId++, title: title.trim(), done: false };
  todos.push(todo);
  return todo;
}

export function listTodos() {
  return [...todos];
}
