import type { RJSFSchema } from '@rjsf/utils'

export type DemoSchema = {
  label: string
  schema: RJSFSchema
  formData: Record<string, unknown>
  formulaKey?: string
  formulaContextKey?: string
  formulaDataKey?: string
  formulaPathKey?: string
}

export const basic: DemoSchema = {
  label: 'Basic (price × quantity)',
  schema: {
    type: 'object',
    properties: {
      price: { type: 'number' },
      quantity: { type: 'number' },
      total: { type: 'number', 'x-formula': 'price * quantity' },
    },
  } as unknown as RJSFSchema,
  formData: { price: 10, quantity: 3, total: 0 },
}

export const convergence: DemoSchema = {
  label: 'Convergence (base → double → quad)',
  schema: {
    type: 'object',
    properties: {
      base: { type: 'number' },
      double: { type: 'number', 'x-formula': 'base * 2' },
      quad: { type: 'number', 'x-formula': 'double * 2' },
    },
  } as unknown as RJSFSchema,
  formData: { base: 5, double: 0, quad: 0 },
}

export const arrayItems: DemoSchema = {
  label: 'Array items',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            quantity: { type: 'number' },
            total: { type: 'number', 'x-formula': 'price * quantity' },
          },
        },
      },
    },
  } as unknown as RJSFSchema,
  formData: {
    items: [
      { price: 10, quantity: 2, total: 0 },
      { price: 5, quantity: 4, total: 0 },
    ],
  },
}

export const nestedObject: DemoSchema = {
  label: 'Nested object',
  schema: {
    type: 'object',
    properties: {
      order: {
        type: 'object',
        properties: {
          price: { type: 'number' },
          quantity: { type: 'number' },
          total: { type: 'number', 'x-formula': 'price * quantity' },
        },
      },
    },
  } as unknown as RJSFSchema,
  formData: { order: { price: 4, quantity: 5, total: 0 } },
}

export const extendedContext: DemoSchema = {
  label: 'Extended context',
  schema: {
    type: 'object',
    properties: {
      tax: { type: 'number' },
      subtotal: { type: 'number' },
      total: {
        type: 'number',
        'x-formula': '__formData__.tax + __formData__.subtotal',
        'x-formula-context': 'extended',
      },
    },
  } as unknown as RJSFSchema,
  formData: { tax: 5, subtotal: 100, total: 0 },
}

export const customFormulaDataKey: DemoSchema = {
  label: 'Custom formulaDataKey',
  schema: {
    type: 'object',
    properties: {
      tax: { type: 'number' },
      subtotal: { type: 'number' },
      total: {
        type: 'number',
        'x-formula': 'fd.tax + fd.subtotal',
        'x-formula-context': 'extended',
      },
    },
  } as unknown as RJSFSchema,
  formData: { tax: 5, subtotal: 100, total: 0 },
  formulaDataKey: 'fd',
}

export const customFormulaPathKey: DemoSchema = {
  label: 'Custom formulaPathKey',
  schema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: {
        type: 'number',
        'x-formula': 'a * 2',
        'x-formula-context': 'extended',
      },
    },
  } as unknown as RJSFSchema,
  formData: { a: 3, b: 0 },
  formulaPathKey: 'myPath',
}

export const customKey: DemoSchema = {
  label: 'Custom formula key',
  schema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number', 'x-calc': 'a * 3' },
    },
  } as unknown as RJSFSchema,
  formData: { a: 4, b: 0 },
  formulaKey: 'x-calc',
}

export const allOfBranch: DemoSchema = {
  label: 'allOf branches: sum = a + b',
  schema: {
    type: 'object',
    allOf: [
      { properties: { a: { type: 'number' }, b: { type: 'number' } } },
      { properties: { sum: { type: 'number', 'x-formula': 'a + b' } } },
    ],
  } as unknown as RJSFSchema,
  formData: { a: 3, b: 4, sum: 0 },
}

export const oneOfBranch: DemoSchema = {
  label: 'oneOf conditional: add vs multiply',
  schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['add', 'multiply'] },
      a: { type: 'number' },
      b: { type: 'number' },
      result: { type: 'number' },
    },
    oneOf: [
      {
        properties: {
          mode: { const: 'add' },
          result: { type: 'number', 'x-formula': 'a + b' },
        },
      },
      {
        properties: {
          mode: { const: 'multiply' },
          result: { type: 'number', 'x-formula': 'a * b' },
        },
      },
    ],
  } as unknown as RJSFSchema,
  formData: { mode: 'multiply', a: 3, b: 4, result: 0 },
}

export const ifThenBranch: DemoSchema = {
  label: 'if/then: double when mode=double',
  schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['double', 'increment'] },
      x: { type: 'number' },
      result: { type: 'number' },
    },
    if: { properties: { mode: { const: 'double' } } },
    then: { properties: { result: { type: 'number', 'x-formula': 'x * 2' } } },
    else: { properties: { result: { type: 'number', 'x-formula': 'x + 1' } } },
  } as unknown as RJSFSchema,
  formData: { mode: 'double', x: 5, result: 0 },
}

export const ifElseBranch: DemoSchema = {
  label: 'if/else: increment when mode≠double',
  schema: ifThenBranch.schema,
  formData: { mode: 'increment', x: 5, result: 0 },
}

export const refResolved: DemoSchema = {
  label: '$ref: computed item total',
  schema: {
    $defs: {
      PricedItem: {
        type: 'object',
        properties: {
          price: { type: 'number' },
          qty: { type: 'number' },
          total: { type: 'number', 'x-formula': 'price * qty' },
        },
      },
    },
    type: 'object',
    properties: {
      item: { $ref: '#/$defs/PricedItem' },
    },
  } as unknown as RJSFSchema,
  formData: { item: { price: 5, qty: 3, total: 0 } },
}

export const arrayItemsNoType: DemoSchema = {
  label: 'Array items (no explicit type)',
  schema: {
    type: 'object',
    properties: {
      items: {
        items: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            total: { type: 'number', 'x-formula': 'price * 2' },
          },
        },
      },
    },
  } as unknown as RJSFSchema,
  formData: { items: [{ price: 5, total: 0 }] },
}

export const errorHandling: DemoSchema = {
  label: 'Error handling',
  schema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      bad: { type: 'number', 'x-formula': 'throw_error' },
      good: { type: 'number', 'x-formula': 'a + 1' },
    },
  } as unknown as RJSFSchema,
  formData: { a: 5, bad: 0, good: 0 },
}
