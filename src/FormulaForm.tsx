import React, { useMemo, useEffect, useRef, useCallback, forwardRef } from 'react'
import Form from '@rjsf/core'
import type { FormProps, IChangeEvent } from '@rjsf/core'
import type { StrictRJSFSchema, RJSFSchema, FormContextType } from '@rjsf/utils'
import { analyzeSchema } from './analyzeSchema'
import type { FormulaField } from './analyzeSchema'
import { useAsyncFormulas } from './useAsyncFormulas'
import { mergeReadOnly } from './mergeReadOnly'
import type { BuildContextOptions } from './buildContext'

/**
 * Props accepted by {@link FormulaForm}.
 *
 * Extends all standard RJSF `FormProps` with formula-specific configuration.
 * All formula-specific props are optional except `evaluator`.
 */
export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  /**
   * Evaluates a formula string against a context object and returns the computed value.
   *
   * @remarks
   * May return a plain value or a `Promise`. For user-supplied formulas, **do not use `eval`**
   * — it allows arbitrary code execution. Prefer a sandboxed evaluator such as
   * [`expr-eval`](https://github.com/silentmatt/expr-eval) or
   * [`mathjs`](https://mathjs.org/). For additional isolation, run the evaluator in a Web Worker.
   *
   * @param formula - The formula string from the schema.
   * @param context - Sibling field values, or full form data in extended mode.
   * @returns The computed value, or a Promise resolving to it.
   */
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>

  /**
   * Inner RJSF `Form` component to render.
   * Defaults to `Form` from `@rjsf/core`. Swap to use a themed form
   * (e.g. `Form` from `@rjsf/bootstrap-4`).
   */
  Form?: React.ComponentType<FormProps<T, S, F>>

  /** Schema key that marks a field as computed. Defaults to `'x-formula'`. */
  formulaKey?: string

  /** Schema key that selects the context mode for a field. Defaults to `'x-formula-context'`. */
  formulaContextKey?: string

  /**
   * Key injected into the extended context carrying the full form data.
   * Defaults to `'__formData__'`. Override if a sibling field uses the same name.
   */
  formulaDataKey?: string

  /**
   * Key injected into the extended context carrying the field's resolved path.
   * Defaults to `'__path__'`. Override if a sibling field uses the same name.
   */
  formulaPathKey?: string

  /**
   * Maximum number of re-evaluation passes triggered by a single input event.
   * Guards against infinite loops from circular formula dependencies. Defaults to `10`.
   */
  maxConvergencePasses?: number

  /**
   * Milliseconds to debounce formula evaluation after a user input event. Defaults to `300`.
   * Set to `0` to disable the debounce delay and evaluate on the next event loop tick.
   */
  debounceMs?: number

  /**
   * Called when a formula throws during evaluation.
   * @param path - JSON path of the field whose formula failed.
   * @param error - The error thrown by the evaluator.
   */
  onFormulaError?: (path: (string | number)[], error: Error) => void

  /**
   * Called whenever the set of currently-evaluating fields changes.
   * Useful for showing per-field loading indicators.
   * @param loadingPaths - Paths of all fields whose evaluations are in progress.
   */
  onLoadingChange?: (loadingPaths: (string | number)[][]) => void

  /**
   * What to do when multiple branches of a composition operator (`allOf` at schema-analysis
   * time, or simultaneously-active `oneOf`/`anyOf` branches at evaluation time) define a
   * formula for the same field path.
   * - `'ignore'` — silently take the last definition.
   * - `'warn'` (default) — emit `console.warn` and take the last definition.
   * - `'error'` — throw a `TypeError` synchronously (useful during development).
   */
  formulaConflictBehavior?: 'ignore' | 'warn' | 'error'
}

/**
 * Drop-in replacement for RJSF's `<Form>` with support for computed fields.
 *
 * @remarks
 * Fields marked with a formula key in the JSON schema are evaluated automatically
 * on every data change and rendered as read-only. The `evaluator` prop receives
 * the formula string and a context object, and returns the computed value.
 *
 * @example
 * ```tsx
 * import { FormulaForm } from '@a-ludi/rjsf-formulas'
 * import validator from '@rjsf/validator-ajv8'
 * import { Parser } from 'expr-eval'
 *
 * const parser = new Parser()
 *
 * const schema = {
 *   type: 'object' as const,
 *   properties: {
 *     price:    { type: 'number' as const },
 *     quantity: { type: 'number' as const },
 *     total:    { type: 'number' as const, 'x-formula': 'price * quantity' },
 *   },
 * }
 *
 * function MyForm() {
 *   return (
 *     <FormulaForm
 *       schema={schema}
 *       validator={validator}
 *       evaluator={(formula, ctx) => parser.evaluate(formula, ctx)}
 *     />
 *   )
 * }
 * ```
 */
function FormulaFormImpl<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>, ref: React.Ref<Form<T, S, F>>): JSX.Element {
  const {
    schema,
    formData,
    validator,
    uiSchema,
    evaluator,
    Form: InnerForm = Form as React.ComponentType<FormProps<T, S, F>>,
    formulaKey = 'x-formula',
    formulaContextKey = 'x-formula-context',
    formulaDataKey = '__formData__',
    formulaPathKey = '__path__',
    maxConvergencePasses = 10,
    debounceMs = 300,
    onFormulaError,
    onLoadingChange,
    formulaConflictBehavior = 'warn',
    onChange,
    ...rest
  } = props

  const formulaFields: FormulaField[] = useMemo(
    () => analyzeSchema(schema as RJSFSchema, { formulaKey, formulaContextKey }),
    [schema, formulaKey, formulaContextKey]
  )

  const contextOptions: BuildContextOptions = useMemo(
    () => ({ formulaDataKey, formulaPathKey }),
    [formulaDataKey, formulaPathKey]
  )

  const mergedUiSchema = useMemo(
    () => mergeReadOnly(uiSchema as Record<string, unknown> | undefined, formulaFields),
    [uiSchema, formulaFields]
  )

  const checkCondition = useCallback(
    (condition: RJSFSchema, formData: unknown) =>
      validator.isValid(condition as any, formData as any, schema as any),
    [validator, schema]
  )

  const { enrichedFormData, handleInput } = useAsyncFormulas(
    formData,
    formulaFields,
    evaluator,
    debounceMs,
    maxConvergencePasses,
    onFormulaError,
    onLoadingChange,
    contextOptions,
    checkCondition,
    formulaConflictBehavior
  )

  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (formulaFields.length === 0) return
    onChangeRef.current?.({ formData: enrichedFormData as T } as IChangeEvent<T, S, F>, undefined)
  }, [enrichedFormData]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
    handleInput(data.formData)
    onChange?.(data, id)
  }

  return (
    <InnerForm
      ref={ref as any}
      {...rest}
      schema={schema}
      validator={validator}
      formData={enrichedFormData as T}
      uiSchema={mergedUiSchema as any}
      onChange={handleChange}
    />
  )
}

export const FormulaForm = forwardRef(FormulaFormImpl) as <
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>) => JSX.Element
