import './AuthLayout.css';

// Solid near-black canvas (matches the app shell) - depth lives on the cards.
const AuthLayout = ({ children }) => {
    return (
        <div className="auth-layout">
            <div className="auth-layout__content">
                {children}
            </div>
        </div>
    );
};

export default AuthLayout;
