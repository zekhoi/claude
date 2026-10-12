import crypto from "node:crypto";

const JWT_SECRET = "s3cr3t-shop-signing-key";

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function currentUser(req) {
  const [body] = (req.headers.authorization ?? "").replace("Bearer ", "").split(".");
  return body ? JSON.parse(Buffer.from(body, "base64url").toString()) : undefined;
}
