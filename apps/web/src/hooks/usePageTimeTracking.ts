'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api';

type PageType = 'material' | 'ai_tutor' | 'past_paper' | 'exam' | 'other';

interface PageTrackingConfig {
  pageType: PageType;
  contentId?: string;
  examId?: string;
}

export function usePageTimeTracking(config: PageTrackingConfig) {
  const pathname = usePathname();
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const interactionsRef = useRef<number>(0);
  const maxScrollDepthRef = useRef<number>(0);

  // Start tracking when component mounts or page changes
  useEffect(() => {
    const startTracking = async () => {
      try {
        const response = await apiClient.startPageTracking({
          page_type: config.pageType,
          page_url: pathname,
          content_id: config.contentId,
          exam_id: config.examId
        });

        if (response.tracking_id) {
          setTrackingId(response.tracking_id);
          startTimeRef.current = new Date();
          console.log(`Started tracking ${config.pageType} page:`, response.tracking_id);
        }
      } catch (error) {
        console.error('Failed to start page tracking:', error);
      }
    };

    startTracking();

    // Clean up function to end tracking
    return () => {
      if (trackingId) {
        endTrackingSync(trackingId);
      }
    };
  }, [pathname, config.pageType, config.contentId, config.examId]);

  // Track scroll depth
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const scrollDepth = scrollHeight > 0 ? (scrolled / scrollHeight) * 100 : 0;
      maxScrollDepthRef.current = Math.max(maxScrollDepthRef.current, scrollDepth);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Track user interactions
  useEffect(() => {
    const handleInteraction = () => {
      interactionsRef.current++;
    };

    const events = ['click', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleInteraction);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, []);

  // Send heartbeat updates every 30 seconds
  useEffect(() => {
    if (!trackingId) return;

    const sendHeartbeat = async () => {
      try {
        await apiClient.updatePageTracking(trackingId, {
          interactions_count: interactionsRef.current,
          scroll_depth: maxScrollDepthRef.current
        });
        console.log(`Heartbeat sent for ${config.pageType} page`);
      } catch (error) {
        console.error('Failed to send heartbeat:', error);
      }
    };

    // Send initial heartbeat after 5 seconds
    const initialTimeout = setTimeout(sendHeartbeat, 5000);

    // Then send every 30 seconds
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      clearTimeout(initialTimeout);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [trackingId, config.pageType]);

  // End tracking function
  const endTracking = async (id: string) => {
    try {
      const response = await apiClient.endPageTracking(id);
      console.log(`Ended tracking ${config.pageType} page:`, response.duration_seconds, 'seconds');

      // Reset tracking
      setTrackingId(null);
      startTimeRef.current = null;
      interactionsRef.current = 0;
      maxScrollDepthRef.current = 0;

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    } catch (error) {
      console.error('Failed to end page tracking:', error);
    }
  };

  // Synchronous cleanup function for React
  const endTrackingSync = (id: string) => {
    console.log(`Ending tracking ${config.pageType} page (sync cleanup):`, id);

    // Fire and forget the API call - don't wait for it
    apiClient.endPageTracking(id).catch(error => {
      console.error('Failed to end page tracking in cleanup:', error);
    });

    // Immediately reset local state
    setTrackingId(null);
    startTimeRef.current = null;
    interactionsRef.current = 0;
    maxScrollDepthRef.current = 0;

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // Handle page visibility changes and beforeunload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && trackingId) {
        // Page is hidden, send a heartbeat
        apiClient.updatePageTracking(trackingId, {
          interactions_count: interactionsRef.current,
          scroll_depth: maxScrollDepthRef.current
        }).catch(console.error);
      }
    };

    const handleBeforeUnload = () => {
      if (trackingId) {
        // End tracking before page unloads (browser close/refresh)
        console.log('Page unloading, ending tracking via beforeunload');
        navigator.sendBeacon && navigator.sendBeacon('/api/v1/content/page-tracking/end/' + trackingId, '{}');
        // Fallback to sync API call
        endTrackingSync(trackingId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [trackingId]);

  return {
    trackingId,
    duration: startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000) : 0,
    interactions: interactionsRef.current,
    scrollDepth: maxScrollDepthRef.current
  };
}