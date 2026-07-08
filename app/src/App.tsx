import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TaskList } from './pages/TaskList';
import { TeamManagement } from './pages/TeamManagement';
import { ProfileSettings } from './pages/ProfileSettings';
import { MyCompanySettings } from './pages/MyCompanySettings';
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
import { LeaveManagement } from './pages/LeaveManagement';
import { ApprovalSystem } from './pages/ApprovalSystem';
import { Mails } from './pages/Mails';
import { MeetingMinutes } from './pages/MeetingMinutes';
import { Imports } from './pages/Imports';
import { ImportDetail } from './pages/ImportDetail';

import { FilePreviewModal } from './components/FilePreviewModal';

import { useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const App: React.FC = () => {
  useEffect(() => {
    async function printIssues() {
      try {
        const snap = await getDocs(collection(db, 'companies', 'YSACC', 'issues'));
        console.log(`%c=== YSACC Issues Diagnostic (${snap.size}) ===`, 'background: #3b82f6; color: #fff; padding: 4px; font-weight: bold;');
        snap.forEach(doc => {
          const data = doc.data();
          console.log(`[%c${data.status || '미해결'}%c] [${data.category}] ${data.title}\n내용: ${data.content}`, 
            data.status === '해결됨' ? 'color: green' : 'color: red; font-weight: bold', 'color: inherit');
        });
      } catch (e) {
        console.error("Failed to print diagnostic issues:", e);
      }
    }
    printIssues();
  }, []);

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
              <Route path="team-management" element={<TeamManagement />} />
              <Route path="profile" element={<ProfileSettings />} />
              <Route path="my-company" element={<MyCompanySettings />} />
              <Route path="issues" element={<IssueBoard />} />
              <Route path="leave-management" element={<LeaveManagement />} />
              <Route path="approvals" element={<ApprovalSystem />} />
              <Route path="mails" element={<Mails />} />
              <Route path="meetings" element={<MeetingMinutes />} />
              <Route path="imports" element={<Imports />} />
              <Route path="imports/:id" element={<ImportDetail />} />
            </Route>
            <Route path="/container-packer" element={<ProtectedRoute><ContainerPacker /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </TaskProvider>
    </AuthProvider>
  );
};

export default App;
