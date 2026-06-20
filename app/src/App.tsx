import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TaskList } from './pages/TaskList';
import { TeamManagement } from './pages/TeamManagement';
import { ProfileSettings } from './pages/ProfileSettings';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Products } from './pages/Products';
import { Customers } from './pages/Customers';
import { Suppliers } from './pages/Suppliers';
import { ProformaInvoices } from './pages/ProformaInvoices';
import { ContainerPacker } from './pages/ContainerPacker';
import { AuthCallback } from './pages/AuthCallback';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { IssueBoard } from './pages/IssueBoard';

import { FilePreviewModal } from './components/FilePreviewModal';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <TaskProvider>
        <FilePreviewModal />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth-callback" element={<AuthCallback />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="list" element={<TaskList />} />
              <Route path="proforma-invoices" element={<ProformaInvoices />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="products" element={<Products />} />
              <Route path="customers" element={<Customers />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="container-packer" element={<ContainerPacker />} />
              <Route path="team-management" element={<TeamManagement />} />
              <Route path="profile" element={<ProfileSettings />} />
              <Route path="issues" element={<IssueBoard />} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </TaskProvider>
    </AuthProvider>
  );
};

export default App;
