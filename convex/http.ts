import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

auth.addHttpRoutes(http);

// HTTP endpoint for recording time spent (used by sendBeacon on page unload)
http.route({
  path: "/record-time",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { sessionId, questionId } = body as {
        sessionId: Id<"studentSessions">;
        questionId: Id<"questions">;
      };

      if (sessionId && questionId) {
        await ctx.runMutation(api.studentProgress.recordTimeSpent, {
          sessionId,
          questionId,
        });
      }

      return new Response(null, { status: 204 });
    } catch {
      return new Response(null, { status: 400 });
    }
  }),
});

export default http;
