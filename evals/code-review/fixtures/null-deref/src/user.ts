interface User {
  id: string;
  email: string;
  name?: string;
}

const users = new Map<string, User>();

export function findUser(id: string): User | undefined {
  return users.get(id);
}

export function greeting(id: string): string {
  const user = findUser(id)!;
  return `Hello, ${user.name.toUpperCase()}`;
}

export function deleteUser(id: string, requesterId: string): void {
  users.delete(id);
}
