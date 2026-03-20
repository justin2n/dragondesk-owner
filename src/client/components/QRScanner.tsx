import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import styles from './QRScanner.module.css';

interface QRScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  isActive?: boolean;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onError, isActive = true }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) {
      stopScanner();
      return;
    }

    startScanner();

    return () => {
      stopScanner();
    };
  }, [isActive]);

  const startScanner = async () => {
    if (scannerRef.current || !containerRef.current) return;

    try {
      const html5QrCode = new Html5Qrcode('qr-scanner-container');
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          // Successfully scanned
          onScan(decodedText);
        },
        () => {
          // QR code not found in frame - this is normal, don't show error
        }
      );

      setIsScanning(true);
      setError(null);
    } catch (err: any) {
      console.error('QR Scanner error:', err);

      if (err.message?.includes('NotAllowedError') || err.message?.includes('Permission')) {
        setError('Camera permission denied. Please allow camera access to scan QR codes.');
      } else if (err.message?.includes('NotFoundError')) {
        setError('No camera found. Please ensure your device has a camera.');
      } else {
        setError('Unable to start camera. Please try again.');
      }

      if (onError) {
        onError(err.message || 'Scanner error');
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        setIsScanning(false);
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const requestPermission = async () => {
    setError(null);
    await startScanner();
  };

  return (
    <div className={styles.scannerWrapper}>
      <div className={styles.scannerContainer}>
        <div id="qr-scanner-container" ref={containerRef} className={styles.scanner} />

        {!isScanning && !error && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>
              <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
                <path d="M4 4h4V2H2v6h2V4zm16 0h-4V2h6v6h-2V4zM4 20h4v2H2v-6h2v4zm16 0h-4v2h6v-6h-2v4zM12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
              </svg>
            </div>
            <p>Initializing camera...</p>
          </div>
        )}

        {error && (
          <div className={styles.errorContainer}>
            <div className={styles.errorIcon}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
            <p className={styles.errorText}>{error}</p>
            <button onClick={requestPermission} className={styles.retryButton}>
              Try Again
            </button>
          </div>
        )}

        {isScanning && (
          <div className={styles.scannerOverlay}>
            <div className={styles.scannerFrame}>
              <div className={styles.corner} data-position="top-left" />
              <div className={styles.corner} data-position="top-right" />
              <div className={styles.corner} data-position="bottom-left" />
              <div className={styles.corner} data-position="bottom-right" />
              <div className={styles.scanLine} />
            </div>
          </div>
        )}
      </div>

      {isScanning && (
        <p className={styles.scannerHint}>Position the QR code within the frame</p>
      )}
    </div>
  );
};

export default QRScanner;
