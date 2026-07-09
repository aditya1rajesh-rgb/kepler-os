import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthLoading from './AuthLoading';

const ProtectedRoute = () => {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AuthLoading />;
    }

    if (!session) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
