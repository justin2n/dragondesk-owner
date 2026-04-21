import React, { createContext, useContext, useState, useEffect } from 'react';

interface BrandingSettings {
  gymName: string;
  logo: string | null;
  favicon: string | null;
  primaryColor: string;
  showPoweredBy: boolean;
}

interface BrandingContextType {
  branding: BrandingSettings;
  updateBranding: (settings: Partial<BrandingSettings>) => void;
}

const defaultBranding: BrandingSettings = {
  gymName: 'DragonDesk',
  logo: null,
  favicon: null,
  primaryColor: '#dc2626',
  showPoweredBy: true,
};

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);

  useEffect(() => {
    // Load branding from localStorage on mount
    const savedBranding = localStorage.getItem('branding');
    if (savedBranding) {
      try {
        const parsed = JSON.parse(savedBranding);
        const merged = { ...defaultBranding, ...parsed };
        setBranding(merged);
        // Apply accent color immediately on load
        if (merged.primaryColor) {
          document.documentElement.style.setProperty('--color-red', merged.primaryColor);
          document.documentElement.style.setProperty('--color-red-hover', adjustColor(merged.primaryColor, -20));
          document.documentElement.style.setProperty('--color-red-light', adjustColor(merged.primaryColor, 20));
        }
      } catch (error) {
        console.error('Failed to parse branding settings:', error);
      }
    }
  }, []);

  const updateBranding = (settings: Partial<BrandingSettings>) => {
    const newBranding = { ...branding, ...settings };
    setBranding(newBranding);
    localStorage.setItem('branding', JSON.stringify(newBranding));

    // Update CSS variables for accent color
    if (settings.primaryColor) {
      document.documentElement.style.setProperty('--color-red', settings.primaryColor);
      document.documentElement.style.setProperty('--color-red-hover', adjustColor(settings.primaryColor, -20));
      document.documentElement.style.setProperty('--color-red-light', adjustColor(settings.primaryColor, 20));
    }
  };

  return (
    <BrandingContext.Provider value={{ branding, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
};

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
