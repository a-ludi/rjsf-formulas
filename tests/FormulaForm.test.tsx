import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { FormulaForm } from '../src/FormulaForm'

// Safe eval for tests only
const evalSimple = (formula: string, ctx: object) =>
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

describe('FormulaForm — mount', () => {
  it('fires parent onChange with enriched formData on mount', () => {
    const onChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }
    act(() => {
      render(
        <FormulaForm
          schema={schema as any}
          formData={{ price: 10, quantity: 3, total: 0 }}
          validator={validator}
          evaluator={evalSimple}
          onChange={onChange}
        />
      )
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ formData: { price: 10, quantity: 3, total: 30 } }),
      undefined
    )
  })
})

describe('FormulaForm — onChange', () => {
  it('passes enriched formData to parent onChange on user edit', async () => {
    const onChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        price: { type: 'number' },
        quantity: { type: 'number' },
        total: { type: 'number', 'x-formula': 'price * quantity' },
      },
    }

    // Use a mock inner Form to simulate an onChange call
    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => {
      return (
        <button
          onClick={() =>
            innerOnChange({ formData: { price: 5, quantity: 4, total: 0 } })
          }
        >
          change
        </button>
      )
    })

    const { getByText } = render(
      <FormulaForm
        schema={schema as any}
        formData={{ price: 10, quantity: 3, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        Form={MockForm as any}
      />
    )

    act(() => {
      getByText('change').click()
    })

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 20 } }),
      undefined
    )
  })
})

describe('FormulaForm — custom Form prop', () => {
  it('renders a custom Form component when provided', () => {
    const MockForm = vi.fn(() => <div data-testid="custom-form" />)
    const schema = { type: 'object', properties: {} }
    const { getByTestId } = render(
      <FormulaForm
        schema={schema as any}
        formData={{}}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    expect(getByTestId('custom-form')).toBeTruthy()
    expect(MockForm).toHaveBeenCalled()
  })
})

describe('FormulaForm — read-only injection', () => {
  it('passes mergedUiSchema with ui:readonly on computed fields to the inner Form', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        total: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const receivedUiSchema = MockForm.mock.calls[0][0].uiSchema
    expect(receivedUiSchema?.total?.['ui:readonly']).toBe(true)
  })

  it('preserves user-supplied uiSchema entries alongside injected read-only', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        total: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    const uiSchema = { a: { 'ui:widget': 'updown' } }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, total: 0 }}
        uiSchema={uiSchema}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].uiSchema
    expect(received?.a?.['ui:widget']).toBe('updown')
    expect(received?.total?.['ui:readonly']).toBe(true)
  })
})

describe('FormulaForm — nested objects', () => {
  it('enriches a computed field nested inside an object', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
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
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ order: { price: 4, quantity: 5, total: 0 } }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.order.total).toBe(20)
  })
})

describe('FormulaForm — custom keys', () => {
  it('uses a custom formulaKey to detect computed fields', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-calc': 'a * 3' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 4, b: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaKey="x-calc"
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.b).toBe(12)
  })
})

describe('FormulaForm — error handling', () => {
  it('calls onFormulaError and sets field to undefined when evaluator throws', () => {
    const MockForm = vi.fn(() => <div />)
    const onFormulaError = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        bad: { type: 'number', 'x-formula': 'throw_error' },
        good: { type: 'number', 'x-formula': 'a + 1' },
      },
    }
    const brokenEval = (formula: string, ctx: object) => {
      if (formula === 'throw_error') throw new Error('boom')
      return evalSimple(formula, ctx)
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 5, bad: 0, good: 0 }}
        validator={validator}
        evaluator={brokenEval}
        onChange={vi.fn()}
        onFormulaError={onFormulaError}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.bad).toBeUndefined()
    expect(received.good).toBe(6)
    expect(onFormulaError).toHaveBeenCalledWith(['bad'], expect.any(Error))
  })
})

describe('FormulaForm — extended context', () => {
  it('makes __formData__ available when x-formula-context is extended', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
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
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ tax: 5, subtotal: 100, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.total).toBe(105)
  })

  it('uses custom formulaDataKey when provided', () => {
    const MockForm = vi.fn(() => <div />)
    const schema = {
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
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ tax: 5, subtotal: 100, total: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaDataKey="fd"
        Form={MockForm as any}
      />
    )
    const received = MockForm.mock.calls[0][0].formData
    expect(received.total).toBe(105)
  })

  it('uses custom formulaPathKey when provided', () => {
    const MockForm = vi.fn(() => <div />)
    const capturedContexts: object[] = []
    const capturingEval = (formula: string, ctx: object) => {
      capturedContexts.push(ctx)
      return evalSimple(formula, ctx)
    }
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: {
          type: 'number',
          'x-formula': 'a * 2',
          'x-formula-context': 'extended',
        },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 3, b: 0 }}
        validator={validator}
        evaluator={capturingEval}
        onChange={vi.fn()}
        formulaPathKey="myPath"
        Form={MockForm as any}
      />
    )
    const ctx = capturedContexts[0] as any
    expect(ctx.myPath).toEqual(['b'])
    expect(ctx.__path__).toBeUndefined()
  })
})
