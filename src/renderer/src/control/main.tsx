import React from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/base.css'
import './control.css'
import { ControlApp } from './ControlApp'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ControlApp />
  </React.StrictMode>
)
