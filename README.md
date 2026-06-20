# rjsf-formulas

RJSF extension for computed fields driven by formulas embedded in a JSON schema.

**[Documentation](https://a-ludi.github.io/rjsf-formulas/) · [Live Demo](https://a-ludi.github.io/rjsf-formulas/demo/) · [GitHub](https://github.com/a-ludi/rjsf-formulas)**

## Overview

`rjsf-formulas` is a React library that extends [RJSF](https://github.com/rjsf-team/react-jsonschema-form) with computed fields. Fields marked with a formula key in the JSON schema are evaluated automatically on every data change — the user cannot edit them directly.

```json
{
  "type": "object",
  "properties": {
    "price":    { "type": "number" },
    "quantity": { "type": "number" },
    "total":    { "type": "number", "x-formula": "price * quantity" }
  }
}
```

## Installation

```sh
npm install @a-ludi/rjsf-formulas
```

Peer dependencies: `@rjsf/core ≥ 5`, `@rjsf/utils ≥ 5`, `react ≥ 17`.

## Usage

```tsx
import { FormulaForm } from '@a-ludi/rjsf-formulas'
import validator from '@rjsf/validator-ajv8'
import { Parser } from 'expr-eval'

const parser = new Parser()

function MyForm() {
  return (
    <FormulaForm
      schema={schema}
      validator={validator}
      evaluator={(formula, ctx) => parser.evaluate(formula, ctx)}
    />
  )
}
```

`FormulaForm` is a drop-in replacement for RJSF's `<Form>` — it accepts all the same props.

## Security

**Do not use `eval` as the evaluator with user-supplied formulas.**

`eval` gives untrusted code unrestricted access to the JavaScript environment, which can lead to arbitrary code execution and XSS attacks. If the formulas in your schema come from user input, use a sandboxed evaluator instead:

- [`expr-eval`](https://github.com/silentmatt/expr-eval) — safe parser with no `eval`, supports arithmetic and common math functions
- [`mathjs`](https://mathjs.org/) — full math library with a safe expression parser
- A [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) running a restricted evaluator — strongest isolation

Using `eval` is only appropriate when formulas are authored by trusted developers and shipped as part of the application code.

## Documentation

Full documentation including the Customization guide and API reference is at:  
**<https://a-ludi.github.io/rjsf-formulas/>**

## License

MIT © 2026 Arne Ludwig
