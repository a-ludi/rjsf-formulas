/**
 * @packageDocumentation
 *
 * `@a-ludi/rjsf-formulas` — RJSF extension for computed fields driven by formulas.
 *
 * @example Install
 * ```sh
 * npm install @a-ludi/rjsf-formulas
 * ```
 *
 * @example Basic usage
 * ```tsx
 * import { FormulaForm } from '@a-ludi/rjsf-formulas'
 * import validator from '@rjsf/validator-ajv8'
 *
 * <FormulaForm
 *   schema={schema}
 *   validator={validator}
 *   evaluator={(formula, ctx) => myEvaluator(formula, ctx)}
 * />
 * ```
 */
export { analyzeSchema } from './analyzeSchema'
export type { ContextMode, FormulaField, AnalyzeSchemaOptions } from './analyzeSchema'

export { FormulaForm } from './FormulaForm'
export type { FormulaFormProps } from './FormulaForm'
