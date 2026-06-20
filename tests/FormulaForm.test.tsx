import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { FormulaForm } from '../src/FormulaForm'
import {
  basic,
  nestedObject,
  extendedContext,
  customFormulaDataKey,
  customFormulaPathKey,
  customKey,
  errorHandling,
} from './schemas'

const evalSimple = (formula: string, ctx: object) =>
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('FormulaForm — mount', () => {
  it('renders inner form with enriched formData after debounce fires on mount', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        Form={MockForm as any}
      />
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 10, quantity: 3, total: 30 })
  })

  it('calls onChange with enriched formData after initial evaluation', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formData: { price: 10, quantity: 3, total: 30 } }),
      undefined
    )
  })
})

describe('FormulaForm — onChange', () => {
  it('fires onChange immediately with raw data on user edit', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()

    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => (
      <button
        onClick={() => innerOnChange({ formData: { price: 5, quantity: 4, total: 30 } })}
      >
        change
      </button>
    ))

    const { getByText } = render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={onChange}
        Form={MockForm as any}
      />
    )

    // Let mount evaluation complete
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    onChange.mockClear()

    // User edits a field
    act(() => { getByText('change').click() })

    // onChange fires immediately with the raw data from RJSF
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 30 } }),
      undefined
    )

    // Second onChange fires after debounce with enriched data
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ formData: { price: 5, quantity: 4, total: 20 } }),
      undefined
    )
  })

  it('inner form re-renders with enriched data after debounce following user edit', async () => {
    vi.useFakeTimers()

    const MockForm = vi.fn(({ onChange: innerOnChange }: any) => (
      <button
        onClick={() => innerOnChange({ formData: { price: 5, quantity: 4, total: 30 } })}
      >
        change
      </button>
    ))

    const { getByText } = render(
      <FormulaForm
        schema={basic.schema as any}
        formData={basic.formData as any}
        validator={validator}
        evaluator={evalSimple}
        Form={MockForm as any}
      />
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    act(() => { getByText('change').click() })

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData).toEqual({ price: 5, quantity: 4, total: 20 })
  })
})

describe('FormulaForm — custom Form prop', () => {
  it('renders a custom Form component when provided', async () => {
    vi.useFakeTimers()
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
  it('passes mergedUiSchema with ui:readonly on computed fields to the inner Form', async () => {
    vi.useFakeTimers()
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

  it('preserves user-supplied uiSchema entries alongside injected read-only', async () => {
    vi.useFakeTimers()
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
  it('enriches a computed field nested inside an object', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    render(
      <FormulaForm
        schema={nestedObject.schema as any}
        formData={nestedObject.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.order.total).toBe(20)
  })
})

describe('FormulaForm — custom keys', () => {
  it('uses a custom formulaKey to detect computed fields', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    render(
      <FormulaForm
        schema={customKey.schema as any}
        formData={customKey.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaKey={customKey.formulaKey}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.b).toBe(12)
  })
})

describe('FormulaForm — error handling', () => {
  it('calls onFormulaError and sets field to undefined when evaluator throws', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const onFormulaError = vi.fn()
    const brokenEval = (formula: string, ctx: object) => {
      if (formula === 'throw_error') throw new Error('boom')
      return evalSimple(formula, ctx)
    }
    render(
      <FormulaForm
        schema={errorHandling.schema as any}
        formData={errorHandling.formData as any}
        validator={validator}
        evaluator={brokenEval}
        onChange={vi.fn()}
        onFormulaError={onFormulaError}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.bad).toBeUndefined()
    expect(lastCall[0].formData.good).toBe(6)
    expect(onFormulaError).toHaveBeenCalledWith(['bad'], expect.any(Error))
  })
})

describe('FormulaForm — extended context', () => {
  it('makes __formData__ available when x-formula-context is extended', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    render(
      <FormulaForm
        schema={extendedContext.schema as any}
        formData={extendedContext.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.total).toBe(105)
  })

  it('uses custom formulaDataKey when provided', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    render(
      <FormulaForm
        schema={customFormulaDataKey.schema as any}
        formData={customFormulaDataKey.formData as any}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        formulaDataKey={customFormulaDataKey.formulaDataKey}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const lastCall = MockForm.mock.calls[MockForm.mock.calls.length - 1]
    expect(lastCall[0].formData.total).toBe(105)
  })

  it('uses custom formulaPathKey when provided', async () => {
    vi.useFakeTimers()
    const MockForm = vi.fn(() => <div />)
    const capturedContexts: object[] = []
    const capturingEval = (formula: string, ctx: object) => {
      capturedContexts.push(ctx)
      return evalSimple(formula, ctx)
    }
    render(
      <FormulaForm
        schema={customFormulaPathKey.schema as any}
        formData={customFormulaPathKey.formData as any}
        validator={validator}
        evaluator={capturingEval}
        onChange={vi.fn()}
        formulaPathKey={customFormulaPathKey.formulaPathKey}
        Form={MockForm as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    const ctx = capturedContexts[0] as any
    expect(ctx.myPath).toEqual(['b'])
    expect(ctx.__path__).toBeUndefined()
  })
})

describe('FormulaForm — debounceMs prop', () => {
  it('uses a custom debounceMs value', async () => {
    vi.useFakeTimers()
    const evaluator = vi.fn().mockImplementation(evalSimple)
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 1, b: 0 }}
        validator={validator}
        evaluator={evaluator}
        onChange={vi.fn()}
        debounceMs={500}
        Form={vi.fn(() => <div />) as any}
      />
    )

    // Should not evaluate before 500ms
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(evaluator).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(evaluator).toHaveBeenCalled()
  })
})

describe('FormulaForm — onLoadingChange prop', () => {
  it('calls onLoadingChange with in-flight paths and then []', async () => {
    vi.useFakeTimers()
    const onLoadingChange = vi.fn()
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number', 'x-formula': 'a * 2' },
      },
    }
    render(
      <FormulaForm
        schema={schema as any}
        formData={{ a: 3, b: 0 }}
        validator={validator}
        evaluator={evalSimple}
        onChange={vi.fn()}
        onLoadingChange={onLoadingChange}
        Form={vi.fn(() => <div />) as any}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(onLoadingChange).toHaveBeenNthCalledWith(1, [['b']])
    expect(onLoadingChange).toHaveBeenNthCalledWith(2, [])
  })
})
