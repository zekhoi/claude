export async function signup(db, mailer, input) {
  const user = await db.users.insert({ email: input.email });
  await mailer.send(input.email, "Welcome!");
  return user;
}
