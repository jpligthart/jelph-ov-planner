#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// npm workspaces run from apps/<name>, so also look for the repo-root .env.
// Existing env vars (e.g. Docker env_file) always win.
loadEnv({
  path: [".env", fileURLToPath(new URL("../../../.env", import.meta.url))],
  quiet: true,
});
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createNsClientFromEnv,
  parsePlaceString,
  planRoute,
  searchPlaces,
  searchStations,
  toPublicPlanResult,
} from "@jelph/planner";
import { z } from "zod";

const PlanRouteSchema = z.object({
  from: z
    .string()
    .describe(
      'Origin: address, stop, station name/code, or "lat,lng"',
    ),
  to: z
    .string()
    .describe('Destination: address, stop, station name/code, or "lat,lng"'),
  dateTime: z
    .string()
    .optional()
    .describe("ISO-8601 departure or arrival datetime"),
  searchForArrival: z
    .boolean()
    .optional()
    .describe("If true, dateTime is the desired arrival time"),
  maxWalkMeters: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max walking distance to nearby hubs (default 1200)"),
  maxNearby: z
    .number()
    .int()
    .positive()
    .max(5)
    .optional()
    .describe("Max nearby hubs per side (default 3)"),
  topK: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Max ranked options to return (default 8)"),
});

const SearchStationsSchema = z.object({
  query: z.string().describe("Station name or code to search for"),
  limit: z.number().int().positive().max(50).optional(),
});

const SearchPlacesSchema = z.object({
  query: z
    .string()
    .describe("Free text: address, stop or station (e.g. Domplein 11 Utrecht)"),
  limit: z.number().int().positive().max(50).optional(),
});

const server = new Server(
  { name: "jelph-ov-planner", version: "0.3.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "plan_route",
      description:
        "Smart door-to-door planner (address/stop/station). Uses NS multimodal trips (bus/tram/metro/train) and fans out over nearby hubs when a longer walk may win.",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: 'Origin: address, stop, station, or "lat,lng"',
          },
          to: {
            type: "string",
            description: 'Destination: address, stop, station, or "lat,lng"',
          },
          dateTime: {
            type: "string",
            description: "ISO-8601 departure or arrival datetime",
          },
          searchForArrival: {
            type: "boolean",
            description: "If true, dateTime is desired arrival time",
          },
          maxWalkMeters: {
            type: "number",
            description: "Max walk to nearby hub (default 1200)",
          },
          maxNearby: {
            type: "number",
            description: "Max nearby hubs per side (default 3)",
          },
          topK: {
            type: "number",
            description: "Max ranked options (default 8)",
          },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "search_places",
      description:
        "Autocomplete addresses, stops and stations via NS Places API.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free text query",
          },
          limit: {
            type: "number",
            description: "Max results (default 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "search_stations",
      description: "Search NS train stations by name or code.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Station name or code",
          },
          limit: {
            type: "number",
            description: "Max results (default 10)",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const client = createNsClientFromEnv();
    const args = request.params.arguments ?? {};

    if (request.params.name === "plan_route") {
      const parsed = PlanRouteSchema.parse(args);
      const result = await planRoute(client, {
        from: parsePlaceString(parsed.from),
        to: parsePlaceString(parsed.to),
        dateTime: parsed.dateTime,
        searchForArrival: parsed.searchForArrival,
        maxWalkMeters: parsed.maxWalkMeters,
        maxNearby: parsed.maxNearby,
        topK: parsed.topK,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(toPublicPlanResult(result), null, 2),
          },
        ],
      };
    }

    if (request.params.name === "search_places") {
      const parsed = SearchPlacesSchema.parse(args);
      const places = await searchPlaces(client, parsed.query, {
        limit: parsed.limit ?? 10,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(places, null, 2) }],
      };
    }

    if (request.params.name === "search_stations") {
      const parsed = SearchStationsSchema.parse(args);
      const stations = await searchStations(
        client,
        parsed.query,
        parsed.limit ?? 10,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(stations, null, 2),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
