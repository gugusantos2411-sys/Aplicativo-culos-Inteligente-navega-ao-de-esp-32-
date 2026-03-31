import { useState, useEffect, useCallback } from 'react';

interface OfflineData {
  savedRoutes: any[];
  userPreferences: {
    volume: number;
    soundEnabled: boolean;
    theme: string;
  };
  lastSync: number;
}

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Monitorar status online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Verificar se é PWA instalado
  useEffect(() => {
    const checkIfInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any).standalone === true) {
        setIsInstalled(true);
      }
    };

    checkIfInstalled();
  }, []);

  // Capturar prompt de instalação
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Instalar PWA
  const installPWA = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstallPrompt(false);
      }
      
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  // Carregar dados offline
  const getOfflineData = useCallback((): OfflineData => {
    try {
      const data = localStorage.getItem('castrilha_offline_data');
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados offline:', error);
    }

    return {
      savedRoutes: [],
      userPreferences: {
        volume: 0.5,
        soundEnabled: true,
        theme: 'default'
      },
      lastSync: Date.now()
    };
  }, []);

  // Salvar dados offline
  const saveOfflineData = useCallback((data: Partial<OfflineData>) => {
    try {
      const currentData = getOfflineData();
      const newData = { ...currentData, ...data, lastSync: Date.now() };
      localStorage.setItem('castrilha_offline_data', JSON.stringify(newData));
    } catch (error) {
      console.error('Erro ao salvar dados offline:', error);
    }
  }, [getOfflineData]);

  // Sincronizar dados quando online
  const syncData = useCallback(async () => {
    if (!isOnline) return;

    try {
      const offlineData = getOfflineData();
      const lastSync = offlineData.lastSync;

      // Aqui você pode implementar sincronização com servidor
      console.log('Sincronizando dados...', { lastSync, isOnline });

      // Simular sincronização
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Atualizar timestamp de sincronização
      saveOfflineData({ lastSync: Date.now() });
      
    } catch (error) {
      console.error('Erro na sincronização:', error);
    }
  }, [isOnline, getOfflineData, saveOfflineData]);

  // Registrar service worker
  const registerServiceWorker = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registrado:', registration);
        return registration;
      } catch (error) {
        console.error('Erro ao registrar Service Worker:', error);
      }
    }
  }, []);

  // Solicitar notificações
  const requestNotifications = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  // Enviar notificação
  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/assets/glasses-logo-small.png',
        badge: '/assets/glasses-logo-small.png',
        ...options
      });
    }
  }, []);

  return {
    isOnline,
    isInstalled,
    showInstallPrompt,
    installPWA,
    saveOfflineData,
    getOfflineData,
    syncData,
    registerServiceWorker,
    requestNotifications,
    sendNotification
  };
}; 