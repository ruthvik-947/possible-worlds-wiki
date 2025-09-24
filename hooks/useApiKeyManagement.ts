import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { config } from '../lib/config';

export interface UseApiKeyManagementReturn {
  enableUserApiKeys: boolean;
  hasUserApiKey: boolean;
  isApiDialogOpen: boolean;
  setIsApiDialogOpen: (open: boolean) => void;
  handleApiKeyStored: () => void;
  handleApiKeyRemoved: () => void;
  showApiKeyRequiredToast: () => void;
  requireAuthToken: () => Promise<string>;
}

export function useApiKeyManagement(): UseApiKeyManagementReturn {
  const [enableUserApiKeys, setEnableUserApiKeys] = useState<boolean>(false);
  const [hasUserApiKey, setHasUserApiKey] = useState<boolean>(false);
  const [isApiDialogOpen, setIsApiDialogOpen] = useState<boolean>(false);
  const { isLoaded: isAuthLoaded, isSignedIn, getToken } = useAuth();

  const requireAuthToken = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    if (!token) {
      throw new Error('Unable to retrieve authentication token from Clerk. Please sign in again.');
    }
    return token;
  }, [getToken]);

  const showApiKeyRequiredToast = useCallback(() => {
    const { toast } = require('sonner');
    toast.error(
      'Please set your API key first',
      {
        description: 'Click here to open the API key dialog',
        action: {
          label: 'Set API Key',
          onClick: () => setIsApiDialogOpen(true)
        },
        duration: 5000
      }
    );
  }, []);

  const handleApiKeyStored = useCallback(() => {
    const { toast } = require('sonner');
    setHasUserApiKey(true);
    toast.success('API key set');
  }, []);

  const handleApiKeyRemoved = useCallback(() => {
    const { toast } = require('sonner');
    setHasUserApiKey(false);
    toast.success('API key removed');
  }, []);

  // Check configuration once auth is available
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      setHasUserApiKey(false);
      return;
    }

    let isActive = true;

    const fetchConfig = async () => {
      try {
        const token = await requireAuthToken();
        const response = await fetch(config.endpoints.config, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to load configuration (${response.status})`);
        }

        const configData = await response.json();
        if (isActive) {
          setEnableUserApiKeys(configData.enableUserApiKeys);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };

    fetchConfig();

    return () => {
      isActive = false;
    };
  }, [isAuthLoaded, isSignedIn, requireAuthToken]);

  // Fetch whether the user already stored an API key
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      setHasUserApiKey(false);
      return;
    }

    let isActive = true;

    const fetchStoredKeyStatus = async () => {
      try {
        const token = await requireAuthToken();
        const response = await fetch(config.endpoints.storeKey, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to check stored API key (${response.status})`);
        }

        const data = await response.json();
        if (isActive) {
          setHasUserApiKey(Boolean(data.hasKey));
        }
      } catch (err) {
        console.error('Failed to determine stored API key status:', err);
      }
    };

    fetchStoredKeyStatus();

    return () => {
      isActive = false;
    };
  }, [isAuthLoaded, isSignedIn, requireAuthToken]);

  return {
    enableUserApiKeys,
    hasUserApiKey,
    isApiDialogOpen,
    setIsApiDialogOpen,
    handleApiKeyStored,
    handleApiKeyRemoved,
    showApiKeyRequiredToast,
    requireAuthToken
  };
}