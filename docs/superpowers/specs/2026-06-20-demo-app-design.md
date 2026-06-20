# Demo App Design

## Goal

A browser-based demo app inside the repo that lets you manually test all `rjsf-formulas` features: formula evaluation, debounce timing, async/slow evaluators, loading indicators, and error handling.

## Architecture

Three concerns, each with a clear owner:

- **`tests/schemas.ts`** — single source of truth for demo schemas; also imported by test files
- **`src/FormulaForm.tsx`** — gains enriched-data `onChange` emission
- **`demo/`** — Vite dev app, imports schemas and renders the UI

## FormulaForm change: enriched onChange

`FormulaForm` currently calls `onChange` once, immediately, with raw user input. It needs to also call `onChange` after each completed evaluation with the enriched `formData`.

Add a `useEffect` on `enrichedFormData`, reading `onChange` via a stable ref (same pattern as the hook uses for callbacks) to avoid stale closures:

```ts
const onChangeRef = useRef(onChange)
useEffect(() => { onChangeRef.current = onChange }, [onChange])

useEffect(() => {
  if (formulaFields.length === 0) return
  onChangeRef.current?.({ formData: enrichedFormData as T } as IChangeEvent<T, S, F>, undefined)
}, [enrichedFormData])
```

This fires after every completed evaluation — including the initial mount evaluation. Consumers see two `onChange` calls per user edit: raw immediately, enriched after the debounce. `FormulaForm.test.tsx` must be updated: the `toHaveBeenCalledTimes(1)` assertion becomes `2`, with an added assertion that the second call carries computed values.

## Schema registry — `tests/schemas.ts`

Each schema is a named `export const`. The demo imports the entire module and renders all exports as options.

### `DemoSchema` type

```ts
import type { RJSFSchema } from '@rjsf/utils'

export type DemoSchema = {
  label: string
  schema: RJSFSchema
  formData: Record<string, unknown>
  formulaKey?: string         // default 'x-formula'
  formulaContextKey?: string  // default 'x-formula-context'
  formulaDataKey?: string     // default '__formData__'
  formulaPathKey?: string     // default '__path__'
}
```

### Schemas to define

| Export | Label | Features exercised |
|--------|-------|--------------------|
| `basic` | Basic (price × quantity) | Single computed field, sibling context |
| `convergence` | Convergence (base → double → quad) | Computed field referencing another computed field |
| `arrayItems` | Array items | ARRAY_INDEX expansion, per-row formula |
| `nestedObject` | Nested object | Formula inside a nested object |
| `extendedContext` | Extended context | `x-formula-context: extended`, `__formData__` |
| `customFormulaDataKey` | Custom formulaDataKey | Non-default `formulaDataKey` |
| `customFormulaPathKey` | Custom formulaPathKey | Non-default `formulaPathKey` |
| `customKey` | Custom formula key | Non-default `formulaKey` (`x-calc`) |
| `errorHandling` | Error handling | Formula that throws alongside a working formula |

### Test file refactoring

`tests/FormulaForm.test.tsx` and `tests/enrich.test.ts` import their schemas from `tests/schemas.ts` instead of defining them inline. Tests that use schema properties not in `DemoSchema` (e.g. inline anonymous schemas for edge cases) remain inline.

## Demo app

### File structure

```
demo/
  index.html       Vite entry point
  main.tsx         Mounts <App />
  App.tsx          All demo UI (single file)
  vite.config.ts   Dev server config
```

`package.json` script: `"dev": "vite --config demo/vite.config.ts"`

### `demo/vite.config.ts`

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  esbuild: { jsx: 'automatic' },
})
```

No `@vitejs/plugin-react` needed — esbuild's automatic JSX runtime handles `.tsx` files.

### `App.tsx` layout

Top to bottom:

1. **Schema selector** — `<select>` populated from `Object.values(schemas)`, keyed by `Object.keys(schemas)`
2. **Delay slider** — range input 0–2000 ms with a live label. Defaults to 0.
3. **Status row** — one circle per formula field in the active schema. The demo computes "all concrete paths" by calling `analyzeSchema(schema)` to get `FormulaField[]`, then `expandPaths(field.path, lastFormData)` for each field. A path that appears in `loadingPaths` (from `onLoadingChange`) gets a red filled circle; all others get a green hollow circle. Each circle is labelled with the dot-joined path (e.g. `items.0.total`).
4. **`<FormulaForm>`** — renders the active schema with the async evaluator.
5. **`<pre>` block** — displays `JSON.stringify(lastFormData, null, 2)` in a monospace font. Updated on every `onChange` call.

### State

```ts
const [selectedKey, setSelectedKey] = useState<string>(Object.keys(schemas)[0])
const [delay, setDelay] = useState(0)
const [loadingPaths, setLoadingPaths] = useState<(string | number)[][]>([])
const [lastFormData, setLastFormData] = useState<unknown>(schema.formData)
```

When `selectedKey` changes, reset `lastFormData` to `schema.formData` and `loadingPaths` to `[]`.

### Evaluator

```ts
const evaluator = useCallback(
  async (formula: string, ctx: object) => {
    if (delay > 0) await new Promise(res => setTimeout(res, delay))
    return new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))
  },
  [delay]
)
```

`FormulaForm` reads it via a stable ref, so changing the slider takes effect on the next evaluation without restarting the current debounce.

### Error handling in demo

`onFormulaError` logs each error to the browser console:

```ts
onFormulaError={(path, error) => console.error(`[formula error] ${path.join('.')}:`, error)}
```

The broken field shows as `undefined` in the JSON output and the RJSF form. Opening DevTools → Console lets you inspect the full error while exercising the error-handling schema.

## Testing

No automated tests for the demo app itself. The demo is manually exercised. The `tests/schemas.ts` schemas are validated by the existing automated test suite (which imports from them).
