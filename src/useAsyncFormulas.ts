import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormulaField } from './analyzeSchema'
import { expandPaths, enrich, deepEqual } from './enrich'
import type { BuildContextOptions } from './buildContext'

type FieldState = 'idle' | 'running' | 'dirty'

function pathKey(path: (string | number)[]): string {
  return JSON.stringify(path)
}

export function useAsyncFormulas(
  formData: unknown,
  formulaFields: FormulaField[],
  evaluator: (formula: string, context: object) => unknown | Promise<unknown>,
  debounceMs: number,
  maxConvergencePasses: number,
  onFormulaError: ((path: (string | number)[], error: Error) => void) | undefined,
  onLoadingChange: ((loadingPaths: (string | number)[][]) => void) | undefined,
  contextOptions: BuildContextOptions
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void } {
  const [enrichedFormData, setEnrichedFormData] = useState<unknown>(formData)

  const pendingInputRef = useRef<unknown>(formData)
  const lastExternalFormDataRef = useRef<unknown>(formData)
  const fieldStateRef = useRef<Map<string, FieldState>>(new Map())
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = useRef(false)

  // Stable refs so callbacks/config don't require restarting the debounce
  const onFormulaErrorRef = useRef(onFormulaError)
  const onLoadingChangeRef = useRef(onLoadingChange)
  const evaluatorRef = useRef(evaluator)
  const formulaFieldsRef = useRef(formulaFields)
  const maxPassesRef = useRef(maxConvergencePasses)
  const contextOptionsRef = useRef(contextOptions)

  useEffect(() => { onFormulaErrorRef.current = onFormulaError }, [onFormulaError])
  useEffect(() => { onLoadingChangeRef.current = onLoadingChange }, [onLoadingChange])
  useEffect(() => { evaluatorRef.current = evaluator }, [evaluator])
  useEffect(() => { formulaFieldsRef.current = formulaFields }, [formulaFields])
  useEffect(() => { maxPassesRef.current = maxConvergencePasses }, [maxConvergencePasses])
  useEffect(() => { contextOptionsRef.current = contextOptions }, [contextOptions])

  // startSequence reads all config from refs so it is stable across renders
  const startSequence = useCallback(() => {
    if (runningRef.current) return

    const run = async () => {
      runningRef.current = true

      while (true) {
        const input = pendingInputRef.current
        const fields = formulaFieldsRef.current

        // Collect concrete paths for loading reporting
        const concretePaths: (string | number)[][] = []
        for (const field of fields) {
          for (const cp of expandPaths(field.path, input)) {
            concretePaths.push(cp)
          }
        }

        // Mark all fields running
        const stateMap = fieldStateRef.current
        stateMap.clear()
        for (const cp of concretePaths) stateMap.set(pathKey(cp), 'running')
        if (concretePaths.length > 0) onLoadingChangeRef.current?.(concretePaths)

        const result = await enrich(
          input,
          fields,
          evaluatorRef.current,
          maxPassesRef.current,
          onFormulaErrorRef.current,
          contextOptionsRef.current.formulaDataKey,
          contextOptionsRef.current.formulaPathKey
        )

        const anyDirty = [...stateMap.values()].some(s => s === 'dirty')
        stateMap.clear()

        setEnrichedFormData(result)

        if (!anyDirty) {
          if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
          break
        }
        // New input arrived while evaluating — re-run with pendingInputRef.current
      }

      runningRef.current = false
    }

    run()
  }, []) // stable: all dependencies accessed via refs

  const handleInput = useCallback(
    (newFormData: unknown) => {
      pendingInputRef.current = newFormData

      // Flip any running fields to dirty
      const stateMap = fieldStateRef.current
      for (const [key, state] of stateMap) {
        if (state === 'running') stateMap.set(key, 'dirty')
      }

      // Only manage debounce when no sequence is in flight;
      // the while loop picks up dirty fields automatically
      if (!runningRef.current) {
        if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null
          startSequence()
        }, debounceMs)
      }
    },
    [debounceMs, startSequence]
  )

  // React to external formData prop changes.
  // We use a no-dependency effect that runs every render but guards with deep equality
  // to avoid spurious re-evaluations when the parent re-renders with a new object
  // reference but the same value. On first render this always fires (initialises evaluation).
  const isMountedRef = useRef(false)
  useEffect(() => {
    if (!isMountedRef.current) {
      // Initial mount: always trigger evaluation
      isMountedRef.current = true
      lastExternalFormDataRef.current = formData
      handleInput(formData)
    } else if (!deepEqual(formData, lastExternalFormDataRef.current)) {
      // Subsequent renders: only trigger on actual value change
      lastExternalFormDataRef.current = formData
      handleInput(formData)
    }
  }) // runs every render — guarded by deep equality

  // Cleanup debounce on unmount
  useEffect(
    () => () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    },
    []
  )

  return { enrichedFormData, handleInput }
}
