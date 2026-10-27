import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  NsApiError,
  createNsClientFromEnv,
  parsePlaceString,
  planRoute,
  searchPlaces,
  searchStations,
  toPublicPlanResult,
} from "@nsplanner/planner";
import { z } from "zod";

const PlanBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  dateTime: z.string().optional(),
  searchForArrival: z.boolean().optional(),
  maxWalkMeters: z.number().int().positive().max(5000).optional(),
  maxNearby: z.number().int().positive().max(5).optional(),
  topK: z.number().int().positive().max(20).optional(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

app.get("/health", async () => ({ ok: true }));

/** Auth stub — replace with real login later. */
app.get("/api/me", async () => ({
  user: null as null | { id: string; email: string },
  auth: "disabled" as const,
}));

app.get("/api/stations", async (request, reply) => {
  const parsed = SearchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  const client = createNsClientFromEnv();
  const stations = await searchStations(
    client,
    parsed.data.q,
    parsed.data.limit ?? 10,
  );
  return { stations };
});

app.get("/api/places", async (request, reply) => {
  const parsed = SearchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
  }

  const client = createNsClientFromEnv();
  const places = await searchPlaces(client, parsed.data.q, {
    limit: parsed.data.limit ?? 10,
  });
  return { places };
});

app.post("/api/plan", async (request, reply) => {
  const parsed = PlanBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "Ongeldige invoer. Check van- en naaradres.",
    });
  }

  const client = createNsClientFromEnv();
  const result = await planRoute(client, {
    from: parsePlaceString(parsed.data.from),
    to: parsePlaceString(parsed.data.to),
    dateTime: parsed.data.dateTime,
    searchForArrival: parsed.data.searchForArrival,
    maxWalkMeters: parsed.data.maxWalkMeters,
    maxNearby: parsed.data.maxNearby,
    topK: parsed.data.topK,
  });

  const publicResult = toPublicPlanResult(result);
  request.log.info(
    {
      planDebug: publicResult.debug,
      from: publicResult.from.label,
      to: publicResult.to.label,
      optionCount: publicResult.options.length,
    },
    "plan completed",
  );

  // UI payload without technical debug block.
  const { debug: _debug, ...uiResult } = publicResult;
  return uiResult;
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof NsApiError) {
    app.log.warn({ err: error }, "NS API error");
    return reply.code(error.status === 429 ? 429 : 502).send({
      error:
        error.status === 429
          ? "Even te druk bij de reisplanner. Probeer het zo opnieuw."
          : "De reisdienst gaf een fout. Probeer het opnieuw.",
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }

  app.log.error(error);
  const message = error instanceof Error ? error.message : "Unknown error";
  const statusCode =
    typeof error === "object" &&
    error &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;

  if (/could not resolve place/i.test(message)) {
    return reply.code(400).send({
      error:
        "We konden dit adres of station niet vinden. Probeer een andere schrijfwijze.",
    });
  }

  return reply
    .code(statusCode)
    .send({ error: "Er ging iets mis bij het plannen. Probeer het opnieuw." });
});


try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
