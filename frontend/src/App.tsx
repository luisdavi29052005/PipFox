import { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Workflows from './pages/Workflows'
import Accounts from './pages/Accounts'
import Leads from './pages/Leads'
import Plans from './pages/Plans'

import CreateWorkflow from './pages/CreateWorkflow'
import WorkflowEditor from './pages/WorkflowEditor'
import ProtectedRoute from './routes/ProtectedRoute'

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/workflows" element={
          <ProtectedRoute>
            <Workflows />
          </ProtectedRoute>
        } />
        <Route path="/workflows/create" element={
          <ProtectedRoute>
            <CreateWorkflow />
          </ProtectedRoute>
        } />
        <Route path="/workflows/:id/edit" element={
          <ProtectedRoute>
            <WorkflowEditor />
          </ProtectedRoute>
        } />
        <Route path="/accounts" element={
          <ProtectedRoute>
            <Accounts />
          </ProtectedRoute>
        } />
        <Route path="/leads" element={
          <ProtectedRoute>
            <Leads />
          </ProtectedRoute>
        } />
        <Route path="/plans" element={
          <ProtectedRoute>
            <Plans />
          </ProtectedRoute>
        } />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  )
}