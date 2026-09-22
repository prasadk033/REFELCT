import React, { createContext, useContext } from 'react'

const ActiveJobContext = createContext(null)

export function ActiveJobProvider({ children }) {
  return children
}

export function useActiveJob() {
  return useContext(ActiveJobContext)
}
