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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
  formData: { a: 4, b: 0 },
  formulaKey: 'x-calc',
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
  },
  formData: { a: 5, bad: 0, good: 0 },
}
