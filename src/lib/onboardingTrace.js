/** Enable with VITE_DEBUG_ONBOARDING=true in .env.local */
export const onboardingTrace = (marker, payload = undefined) => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_ONBOARDING === 'true') {
        if (payload === undefined) {
            console.log(`[TRACE:${marker}]`);
        } else {
            console.log(`[TRACE:${marker}]`, payload);
        }
    }
};
