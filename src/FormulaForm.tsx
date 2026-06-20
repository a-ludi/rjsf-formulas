import React, { useMemo } from 'react'
import Form from '@rjsf/core'
import type { FormProps, IChangeEvent, StrictRJSFSchema, RJSFSchema, FormContextType } from '@rjsf/utils'
import { analyzeSchema } from './analyzeSchema'
import type { FormulaField } from './analyzeSchema'
import { useAsyncFormulas } from './useAsyncFormulas'
import { mergeReadOnly } from './mergeReadOnly'
import type { BuildContextOptions } from './buildContext'

export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>
  Form?: React.ComponentType<FormProps<T, S, F>>
  formulaKey?: string
  formulaContextKey?: string
  formulaDataKey?: string
  formulaPathKey?: string
  maxConvergencePasses?: number
  debounceMs?: number
  onFormulaError?: (path: (string | number)[], error: Error) => void
  onLoadingChange?: (loadingPaths: (string | number)[][]) => void
}

export function FormulaForm<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>(props: FormulaFormProps<T, S, F>): JSX.Element {
  const {
    schema,
    formData,
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

  const { enrichedFormData, handleInput } = useAsyncFormulas(
    formData,
    formulaFields,
    evaluator,
    debounceMs,
    maxConvergencePasses,
    onFormulaError,
    onLoadingChange,
    contextOptions
  )

  const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
    handleInput(data.formData)
    onChange?.({ ...data, formData: data.formData as T }, id)
  }

  return (
    <InnerForm
      {...rest}
      schema={schema}
      formData={enrichedFormData as T}
      uiSchema={mergedUiSchema as any}
      onChange={handleChange}
    />
  )
}
