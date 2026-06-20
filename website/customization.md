# Customization

## Evaluator

The `evaluator` prop is the only required addition to RJSF's standard props. It receives a formula string and a context object, and returns the computed value (or a Promise).

```tsx
<FormulaForm
  schema={schema}
  validator={validator}
  evaluator={(formula, ctx) => myEvaluator(formula, ctx)}
/>
```

You can use any expression library. Popular choices:
- [`expr-eval`](https://github.com/silentmatt/expr-eval) — safe, no `eval`, supports arithmetic and basic functions
- [`mathjs`](https://mathjs.org/) — full math library, supports units and complex numbers
- A Web Worker running a restricted evaluator — best isolation for untrusted input

::: warning Security
**Never use `eval` with user-supplied formulas.** Formulas are evaluated in the browser, and `eval` gives untrusted code full access to the JavaScript environment. Use a sandboxed evaluator instead.
:::

## Async evaluators

If your evaluator returns a Promise, `rjsf-formulas` handles the async lifecycle automatically:

```tsx
<FormulaForm
  schema={schema}
  validator={validator}
  evaluator={async (formula, ctx) => {
    const result = await myRemoteEvaluator(formula, ctx)
    return result
  }}
  onLoadingChange={(paths) => console.log('Evaluating:', paths)}
/>
```

Stale results from superseded evaluations are discarded — if the user types again before an evaluation finishes, the outdated result is never applied.

## Debounce

Formula evaluation is debounced after user input. The default is 300 ms.

```tsx
<FormulaForm
  evaluator={...}
  debounceMs={500}
/>
```

Set `debounceMs={0}` to disable the debounce delay and evaluate on the next event loop tick.

## Schema keys

The formula key and context key are configurable. Use this if `x-formula` conflicts with another tool's schema extensions:

```tsx
<FormulaForm
  evaluator={...}
  formulaKey="x-compute"
  formulaContextKey="x-compute-context"
/>
```

Your schema would then use `x-compute` instead of `x-formula`.

## Context modes

### Siblings (default)

By default, the formula context contains only the sibling fields of the computed field:

```json
{
  "type": "object",
  "properties": {
    "a": { "type": "number" },
    "b": { "type": "number" },
    "sum": { "type": "number", "x-formula": "a + b" }
  }
}
```

In the formula for `sum`, `a` and `b` are available by name.

### Extended

Set `x-formula-context: "extended"` to access the full form data and the field's own path alongside sibling values:

```json
{
  "type": "object",
  "properties": {
    "order": {
      "type": "object",
      "properties": {
        "price":    { "type": "number" },
        "quantity": { "type": "number" }
      }
    },
    "total": {
      "type": "number",
      "x-formula": "__formData__.order.price * __formData__.order.quantity",
      "x-formula-context": "extended"
    }
  }
}
```

The injected keys default to `__formData__` and `__path__`. Override them if a sibling field uses the same name:

```tsx
<FormulaForm
  evaluator={...}
  formulaDataKey="$data"
  formulaPathKey="$path"
/>
```

## Error handling

Provide `onFormulaError` to handle evaluation errors gracefully instead of crashing:

```tsx
<FormulaForm
  evaluator={...}
  onFormulaError={(path, error) => {
    console.error(`Formula error at ${path.join('.')}:`, error.message)
  }}
/>
```

## Loading indicators

Use `onLoadingChange` to show spinners or disabled states while async formulas are running:

```tsx
const [loading, setLoading] = useState(false)

<FormulaForm
  evaluator={...}
  onLoadingChange={(paths) => setLoading(paths.length > 0)}
/>
```

## Swapping the inner Form component

`FormulaForm` renders a `Form` from `@rjsf/core` by default. Pass a themed form to use Bootstrap, Material UI, or another theme:

```tsx
import BootstrapForm from '@rjsf/bootstrap-4'

<FormulaForm
  Form={BootstrapForm}
  evaluator={...}
  schema={schema}
  validator={validator}
/>
```

## Convergence limit

For schemas where one formula field's value feeds into another, `rjsf-formulas` re-evaluates until the output stabilises. The default limit is 10 passes:

```tsx
<FormulaForm
  evaluator={...}
  maxConvergencePasses={5}
/>
```

If the limit is reached without convergence, evaluation stops and the last computed values are used. Circular dependencies will always hit this limit.
