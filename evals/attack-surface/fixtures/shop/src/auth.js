export async function authenticate(request, reply) {
  const token = request.headers.authorization?.replace("Bearer ", "");
  const user = token ? await request.server.sessions?.get(token) : undefined;
  if (!user) return reply.code(401).send({ error: "unauthorized" });
  request.user = user;
}
