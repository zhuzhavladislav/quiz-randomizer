import React from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/base.css'
import './board.css'
import { BoardApp } from './BoardApp'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BoardApp />
  </React.StrictMode>
)
