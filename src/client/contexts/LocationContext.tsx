import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

export interface Location {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country: string;
  phone?: string;
  email?: string;
  timezone: string;
  isActive: boolean;
  isPrimary: boolean;
  settings?: any;
  createdAt: string;
  updatedAt: string;
}

interface LocationContextType {
  locations: Location[];
  selectedLocation: Location | null;
  isAllLocations: boolean;
  setSelectedLocation: (location: Location | null) => void;
  setAllLocations: () => void;
  loadLocations: () => Promise<void>;
  isLoading: boolean;
}

export const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocationState] = useState<Location | null>(null);
  const [isAllLocations, setIsAllLocations] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setIsLoading(true);
      const data = await api.get('/locations?isActive=true');
      setLocations(data);

      // Load saved location preference
      const savedLocationId = localStorage.getItem('selectedLocationId');
      const savedIsAllLocations = localStorage.getItem('isAllLocations');

      if (savedIsAllLocations === 'true') {
        setIsAllLocations(true);
        setSelectedLocationState(null);
      } else if (savedLocationId) {
        const location = data.find((loc: Location) => loc.id === parseInt(savedLocationId));
        if (location) {
          setSelectedLocationState(location);
          setIsAllLocations(false);
        } else {
          // Default to primary or first location
          const primaryLocation = data.find((loc: Location) => loc.isPrimary) || data[0];
          setSelectedLocationState(primaryLocation);
          setIsAllLocations(false);
        }
      } else {
        // Default to all locations if no preference saved
        setIsAllLocations(true);
        setSelectedLocationState(null);
      }
    } catch (error) {
      console.error('Failed to load locations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setSelectedLocation = (location: Location | null) => {
    console.log('[LocationContext] setSelectedLocation called:', location?.name, location?.id);
    setSelectedLocationState(location);
    setIsAllLocations(false);
    if (location) {
      localStorage.setItem('selectedLocationId', location.id.toString());
      localStorage.setItem('isAllLocations', 'false');
    }
  };

  const setAllLocations = () => {
    console.log('[LocationContext] setAllLocations called');
    setSelectedLocationState(null);
    setIsAllLocations(true);
    localStorage.setItem('isAllLocations', 'true');
    localStorage.removeItem('selectedLocationId');
  };

  return (
    <LocationContext.Provider
      value={{
        locations,
        selectedLocation,
        isAllLocations,
        setSelectedLocation,
        setAllLocations,
        loadLocations,
        isLoading,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
