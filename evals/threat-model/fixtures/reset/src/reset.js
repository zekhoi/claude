import crypto from "node:crypto";

const tokens = new Map(); // token -> email

export function requestReset(users, email, sendEmail) {
  const user = users.get(email);
  if (!user) return { status: 404, body: { error: "No account with that email" } };
  const token = crypto.createHash("md5").update(email + Date.now()).digest("hex");
  tokens.set(token, email);
  sendEmail(email, `https://app.example.com/reset?token=${token}`);
  return { status: 200, body: { ok: true } };
}

export function resetPassword(users, token, newPassword) {
  const email = tokens.get(token);
  if (!email) return { status: 400, body: { error: "Invalid token" } };
  users.get(email).password = newPassword;
  return { status: 200, body: { ok: true } };
}
