#!/usr/bin/env node
import "dotenv/config";
import {
  createNsClientFromEnv,
  parsePlaceString,
  planRoute,
  searchStations,
  toPublicPlanResult,
} from "@nsplanner/planner";

function usage(): never {
  console.log(`NS Smart Planner CLI

Usage:
  npm run cli -- plan --from <place> --to <place> [options]
  npm run cli -- stations <query>

Place can be a station name/code (e.g. "Utrecht Centraal", ASD)
or coordinates as "lat,lng" (e.g. "52.0907,5.1214").

Options for plan:
  --from <place>          Origin (required)
  --to <place>            Destination (required)
  --when <ISO datetime>   Departure (or arrival if --arrive)
  --arrive                Treat --when as arrival time
  --walk <meters>         Max walk to nearby station (default 1200)
  --nearby <n>            Max nearby stations per side (default 3)
  --top <n>               Max ranked options to show (default 8)
  --json                  Print full JSON instead of a table
`);
  process.exit(1);
  throw new Error("unreachable");
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function cmdStations(query: string): Promise<void> {
  const client = createNsClientFromEnv();
  const stations = await searchStations(client, query, 15);
  if (stations.length === 0) {
    console.log("No stations found.");
    return;
  }
  for (const s of stations) {
    console.log(
      `${s.code.padEnd(6)} ${s.name}  (${s.lat.toFixed(5)}, ${s.lng.toFixed(5)})`,
    );
  }
}

async function cmdPlan(args: string[]): Promise<void> {
  const fromRaw = getFlag(args, "--from");
  const toRaw = getFlag(args, "--to");
  if (!fromRaw || !toRaw) usage();

  const when = getFlag(args, "--when");
  const walk = Number(getFlag(args, "--walk") ?? "1200");
  const nearby = Number(getFlag(args, "--nearby") ?? "3");
  const top = Number(getFlag(args, "--top") ?? "8");
  const asJson = hasFlag(args, "--json");
  const arrive = hasFlag(args, "--arrive");

  const client = createNsClientFromEnv();
  const result = await planRoute(client, {
    from: parsePlaceString(fromRaw),
    to: parsePlaceString(toRaw),
    dateTime: when,
    searchForArrival: arrive,
    maxWalkMeters: walk,
    maxNearby: nearby,
    topK: top,
  });

  const publicResult = toPublicPlanResult(result);

  if (asJson) {
    console.log(JSON.stringify(publicResult, null, 2));
    return;
  }

  console.log(`Van: ${publicResult.from.label}`);
  console.log(`Naar: ${publicResult.to.label}`);
  console.log("");

  if (publicResult.options.length === 0) {
    console.log("Geen reis gevonden.");
    if (publicResult.debug.warnings.length > 0) {
      console.error(publicResult.debug.warnings.join("\n"));
    }
    return;
  }

  for (const [i, option] of publicResult.options.entries()) {
    console.log(
      `${i + 1}. ${option.totalDoorToDoorMinutes} min · ${option.transfers} overstappen` +
        (option.departure ? ` · ${option.departure}` : "") +
        (option.arrival ? ` → ${option.arrival}` : ""),
    );
    if (option.notes.length > 0) {
      console.log(`   ${option.notes.join(" · ")}`);
    }
    for (const leg of option.legs) {
      console.log(
        `   - ${leg.modality ?? "leg"}: ${leg.origin} → ${leg.destination}`,
      );
    }
    console.log("");
  }

  // Technical details for CLI operators only.
  console.error(
    `[debug] queries=${publicResult.debug.queriedCombinations} transitous=${publicResult.debug.transitousUsed} d2d=${publicResult.debug.doorToDoorAvailable}`,
  );
  if (publicResult.debug.warnings.length > 0) {
    console.error(`[debug] ${publicResult.debug.warnings.join(" | ")}`);
  }
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
  }

  if (command === "stations") {
    const query = rest.join(" ").trim();
    if (!query) usage();
    await cmdStations(query);
    return;
  }

  if (command === "plan") {
    await cmdPlan(rest);
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
