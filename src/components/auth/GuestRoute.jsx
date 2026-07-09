import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthLoading from './AuthLoading';

const GuestRoute = () => {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <AuthLoading />;
    }

    if (session) {
        const redirectTo = location.state?.from?.pathname || '/';
        return <Navigate to={redirectTo} replace />;
    }

    return <Outlet />;
};

export default GuestRoute;
