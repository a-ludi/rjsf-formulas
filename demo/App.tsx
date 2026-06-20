import React, { useState, useCallback, useMemo } from 'react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { FormulaForm } from '../src/FormulaForm'
import { analyzeSchema } from '../src/analyzeSchema'
import { expandPaths } from '../src/enrich'
import * as schemas from '../tests/schemas'
import type { DemoSchema } from '../tests/schemas'

const evalSimple = (formula: string, ctx: object) =>
  new Function(...Object.keys(ctx), `return ${formula}`)(...Object.values(ctx))

// Filter to DemoSchema entries only (excludes the exported `DemoSchema` type — types are erased at runtime)
const schemaEntries = (Object.entries(schemas) as [string, unknown][]).filter(
  (entry): entry is [string, DemoSchema] =>
    entry[1] !== null &&
    typeof entry[1] === 'object' &&
    'schema' in (entry[1] as object)
)

export default function App() {
  const [selectedKey, setSelectedKey] = useState(schemaEntries[0][0])
  const [delay, setDelay] = useState(0)
  const [loadingPaths, setLoadingPaths] = useState<(string | number)[][]>([])
  const [lastFormData, setLastFormData] = useState<unknown>(schemaEntries[0][1].formData)

  const selected = schemaEntries.find(([k]) => k === selectedKey)![1]

  const evaluator = useCallback(
    async (formula: string, ctx: object) => {
      if (delay > 0) await new Promise<void>(res => setTimeout(res, delay))
      return evalSimple(formula, ctx)
    },
    [delay]
  )

  // All concrete formula paths for the active schema + current data (used for status row)
  const allPaths = useMemo(() => {
    const fields = analyzeSchema(selected.schema, {
      formulaKey: selected.formulaKey,
      formulaContextKey: selected.formulaContextKey,
    })
    return fields.flatMap(field => expandPaths(field.path, lastFormData))
  }, [selected, lastFormData])

  const loadingSet = useMemo(
    () => new Set(loadingPaths.map(p => JSON.stringify(p))),
    [loadingPaths]
  )

  const handleSchemaChange = (key: string) => {
    const next = schemaEntries.find(([k]) => k === key)![1]
    setSelectedKey(key)
    setLastFormData(next.formData)
    setLoadingPaths([])
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <a href="https://a-ludi.github.io/rjsf-formulas/" target="_blank" rel="noopener noreferrer">
          Documentation
        </a>
        <a href="https://github.com/a-ludi/rjsf-formulas" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
      <h1 style={{ marginTop: 0 }}>rjsf-formulas demo</h1>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label>
          Schema:{' '}
          <select value={selectedKey} onChange={e => handleSchemaChange(e.target.value)}>
            {schemaEntries.map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Delay:
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={delay}
            onChange={e => setDelay(Number(e.target.value))}
          />
          <span style={{ minWidth: '4rem' }}>{delay} ms</span>
        </label>
      </div>

      {/* Formula status row */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', minHeight: '1.5rem' }}>
        {allPaths.length === 0
          ? <span style={{ color: '#888', fontSize: '0.85rem' }}>No formula fields</span>
          : allPaths.map(path => {
              const key = JSON.stringify(path)
              const loading = loadingSet.has(key)
              return (
                <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    display: 'inline-block',
                    flexShrink: 0,
                    background: loading ? 'red' : 'transparent',
                    border: loading ? 'none' : '2px solid green',
                  }} />
                  <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{path.join('.')}</span>
                </span>
              )
            })
        }
      </div>

      {/* FormulaForm — key resets state when schema changes */}
      <FormulaForm
        key={selectedKey}
        schema={selected.schema as any}
        formData={selected.formData as any}
        validator={validator}
        evaluator={evaluator}
        formulaKey={selected.formulaKey}
        formulaContextKey={selected.formulaContextKey}
        formulaDataKey={selected.formulaDataKey}
        formulaPathKey={selected.formulaPathKey}
        onLoadingChange={setLoadingPaths}
        onFormulaError={(path, error) =>
          console.error(`[formula error] ${path.join('.')}:`, error)
        }
        onChange={data => setLastFormData(data.formData)}
        Form={Form as any}
      />

      {/* Enriched formData output */}
      <pre style={{
        background: '#f5f5f5',
        padding: '1rem',
        borderRadius: 4,
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        overflow: 'auto',
        marginTop: '1rem',
        border: '1px solid #ddd',
      }}>
        {JSON.stringify(lastFormData, null, 2)}
      </pre>
    </div>
  )
}
