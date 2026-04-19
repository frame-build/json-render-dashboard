# APS showcase model data

This folder stores the Autodesk showcase model metadata snapshot used for the single-model takeoff/estimating workflow.

## Files

### Raw inputs
- `raw/objectTree.json.gz`
- `raw/properties.json.gz`

These two files are related:
- `objectTree.json.gz` provides the model hierarchy and stable `dbId` tree structure.
- `properties.json.gz` provides the full property payload for each `dbId`.

The shared join key is `objectid`.

## Why keep both files?

For this showcase, the tree file is the easiest way to recover domain structure:
- category
- family
- type
- parent instance path

And the properties file is the easiest way to recover the attribute payload:
- `externalId`
- level constraints
- materials
- quantities like length, area, volume, thickness
- custom text fields like `ACTIVIDAD`

Using both together gives a much better normalized dataset than using either file alone.

## Derived output

Run:

```bash
pnpm build:showcase-data
```

This generates:
- `normalized/elements.json.gz`
- `normalized/summary.json`

### `normalized/elements.json.gz`
Compact leaf-element dataset intended for app/runtime use.

Each record includes:
- `dbId`
- `externalId`
- `name`
- `kind`
- `category`
- `family`
- `type`
- `parent`
- `level`
- `topLevel`
- `material`
- `activity`
- selected descriptive fields
- normalized numeric quantities

### `normalized/summary.json`
Facet and coverage summary intended for:
- slicer/filter design
- data inspection
- understanding quantity coverage

## Recommended usage

For this repo's current single-showcase scope, the best workflow is:

1. keep the downloaded APS metadata as raw gz files in `raw/`
2. generate a compact normalized dataset in `normalized/`
3. build filters, cards, charts, and tables from the normalized dataset
4. use the Autodesk Viewer only for model display + `dbId` interaction

This keeps the runtime simple while preserving the full raw source data if normalization rules need to evolve later.
