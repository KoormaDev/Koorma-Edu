'use client';

import { useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';

export function useLoginSession() {
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start login session when component mounts
    const startSession = async () => {
      try {
        await apiClient.startLoginSession();
        console.log('Login session started');
      } catch (error) {
        console.error('Failed to start login session:', error);
      }
    };

    // Send heartbeat every 5 minutes
    const sendHeartbeat = async () => {
      try {
        await apiClient.updateLoginSessionHeartbeat();
        console.log('Login session heartbeat sent');
      } catch (error) {
        console.error('Failed to send heartbeat:', error);
      }
    };

    // Start session
    startSession();

    // Set up heartbeat interval (every 5 minutes)
    heartbeatInterval.current = setInterval(sendHeartbeat, 5 * 60 * 1000);

    // Clean up on unmount
    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      // End session when unmounting
      apiClient.endLoginSession().catch(console.error);
    };
  }, []);

  // Also track page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, send heartbeat
        apiClient.updateLoginSessionHeartbeat().catch(console.error);
      } else {
        // Page is visible again, send heartbeat
        apiClient.updateLoginSessionHeartbeat().catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Track user activity
  useEffect(() => {
    let activityTimeout: NodeJS.Timeout | null = null;
    const INACTIVITY_THRESHOLD = 10 * 60 * 1000; // 10 minutes

    const resetActivityTimer = () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout);
      }

      // Send heartbeat on activity
      apiClient.updateLoginSessionHeartbeat().catch(console.error);

      // Set timeout for inactivity
      activityTimeout = setTimeout(() => {
        console.log('User inactive for 10 minutes');
      }, INACTIVITY_THRESHOLD);
    };

    // Track various user activities
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetActivityTimer);
    });

    // Initial timer
    resetActivityTimer();

    return () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout);
      }
      events.forEach(event => {
        document.removeEventListener(event, resetActivityTimer);
      });
    };
  }, []);
}