import React from 'react'
import { createRoot } from 'react-dom/client'
import SchemaVisualizerWindow from '../schema_visualizer/SchemaVisualizerWindow'

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <SchemaVisualizerWindow />
  </React.StrictMode>
)
