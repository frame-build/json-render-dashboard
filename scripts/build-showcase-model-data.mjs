/* global process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const rawDir = path.join(repoRoot, "data", "aps", "showcase", "raw");
const normalizedDir = path.join(repoRoot, "data", "aps", "showcase", "normalized");

const OBJECT_TREE_PATH = path.join(rawDir, "objectTree.json.gz");
const PROPERTIES_PATH = path.join(rawDir, "properties.json.gz");
const ELEMENTS_OUTPUT_PATH = path.join(normalizedDir, "elements.json.gz");
const SUMMARY_OUTPUT_PATH = path.join(normalizedDir, "summary.json");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanString(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function normalizeLevelName(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  return cleaned.replace(/^Up to level:\s*/i, "").trim();
}

function parseMeasurement(value) {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return { value: null, unit: null };
  }

  const match = cleaned.match(/^(-?\d+(?:[.,]\d+)?)(?:\s*(.*))?$/);
  if (!match) {
    return { value: null, unit: null };
  }

  return {
    value: Number(match[1].replace(",", ".")),
    unit: cleanString(match[2] ?? null),
  };
}

function incrementCounter(map, value) {
  const cleaned = cleanString(value);
  if (!cleaned) return;
  map.set(cleaned, (map.get(cleaned) ?? 0) + 1);
}

function serializeFacetMap(map) {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.value.localeCompare(b.value);
    });
}

function kindFromDepth(depth) {
  if (depth <= 2) return "reference-level";
  if (depth === 3) return "direct-instance";
  if (depth === 5) return "instance";
  if (depth >= 6) return "subcomponent";
  return "group";
}

async function readGzipJson(filePath) {
  const compressed = await readFile(filePath);
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

function buildPathMaps(rootObjects) {
  const pathById = new Map();
  const leafIds = new Set();

  function walk(nodes, pathNames = []) {
    for (const node of nodes ?? []) {
      const nextPathNames = [...pathNames, cleanString(node.name) ?? `#${node.objectid}`];
      pathById.set(node.objectid, nextPathNames);

      if (Array.isArray(node.objects) && node.objects.length > 0) {
        walk(node.objects, nextPathNames);
      } else {
        leafIds.add(node.objectid);
      }
    }
  }

  walk(rootObjects);

  return { pathById, leafIds };
}

async function main() {
  await mkdir(normalizedDir, { recursive: true });

  const objectTree = await readGzipJson(OBJECT_TREE_PATH);
  const properties = await readGzipJson(PROPERTIES_PATH);

  const { pathById, leafIds } = buildPathMaps(objectTree.data.objects);

  const quantityUnits = {
    length: null,
    area: null,
    volume: null,
    width: null,
    height: null,
    thickness: null,
    perimeter: null,
  };

  const quantityCoverage = {
    length: 0,
    area: 0,
    volume: 0,
    width: 0,
    height: 0,
    thickness: 0,
    perimeter: 0,
  };

  const kindCounts = new Map();
  const categoryCounts = new Map();
  const familyCounts = new Map();
  const typeCounts = new Map();
  const levelCounts = new Map();
  const materialCounts = new Map();
  const activityCounts = new Map();

  const elements = [];

  for (const record of properties.data.collection) {
    if (!leafIds.has(record.objectid)) {
      continue;
    }

    const pathNames = pathById.get(record.objectid) ?? [];
    const depth = pathNames.length;
    const kind = kindFromDepth(depth);

    const groups = record.properties ?? {};
    const identity = groups["Identity Data"] ?? {};
    const dimensions = groups.Dimensions ?? {};
    const constraints = groups.Constraints ?? {};
    const materials = groups["Materials and Finishes"] ?? {};
    const construction = groups.Construction ?? {};
    const text = groups.Text ?? {};

    const quantities = {
      length: parseMeasurement(dimensions.Length ?? construction.Length ?? null),
      area: parseMeasurement(dimensions.Area ?? null),
      volume: parseMeasurement(dimensions.Volume ?? null),
      width: parseMeasurement(dimensions.Width ?? construction.Width ?? null),
      height: parseMeasurement(
        dimensions.Height ?? constraints["Unconnected Height"] ?? null,
      ),
      thickness: parseMeasurement(
        dimensions.Thickness ?? construction.Thickness ?? null,
      ),
      perimeter: parseMeasurement(dimensions.Perimeter ?? null),
    };

    for (const key of Object.keys(quantities)) {
      const quantity = quantities[key];
      if (quantity.value != null) {
        quantityCoverage[key] += 1;
        quantityUnits[key] ??= quantity.unit;
      }
    }

    const element = {
      dbId: record.objectid,
      externalId: cleanString(record.externalId),
      name: cleanString(record.name),
      kind,
      category: cleanString(pathNames[1]),
      family: cleanString(pathNames[2]),
      type: cleanString(pathNames[3]),
      parent: cleanString(pathNames.at(-2) ?? null),
      level: normalizeLevelName(
        constraints["Base Constraint"] ?? constraints["Reference Level"] ?? null,
      ),
      topLevel: normalizeLevelName(constraints["Top Constraint"] ?? null),
      material: cleanString(
        materials["Structural Material"] ?? materials.Material ?? null,
      ),
      activity: cleanString(text.ACTIVIDAD ?? null),
      typeName: cleanString(identity["Type Name"] ?? null),
      comments: cleanString(identity.Comments ?? null),
      finish: cleanString(materials.Finish ?? null),
      function: cleanString(construction.Function ?? null),
      quantities: {
        length: quantities.length.value,
        area: quantities.area.value,
        volume: quantities.volume.value,
        width: quantities.width.value,
        height: quantities.height.value,
        thickness: quantities.thickness.value,
        perimeter: quantities.perimeter.value,
      },
    };

    elements.push(element);

    incrementCounter(kindCounts, kind);
    incrementCounter(categoryCounts, element.category);
    incrementCounter(familyCounts, element.family);
    incrementCounter(typeCounts, element.type ?? element.typeName);
    incrementCounter(levelCounts, element.level);
    incrementCounter(materialCounts, element.material);
    incrementCounter(activityCounts, element.activity);
  }

  const summary = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      objectTree: path.relative(repoRoot, OBJECT_TREE_PATH),
      properties: path.relative(repoRoot, PROPERTIES_PATH),
    },
    counts: {
      totalNodes: pathById.size,
      leafNodes: elements.length,
      quantifiableLeafNodes: elements.filter((element) =>
        Object.values(element.quantities).some((value) => value != null),
      ).length,
    },
    quantityCoverage,
    quantityUnits,
    facets: {
      kinds: serializeFacetMap(kindCounts),
      categories: serializeFacetMap(categoryCounts),
      families: serializeFacetMap(familyCounts),
      types: serializeFacetMap(typeCounts),
      levels: serializeFacetMap(levelCounts),
      materials: serializeFacetMap(materialCounts),
      activities: serializeFacetMap(activityCounts),
    },
  };

  const dataset = {
    version: 1,
    generatedAt: summary.generatedAt,
    quantityUnits,
    elements,
  };

  await writeFile(ELEMENTS_OUTPUT_PATH, gzipSync(JSON.stringify(dataset)));
  await writeFile(SUMMARY_OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote ${path.relative(repoRoot, ELEMENTS_OUTPUT_PATH)}`);
  console.log(`Wrote ${path.relative(repoRoot, SUMMARY_OUTPUT_PATH)}`);
  console.log(`Leaf nodes: ${summary.counts.leafNodes}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
