import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete, DirectionsRenderer } from '@react-google-maps/api';
import { useSounds } from './hooks/useSounds';
import { useOffline } from './hooks/useOffline';
import { SoundControls } from './components/SoundControls';
import { OfflineStatus } from './components/OfflineStatus';

// Definições de tipos para Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }
  
  interface Bluetooth {
    requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  }
  
  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: string[];
  }
  
  interface BluetoothLEScanFilter {
    name?: string;
    namePrefix?: string;
    services?: string[];
  }
  
  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
  }
  
  interface BluetoothRemoteGATTServer {
    connect(): Promise<BluetoothRemoteGATTServer>;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
    connected: boolean;
    disconnect(): void;
  }
  
  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  
  interface BluetoothRemoteGATTCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: string, listener: EventListener): void;
    value?: DataView;
  }
}

// ##################################################################
// # COLOQUE SUAS CHAVES AQUI                                       #
// ##################################################################

// 1. CHAVE DA API GOOGLE MAPS PLATFORM
//    Ative as APIs: "Maps JavaScript API", "Directions API", "Places API"
//    Instruções: https://developers.google.com/maps/gmp-get-started
const GOOGLE_MAPS_API_KEY = "AIzaSyAVEzH5bvFPDpgjQtnA4s2TKfjEW_0OTLY";

// 2. CONFIGURAÇÕES BLUETOOTH
//    Nome do dispositivo ESP32 que aparecerá na lista de dispositivos Bluetooth
const ESP32_DEVICE_NAME = "ESP32_Navigation"; // Altere para o nome do seu ESP32
const ESP32_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb"; // UUID do serviço
const ESP32_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"; // UUID da característica

// ##################################################################

// Interface para a estrutura da rota salva
interface SavedRoute {
  name: string;
  directions: google.maps.DirectionsResult;
}

// Interface para dispositivo Bluetooth
interface BluetoothDevice {
  id: string;
  name: string;
  gatt?: BluetoothRemoteGATTServer;
}

// Estados da aplicação
type AppState = 'loading' | 'intro' | 'main';

const containerStyle = {
  width: '100%',
  height: '100%'
};

// Adicionando uma constante para a distância de gatilho
const NAVIGATION_TRIGGER_DISTANCE_METERS = 50; // Dispara o envio da instrução a 50 metros

const libraries: "places"[] = ["places"];

function App() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  // Estados da aplicação
  const [appState, setAppState] = useState<AppState>('loading');
  const [introStep, setIntroStep] = useState(0);
  const [showLocationRequest, setShowLocationRequest] = useState(false);

  const [, setMap] = useState<google.maps.Map | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [currentPosition, setCurrentPosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [simplifiedInstructions, setSimplifiedInstructions] = useState<string[]>([]);
  
  // Novos estados para gerenciar a navegação e rotas salvas
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const locationWatcherId = useRef<number | null>(null);
  
  // Estados para Bluetooth
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [bluetoothCharacteristic, setBluetoothCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);
  
  const destinationRef = useRef<HTMLInputElement>(null);

  // Sistema de sons
  const { playSound, preloadSounds } = useSounds();

  // Animação de entrada
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppState('intro');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Sequência de animação do intro
  useEffect(() => {
    if (appState === 'intro') {
      const timer = setTimeout(() => {
        setIntroStep(1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [appState]);

  useEffect(() => {
    if (introStep === 1) {
      const timer = setTimeout(() => {
        setIntroStep(2);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [introStep]);

  useEffect(() => {
    if (introStep === 2) {
      const timer = setTimeout(() => {
        setShowLocationRequest(true);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [introStep]);

  // Sistema offline
  const { 
    isOnline, 
    registerServiceWorker
  } = useOffline();

  // Verificar se o navegador suporta Web Bluetooth
  const isBluetoothSupported = () => {
    return 'bluetooth' in navigator;
  };

  // Função para conectar ao ESP32 via Bluetooth
  const connectToESP32 = async () => {
    playSound('click');
    if (!isBluetoothSupported() || !navigator.bluetooth) {
      alert("Seu navegador não suporta Web Bluetooth. Use Chrome ou Edge.");
      playSound('error');
      return;
    }

    setIsConnectingBluetooth(true);
    
    try {
      // Solicitar dispositivo Bluetooth
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          {
            name: ESP32_DEVICE_NAME
          },
          {
            namePrefix: "ESP32"
          }
        ],
        optionalServices: [ESP32_SERVICE_UUID]
      });

      console.log("Dispositivo selecionado:", device.name);

      // Conectar ao GATT Server
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error("Não foi possível conectar ao servidor GATT");
      }

      // Obter o serviço
      const service = await server.getPrimaryService(ESP32_SERVICE_UUID);
      
      // Obter a característica para escrita
      const characteristic = await service.getCharacteristic(ESP32_CHARACTERISTIC_UUID);
      
      // Habilitar notificações se disponível
      try {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
          const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
          const value = target.value;
          if (value) {
            const decoder = new TextDecoder();
            const message = decoder.decode(value);
            console.log("Mensagem recebida do ESP32:", message);
          }
        });
      } catch (error) {
        console.log("Notificações não disponíveis, apenas escrita");
      }

      setBluetoothDevice({
        id: device.id,
        name: device.name || ESP32_DEVICE_NAME,
        gatt: server
      });
      setBluetoothCharacteristic(characteristic);
      setIsBluetoothConnected(true);
      
      console.log("Conectado ao ESP32 via Bluetooth!");
      alert("Conectado ao ESP32 via Bluetooth!");
      playSound('connect');
      
    } catch (error) {
      console.error("Erro ao conectar Bluetooth:", error);
      if (error instanceof Error) {
        if (error.name === 'NotFoundError') {
          alert("ESP32 não encontrado. Verifique se está ligado e visível.");
        } else if (error.name === 'NotAllowedError') {
          alert("Permissão negada para Bluetooth.");
        } else {
          alert(`Erro de conexão: ${error.message}`);
        }
      } else {
        alert("Erro desconhecido ao conectar Bluetooth.");
        playSound('error');
      }
    } finally {
      setIsConnectingBluetooth(false);
    }
  };

  // Função para desconectar Bluetooth
  const disconnectBluetooth = async () => {
    playSound('click');
    if (bluetoothDevice?.gatt?.connected) {
      await bluetoothDevice.gatt.disconnect();
    }
    setBluetoothDevice(null);
    setBluetoothCharacteristic(null);
    setIsBluetoothConnected(false);
    console.log("Desconectado do ESP32");
    playSound('disconnect');
  };

  // Função para enviar instrução via Bluetooth
  const sendInstructionViaBluetooth = useCallback(async (instruction: string) => {
    if (!bluetoothCharacteristic || !isBluetoothConnected) {
      console.error("Bluetooth não conectado");
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(instruction + '\n'); // Adiciona quebra de linha
      
      await bluetoothCharacteristic.writeValue(data);
      console.log(`Instrução enviada via Bluetooth: ${instruction}`);
    } catch (error) {
      console.error("Erro ao enviar via Bluetooth:", error);
      alert("Erro ao enviar instrução via Bluetooth. Verifique a conexão.");
    }
  }, [bluetoothCharacteristic, isBluetoothConnected]);

  // Função para enviar instrução (agora usa Bluetooth em vez de HTTP)
  const sendSingleInstructionToESP32 = useCallback(async (instruction: string) => {
    if (isBluetoothConnected) {
      await sendInstructionViaBluetooth(instruction);
    } else {
      console.log("Bluetooth não conectado. Instrução não enviada.");
      alert("Conecte ao ESP32 via Bluetooth primeiro.");
    }
  }, [isBluetoothConnected, sendInstructionViaBluetooth]);

  // Solicitar localização
  const requestLocation = () => {
    playSound('click');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentPosition(pos);
          setShowLocationRequest(false);
          setAppState('main');
          playSound('success');
        },
        () => {
          alert("Erro: O serviço de geolocalização falhou.");
          playSound('error');
        }
      );
    } else {
      alert("Erro: Seu navegador não suporta geolocalização.");
      playSound('error');
    }
  };

  // O hook useOffline já monitora o status online/offline automaticamente

  // Efeito para carregar as rotas salvas do localStorage ao iniciar
  useEffect(() => {
    try {
      const routesFromStorage = localStorage.getItem('savedNavigationRoutes');
      if (routesFromStorage) {
        setSavedRoutes(JSON.parse(routesFromStorage));
      }
    } catch (error) {
      console.error("Erro ao carregar rotas do localStorage:", error);
    }
  }, []);

  // Pré-carregar sons quando a aplicação inicia
  useEffect(() => {
    preloadSounds();
  }, [preloadSounds]);

  // Registrar service worker para funcionalidade offline
  useEffect(() => {
    registerServiceWorker();
  }, [registerServiceWorker]);

  // Nova função para calcular a distância entre dois pontos de GPS (fórmula de Haversine)
  const getDistanceInMeters = useCallback((pos1: google.maps.LatLngLiteral, pos2: google.maps.LatLngLiteral) => {
    const R = 6371e3; // Metros
    const p1 = (pos1.lat * Math.PI) / 180;
    const p2 = (pos2.lat * Math.PI) / 180;
    const deltaP = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const deltaL = ((pos2.lng - pos1.lng) * Math.PI) / 180;
    const a =
      Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // em metros
  }, []);

  const calculateRoute = async () => {
    playSound('click');
    if (!isOnline) {
      alert("Funcionalidade indisponível offline. Carregue uma rota salva.");
      playSound('error');
      return;
    }
    if (!destinationRef.current?.value || !currentPosition) {
      playSound('error');
      return;
    }
    
    const directionsService = new google.maps.DirectionsService();
    const results = await directionsService.route({
      origin: currentPosition,
      destination: destinationRef.current.value,
      travelMode: google.maps.TravelMode.DRIVING,
      language: 'pt-BR', // Instruções em Português
    });

    setDirectionsResponse(results);
    generateSimplifiedInstructions(results);
    playSound('success');
  };
  
  const generateSimplifiedInstructions = (directions: google.maps.DirectionsResult) => {
    if (!directions.routes || directions.routes.length === 0) {
      return;
    }
    const route = directions.routes[0].legs[0];
    const instructions = route.steps.map((step: google.maps.DirectionsStep) => {
      // Remove tags HTML da instrução (ex: <b>, <div>)
      const cleanInstruction = step.instructions.replace(/<[^>]*>/g, '');
      const distance = step.distance?.text || '';
      return `${cleanInstruction} (${distance})`;
    });
    setSimplifiedInstructions(instructions);
  };

  // Funções para gerenciar rotas salvas
  const saveCurrentRoute = () => {
    if (!isOnline) {
      alert("Funcionalidade indisponível offline.");
      return;
    }
    if (!directionsResponse || !destinationRef.current?.value) {
      alert("Nenhuma rota calculada para salvar.");
      return;
    }

    const routeName = destinationRef.current.value;

    if (savedRoutes.some(route => route.name === routeName)) {
      if (!window.confirm(`Uma rota para "${routeName}" já existe. Deseja substituí-la?`)) {
        return;
      }
    }

    const newRoute: SavedRoute = { name: routeName, directions: directionsResponse };
    const updatedRoutes = savedRoutes.filter(route => route.name !== routeName);
    updatedRoutes.push(newRoute);

    setSavedRoutes(updatedRoutes);
    localStorage.setItem('savedNavigationRoutes', JSON.stringify(updatedRoutes));
    alert(`Rota para "${routeName}" salva com sucesso!`);
  };

  const loadSavedRoute = (routeToLoad: SavedRoute) => {
    setDirectionsResponse(routeToLoad.directions);
    generateSimplifiedInstructions(routeToLoad.directions);
    setIsNavigating(false);
    if (destinationRef.current) {
        destinationRef.current.value = routeToLoad.name;
    }
    alert(`Rota para "${routeToLoad.name}" carregada.`);
  };

  const deleteSavedRoute = (indexToDelete: number) => {
    if (window.confirm("Tem certeza que deseja deletar esta rota?")) {
      const updatedRoutes = savedRoutes.filter((_, index) => index !== indexToDelete);
      setSavedRoutes(updatedRoutes);
      localStorage.setItem('savedNavigationRoutes', JSON.stringify(updatedRoutes));
    }
  };

  const stopNavigation = useCallback(() => {
    playSound('click');
    if (locationWatcherId.current !== null) {
      navigator.geolocation.clearWatch(locationWatcherId.current);
      locationWatcherId.current = null;
    }
    setIsNavigating(false);
    alert("Navegação encerrada.");
    playSound('notification');
  }, [playSound]);

  const advanceToStep = useCallback((stepIndex: number) => {
    if (!directionsResponse) return;
    const route = directionsResponse.routes[0].legs[0];
    if (stepIndex >= route.steps.length) {
      sendSingleInstructionToESP32("Você chegou ao seu destino!");
      stopNavigation();
      playSound('success');
      return;
    }
    const step = route.steps[stepIndex];
    const instructionText = step.instructions.replace(/<[^>]*>/g, '');
    sendSingleInstructionToESP32(instructionText);
    setCurrentStepIndex(prevIndex => prevIndex + 1);
    playSound('instruction');
  }, [directionsResponse, sendSingleInstructionToESP32, playSound, stopNavigation]);

  const handleLocationUpdate = useCallback((position: GeolocationPosition) => {
    if (!directionsResponse?.routes[0]) return;
    const userPosition: google.maps.LatLngLiteral = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    setCurrentPosition(userPosition);
    const route = directionsResponse.routes[0].legs[0];
    if (currentStepIndex >= route.steps.length) {
      advanceToStep(currentStepIndex); // Para enviar a mensagem final
      return;
    }
    const nextStep = route.steps[currentStepIndex];
    
    let nextStepLocation: google.maps.LatLngLiteral;
    const startLocation = nextStep.start_location;

    if (typeof startLocation.lat === 'function') {
      nextStepLocation = { lat: startLocation.lat(), lng: startLocation.lng() };
    } else {
      nextStepLocation = startLocation as unknown as google.maps.LatLngLiteral;
    }

    const distance = getDistanceInMeters(userPosition, nextStepLocation);
    if (distance < NAVIGATION_TRIGGER_DISTANCE_METERS) {
      advanceToStep(currentStepIndex);
    }
  }, [directionsResponse, currentStepIndex, advanceToStep, getDistanceInMeters]);

  const handleLocationError = useCallback((error: GeolocationPositionError) => {
    alert(`Erro de geolocalização: ${error.message}`);
    stopNavigation();
  }, [stopNavigation]);
  
  // Este useEffect é o cérebro da navegação em tempo real
  useEffect(() => {
    if (!isNavigating) {
        return;
    }

    locationWatcherId.current = navigator.geolocation.watchPosition(
      handleLocationUpdate, 
      handleLocationError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      if (locationWatcherId.current !== null) {
        navigator.geolocation.clearWatch(locationWatcherId.current);
      }
    };
  }, [isNavigating, handleLocationUpdate, handleLocationError]);

  const startNavigation = () => {
    playSound('click');
    if (!directionsResponse) {
      alert("Carregue uma rota primeiro.");
      playSound('error');
      return;
    }
    stopNavigation(); // Garante que qualquer watch anterior seja limpo
    setCurrentStepIndex(0);
    setIsNavigating(true);
    alert("Iniciando a navegação!");
    playSound('navigation');
  };
  
  const forceNextInstruction = () => {
      if (!isNavigating) {
          alert("A navegação não está ativa.");
          return;
      }
      advanceToStep(currentStepIndex);
  };

  // Novos estados para gerenciar a interação com a IA
  const [iaResposta, setIaResposta] = useState('');
  const [iaLoading, setIaLoading] = useState(false);

  // Função para enviar comando BLE para ESP32 iniciar IA
  const perguntarIA = async () => {
    setIaLoading(true);
    setIaResposta('');
    try {
      // Exemplo: envia comando BLE (ajuste para sua lib BLE)
      // await bleSend('IA_START');
      // Aguarda resposta do ESP32 (pode ser via BLE notification ou polling)
      // Exemplo fictício:
      // const resposta = await bleReadIaResposta();
      // setIaResposta(resposta);
      // Simulação temporária:
      setTimeout(() => {
        setIaResposta('Resposta da IA recebida do ESP32!');
        setIaLoading(false);
      }, 4000);
    } catch (e) {
      setIaResposta('Erro ao perguntar à IA');
      setIaLoading(false);
    }
  };

  if (!isLoaded) return <div className="loading-screen">Carregando...</div>;

  // Tela de carregamento
  if (appState === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <img src="/assets/glasses-logo.png" alt="Castrilha" className="glasses-image" />
        </div>
        <div className="loading-text">Castrilha</div>
      </div>
    );
  }

  // Tela de introdução
  if (appState === 'intro') {
    return (
      <div className="intro-screen">
        <div className={`intro-logo ${introStep >= 1 ? 'animate' : ''}`}>
          <img src="/assets/glasses-logo.png" alt="Castrilha" className="glasses-image" />
        </div>
        <div className={`intro-title ${introStep >= 2 ? 'animate' : ''}`}>
          <img src="/assets/nomepx.png" alt="Castrilha" className="title-image" />
        </div>
        {showLocationRequest && (
          <div className="location-request">
            <h3>Permitir acesso à localização?</h3>
            <p>Precisamos da sua localização para fornecer navegação precisa.</p>
            <button className="btn-primary" onClick={requestLocation}>
              Permitir Localização
            </button>
          </div>
        )}
      </div>
    );
  }

  // Tela principal
  return (
    <div className='app-container'>
      <div className='sidebar'>
        <div className='header'>
          <div className='logo-container'>
            <img src="/assets/glasses-logo-small.png" alt="Castrilha" className="glasses-logo-image" />
            <h1 className='app-title'>Castrilha</h1>
          </div>
          <div className="header-controls">
            <OfflineStatus className="header-offline-status" />
            <SoundControls className="header-sound-controls" />
          </div>
        </div>
        
        {!isOnline && (
          <div className='offline-banner'>
            <p>MODO OFFLINE ATIVO</p>
          </div>
        )}

        <div className='bluetooth-controls'>
          <h3>🔵 Conexão Bluetooth</h3>
          <div className='bluetooth-status'>
            {isBluetoothConnected ? (
              <div className='connected-status'>
                <span className='status-indicator connected'></span>
                <span>Conectado: {bluetoothDevice?.name}</span>
                <button 
                  className='button disconnect-btn' 
                  onClick={disconnectBluetooth}
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <div className='disconnected-status'>
                <span className='status-indicator disconnected'></span>
                <span>Desconectado</span>
                <button 
                  className='button connect-btn' 
                  onClick={connectToESP32}
                  disabled={isConnectingBluetooth}
                >
                  {isConnectingBluetooth ? 'Conectando...' : 'Conectar ESP32'}
                </button>
              </div>
            )}
          </div>
          {!isBluetoothSupported() && (
            <div className='bluetooth-warning'>
              ⚠️ Seu navegador não suporta Web Bluetooth. Use Chrome ou Edge.
            </div>
          )}
        </div>

        <div className='controls-container'>
          <h2>Navegação Ponto a Ponto</h2>
          <div className='input-group'>
            <Autocomplete>
              <input 
                type='text' 
                placeholder='Destino' 
                ref={destinationRef}
                disabled={!isOnline}
              />
            </Autocomplete>
          </div>
          <div className='button-group'>
            <button 
              className='button' 
              onClick={calculateRoute}
              disabled={!isOnline}
            >
              Obter Rota
            </button>
            <button 
              className='button' 
              onClick={saveCurrentRoute}
              disabled={!isOnline}
            >
              Salvar Rota Atual
            </button>
          </div>
        </div>

        <div className='navigation-controls'>
          <h3>Controle de Navegação</h3>
          <div className='button-group'>
            {!isNavigating ? (
                <button onClick={startNavigation} className='button start-nav-btn' disabled={!directionsResponse}>
                    Iniciar Navegação
                </button>
            ) : (
                <button onClick={stopNavigation} className='button stop-nav-btn'>
                    Parar Navegação
                </button>
            )}
            <button onClick={forceNextInstruction} className='button' disabled={!isNavigating}>
                Próxima Instrução (Teste)
            </button>
          </div>
          {isNavigating && (
              <p className='nav-status'>Navegação em curso... Próximo passo: {currentStepIndex + 1}</p>
          )}
        </div>

        <div className='saved-routes-container'>
          <h3>Rotas Salvas</h3>
          <ul className='route-list'>
            {savedRoutes.length > 0 ? (
              savedRoutes.map((route, index) => (
                <li key={index} className='route-item'>
                  <span>{route.name}</span>
                  <div className='route-item-buttons'>
                    <button onClick={() => loadSavedRoute(route)}>Carregar</button>
                    <button onClick={() => deleteSavedRoute(index)} className='delete-btn'>X</button>
                  </div>
                </li>
              ))
            ) : (
              <p>Nenhuma rota salva.</p>
            )}
          </ul>
        </div>

        <div className='instructions-container'>
            <h3>Instruções</h3>
            <ul className='instructions-list'>
                {simplifiedInstructions.map((inst, index) => (
                    <li key={index} className={index === currentStepIndex -1 ? 'current-instruction' : ''}>
                        {inst}
                    </li>
                ))}
            </ul>
        </div>
      </div>

      <div className='map-container'>
        {isOnline ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={currentPosition || { lat: -23.55052, lng: -46.633308 }}
            zoom={15}
            onLoad={setMap}
            options={{
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          >
            {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
            {currentPosition && <Marker position={currentPosition} />}
          </GoogleMap>
        ) : (
          <div className='offline-map-placeholder'>
            <h2>Mapa indisponível em modo offline</h2>
            <p>Use as rotas salvas para navegar. A sua localização continua sendo rastreada.</p>
          </div>
        )}
      </div>

      <button onClick={perguntarIA} disabled={iaLoading} style={{margin: '16px', padding: '12px', fontSize: '1.2em'}}>
        Perguntar à IA
      </button>
      {iaLoading && <div>Aguardando resposta da IA...</div>}
      {iaResposta && <div><strong>IA:</strong> {iaResposta}</div>}
    </div>
  );
}

export default App;