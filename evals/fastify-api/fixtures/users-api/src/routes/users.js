const userSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    email: { type: "string" },
    active: { type: "boolean" },
  },
  required: ["id", "name", "email", "active"],
};

const errorSchema = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
};

export default async function usersRoutes(app) {
  app.get(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        response: { 200: userSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const user = app.users.get(request.params.id);
      if (!user) {
        reply.code(404);
        return { message: "user not found" };
      }
      return user;
    },
  );
}
