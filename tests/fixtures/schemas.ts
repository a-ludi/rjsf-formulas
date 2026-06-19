// Plain objects — no test framework imports.
// Reused by tests for issues 02, 03, 04, 05.

export const flatWithOneFormula = {
  type: 'object',
  properties: {
    price: { type: 'number' },
    quantity: { type: 'number' },
    total: { type: 'number', 'x-formula': 'price * quantity' },
  },
} as const

export const flatWithMultipleFormulas = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    b: { type: 'number' },
    sum: { type: 'number', 'x-formula': 'a + b' },
    product: { type: 'number', 'x-formula': 'a * b' },
  },
} as const

export const noFormulas = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
} as const

export const nestedObject = {
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
} as const

export const arrayWithItems = {
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
} as const

export const arrayWithPrefixItems = {
  type: 'object',
  properties: {
    tuple: {
      type: 'array',
      prefixItems: [
        { type: 'number' },
        { type: 'number' },
        { type: 'number', 'x-formula': 'tuple[0] + tuple[1]' },
      ],
    },
  },
} as const

export const arrayWithBoth = {
  type: 'object',
  properties: {
    mixed: {
      type: 'array',
      prefixItems: [
        { type: 'number' },
        { type: 'number', 'x-formula': 'a + b' },
      ],
      items: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          doubled: { type: 'number', 'x-formula': 'value * 2' },
        },
      },
    },
  },
} as const

export const nestedArrays = {
  type: 'object',
  properties: {
    matrix: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            doubled: { type: 'number', 'x-formula': 'value * 2' },
          },
        },
      },
    },
  },
} as const

export const extendedContextSchema = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    result: {
      type: 'number',
      'x-formula': '__formData__.a * 2',
      'x-formula-context': 'extended',
    },
  },
} as const

export const unknownContextSchema = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    result: {
      type: 'number',
      'x-formula': 'a * 2',
      'x-formula-context': 'invalid-mode',
    },
  },
} as const

export const withOneOfSchema = {
  type: 'object',
  properties: { value: { type: 'number' } },
  oneOf: [
    { properties: { kind: { type: 'string', enum: ['a'] } } },
  ],
} as const
