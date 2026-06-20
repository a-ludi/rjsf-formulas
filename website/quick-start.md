# Quick Start

## Prerequisites

- An existing project using [RJSF](https://github.com/rjsf-team/react-jsonschema-form) (`@rjsf/core` ≥ 5 and `@rjsf/utils` ≥ 5).
- React ≥ 17.

## Installation

```sh
npm install @a-ludi/rjsf-formulas
```

## Define a schema with computed fields

Add the `x-formula` key to any field you want to compute automatically:

```json
{
  "type": "object",
  "properties": {
    "price":    { "type": "number", "title": "Price" },
    "quantity": { "type": "number", "title": "Quantity" },
    "total":    { "type": "number", "title": "Total", "x-formula": "price * quantity" }
  }
}
```

The `total` field will be kept read-only and updated automatically whenever `price` or `quantity` changes.

## Render the form

Replace RJSF's `<Form>` with `<FormulaForm>` and supply an `evaluator`:

```tsx
import { FormulaForm } from '@a-ludi/rjsf-formulas'
import validator from '@rjsf/validator-ajv8'
import { Parser } from 'expr-eval'

const parser = new Parser()

const schema = {
  type: 'object' as const,
  properties: {
    price:    { type: 'number' as const, title: 'Price' },
    quantity: { type: 'number' as const, title: 'Quantity' },
    total:    { type: 'number' as const, title: 'Total', 'x-formula': 'price * quantity' },
  },
}

export function MyForm() {
  return (
    <FormulaForm
      schema={schema}
      validator={validator}
      evaluator={(formula, ctx) => parser.evaluate(formula, ctx)}
    />
  )
}
```

`FormulaForm` accepts all the same props as RJSF's `<Form>`, so you can add `formData`, `onChange`, `onSubmit`, custom widgets, and everything else you would normally use.

## What happens

1. On mount, `total` is computed from the initial `price` and `quantity` values.
2. When the user changes `price` or `quantity`, the formula is re-evaluated (debounced by 300 ms by default).
3. The `total` field is rendered as read-only — the user cannot edit it directly.

## Next steps

- See [Customization](/customization) for all available props.
- Try the [live demo](https://a-ludi.github.io/rjsf-formulas/demo/) to explore different schema configurations interactively.
