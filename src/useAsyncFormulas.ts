import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormulaField } from './analyzeSchema'
import { expandPaths, enrich, deepEqual, nonFormulaFieldsUnchanged } from './enrich'
import type { BuildContextOptions } from './buildContext'
import type { RJSFSchema } from '@rjsf/utils'

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
  contextOptions: BuildContextOptions,
  checkCondition: (condition: RJSFSchema, formData: unknown) => boolean,
  formulaConflictBehavior: 'ignore' | 'warn' | 'error',
  initialComputationMode: 'always' | 'skip' | 'silent',
  convergenceKey: (value: unknown, path: (string | number)[]) => unknown
): { enrichedFormData: unknown; handleInput: (newFormData: unknown) => void; refresh: () => Promise<void> } {
  const [enrichedFormData, setEnrichedFormData] = useState<unknown>(formData)

  const pendingInputRef = useRef<unknown>(formData)
  const lastExternalFormDataRef = useRef<unknown>(formData)
  const lastEvalResultRef = useRef<unknown>(undefined)
  const fieldStateRef = useRef<Map<string, FieldState>>(new Map())
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = useRef(false)
  const refreshResolversRef = useRef<Array<() => void>>([])
  const forceRerunRef = useRef(false)

  // Stable refs so callbacks/config don't require restarting the debounce
  const onFormulaErrorRef = useRef(onFormulaError)
  const onLoadingChangeRef = useRef(onLoadingChange)
  const evaluatorRef = useRef(evaluator)
  const formulaFieldsRef = useRef(formulaFields)
  const maxPassesRef = useRef(maxConvergencePasses)
  const contextOptionsRef = useRef(contextOptions)
  const checkConditionRef = useRef(checkCondition)
  const formulaConflictBehaviorRef = useRef(formulaConflictBehavior)
  const convergenceKeyRef = useRef(convergenceKey)

  useEffect(() => { onFormulaErrorRef.current = onFormulaError }, [onFormulaError])
  useEffect(() => { onLoadingChangeRef.current = onLoadingChange }, [onLoadingChange])
  useEffect(() => { evaluatorRef.current = evaluator }, [evaluator])
  useEffect(() => { formulaFieldsRef.current = formulaFields }, [formulaFields])
  useEffect(() => { maxPassesRef.current = maxConvergencePasses }, [maxConvergencePasses])
  useEffect(() => { contextOptionsRef.current = contextOptions }, [contextOptions])
  useEffect(() => { checkConditionRef.current = checkCondition }, [checkCondition])
  useEffect(() => { formulaConflictBehaviorRef.current = formulaConflictBehavior }, [formulaConflictBehavior])
  useEffect(() => { convergenceKeyRef.current = convergenceKey }, [convergenceKey])

  // startSequence reads all config from refs so it is stable across renders
  const startSequence = useCallback(() => {
    if (runningRef.current) return

    const run = async () => {
      runningRef.current = true

      try {
        while (true) {
          const input = pendingInputRef.current
          const fields = formulaFieldsRef.current

          // Only report loading for fields whose condition is currently active
          const activeFields = fields.filter(f =>
            f.condition === true || checkConditionRef.current(f.condition as any, input)
          )

          // Collect concrete paths for loading reporting
          const concretePaths: (string | number)[][] = []
          for (const field of activeFields) {
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
            contextOptionsRef.current.formulaPathKey,
            checkConditionRef.current,
            formulaConflictBehaviorRef.current,
            convergenceKeyRef.current
          )

          if (isUnmountedRef.current) break

          const anyDirty = [...stateMap.values()].some(s => s === 'dirty')
          stateMap.clear()

          const shouldRerun = anyDirty || forceRerunRef.current
          forceRerunRef.current = false
          if (!shouldRerun) {
            lastEvalResultRef.current = result
            setEnrichedFormData(result)
            if (concretePaths.length > 0) onLoadingChangeRef.current?.([])
            break
          }
          // New input arrived while evaluating — re-run with pendingInputRef.current
        }
      } finally {
        runningRef.current = false
        const resolvers = refreshResolversRef.current.splice(0)
        for (const r of resolvers) r()
      }
    }

    run()
  }, []) // stable: all dependencies accessed via refs

  const refresh = useCallback((): Promise<void> => {
    // We use a synchronous-callback layer so .then() subscribers fire immediately
    // when the resolver is called (e.g. from unmount cleanup), making synchronous
    // act() checks work in tests while still supporting await.
    const syncCbs: Array<() => void> = []
    let syncResolved = false
    let promiseResolve!: () => void
    const nativePromise = new Promise<void>(r => { promiseResolve = r })

    const resolver = () => {
      if (syncResolved) return
      syncResolved = true
      for (const cb of syncCbs.splice(0)) cb()
      promiseResolve()
    }

    refreshResolversRef.current.push(resolver)
    // Only force an extra iteration if a run is already in progress;
    // a fresh startSequence() call will run at least once on its own.
    if (runningRef.current) forceRerunRef.current = true
    startSequence()

    const originalThen = nativePromise.then.bind(nativePromise)
    return Object.assign(nativePromise, {
      then(
        onfulfilled?: ((value: void) => void) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ): Promise<void> {
        if (typeof onfulfilled === 'function') {
          if (syncResolved) { onfulfilled(); return Promise.resolve() }
          syncCbs.push(onfulfilled)
        }
        return originalThen(onfulfilled, onrejected) as Promise<void>
      },
    })
  }, [startSequence])

  const handleInput = useCallback(
    (newFormData: unknown) => {
      // Guard: if only formula fields changed from the last enrich result, this is an
      // echo of our own output (the enriched value reflected back via onChange →
      // parent state → formData prop). Accept the value for display but skip re-evaluation.
      if (
        lastEvalResultRef.current !== undefined &&
        nonFormulaFieldsUnchanged(lastEvalResultRef.current, newFormData, formulaFieldsRef.current)
      ) {
        setEnrichedFormData(newFormData)
        return
      }

      pendingInputRef.current = newFormData
      setEnrichedFormData(newFormData)

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
  const hasMountedRef = useRef(false)
  const isUnmountedRef = useRef(false)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      lastExternalFormDataRef.current = formData
      // Read from param directly (not a ref) — this branch only executes once on mount.
      if (initialComputationMode !== 'skip') {
        handleInput(formData)
      }
    } else if (!deepEqual(formData, lastExternalFormDataRef.current)) {
      // Subsequent renders: only trigger on actual value change
      lastExternalFormDataRef.current = formData
      handleInput(formData)
    }
  }) // runs every render — guarded by deep equality

  // Reset lifecycle sentinels on every (re)mount; clean up on unmount.
  // The setup body runs before any debounce fires, so isUnmountedRef is false
  // by the time startSequence checks it.
  useEffect(() => {
    isUnmountedRef.current = false
    lastEvalResultRef.current = undefined
    return () => {
      isUnmountedRef.current = true
      hasMountedRef.current = false  // allow re-init on next mount (React StrictMode)
      lastEvalResultRef.current = undefined
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
      const resolvers = refreshResolversRef.current.splice(0)
      for (const r of resolvers) r()
    }
  }, [])

  return { enrichedFormData, handleInput, refresh }
}
