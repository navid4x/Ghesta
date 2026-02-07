// hooks/useSupabaseConnection.ts
'use client';
import { useState, useEffect } from 'react';
import { getConnectionStatus, onConnectionChange } from '@/lib/connection-state';

export function useSupabaseConnection() {
    const [isReachable, setIsReachable] = useState(getConnectionStatus);

    useEffect(() => {
        // Sync with latest value on mount
        setIsReachable(getConnectionStatus());

        // Subscribe to changes from the shared singleton
        const unsubscribe = onConnectionChange((value) => {
            setIsReachable(value);
        });

        return unsubscribe;
    }, []);

    return isReachable;
}
