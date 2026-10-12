const users = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
];

export function listUsers(limit) {
  return users.slice(0, limit);
}
