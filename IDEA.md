# rjsf-formulas

A library that extends [RJSF](https://github.com/rjsf-team/react-jsonschema-form) with computed fields driven by formulas embedded in the JSON schema.

## Core Concept

Certain fields in a JSON schema can be marked as computed by adding a formula under a custom key (configurable by the library user). When the form renders or data changes, the library evaluates the formula and sets the field's value automatically — the user cannot edit it directly.

## Formula Declaration

```json
{
  "type": "object",
  "properties": {
    "price": { "type": "number" },
    "quantity": { "type": "number" },
    "total": {
      "type": "number",
      "x-formula": "price * quantity"
    }
  }
}
```

The custom key (`x-formula` above) is configurable.

## Formula Evaluation

The library user provides a JS function with this responsibility:

- **Input:** a formula string + a context object
- **Output:** the computed value

This keeps the evaluation strategy open — any expression language works. Using `eval` is fine for unit tests.

## Context

**Default context:** the sibling fields of the computed field. In the example above, `price` and `quantity` are available by name.

**Extended context** (opt-in via a second configurable schema key): the full form data plus the path to the computed field. Useful when a formula needs to reference values outside its immediate siblings.

```json
"total": {
  "type": "number",
  "x-formula": "formData.order.price * formData.order.quantity",
  "x-formula-context": "extended"
}
```

## Integration with RJSF

TBD — how the library hooks into RJSF's rendering lifecycle is a design decision left for the implementation phase.
