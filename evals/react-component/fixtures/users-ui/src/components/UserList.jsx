export function UserList({ users }) {
  if (users.length === 0) return <p>No users yet.</p>;
  return (
    <ul aria-label="Users">
      {users.map((user) => (
        <li key={user.id}>
          {user.name} <span>({user.email})</span>
        </li>
      ))}
    </ul>
  );
}
