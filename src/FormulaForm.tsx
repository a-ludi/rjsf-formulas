import React, { useMemo, useEffect } from 'react'
import Form from '@rjsf/core'
import type { FormProps, IChangeEvent, StrictRJSFSchema, RJSFSchema, FormContextType } from '@rjsf/utils'
import { analyzeSchema } from './analyzeSchema'
import type { FormulaField } from './analyzeSchema'
import { enrich } from './enrich'
import { mergeReadOnly } from './mergeReadOnly'

export type FormulaFormProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
> = FormProps<T, S, F> & {
  evaluator: (formula: string, context: object) => unknown
  Form?: React.ComponentType<FormProps<T, S, F>>
  formulaKey?: string
  formulaContextKey?: string
  maxConvergencePasses?: number
  onFormulaError?: (path: (string | number)[], error: Error) => void
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
    maxConvergencePasses = 10,
    onFormulaError,
    onChange,
    ...rest
  } = props

  const formulaFields: FormulaField[] = useMemo(
    () => analyzeSchema(schema as RJSFSchema, { formulaKey, formulaContextKey }),
    [schema, formulaKey, formulaContextKey]
  )

  const enrichedFormData = useMemo(
    () => enrich(formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData, formulaFields, evaluator, maxConvergencePasses]
  )

  const mergedUiSchema = useMemo(
    () => mergeReadOnly(uiSchema as Record<string, unknown> | undefined, formulaFields),
    [uiSchema, formulaFields]
  )

  useEffect(() => {
    // Fires once on mount to push initial enriched values to the parent.
    onChange?.({ formData: enrichedFormData } as IChangeEvent<T, S, F>, undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (data: IChangeEvent<T, S, F>, id?: string) => {
    const enriched = enrich(data.formData, formulaFields, evaluator, maxConvergencePasses, onFormulaError) as T
    onChange?.({ ...data, formData: enriched }, id)
  }

  return (
    <InnerForm
      {...rest}
      schema={schema}
      formData={enrichedFormData}
      uiSchema={mergedUiSchema as any}
      onChange={handleChange}
    />
  )
}
