import React, { useState } from 'react';
import { useToast } from './Toast';
import styles from './QRCodeDisplay.module.css';

interface QRCodeDisplayProps {
  qrCodeData: string;
  memberName?: string;
  size?: number;
  showDownload?: boolean;
  showWalletButtons?: boolean;
  memberId?: number;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  qrCodeData,
  memberName,
  size = 200,
  showDownload = true,
  showWalletButtons = false,
  memberId
}) => {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [walletLoading, setWalletLoading] = useState<'apple' | 'google' | null>(null);

  const handleDownload = async () => {
    if (!memberId) return;

    setDownloading(true);
    try {
      const response = await fetch(`/api/qr-codes/download/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qrcode-${memberName?.replace(/\s+/g, '-') || memberId}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading QR code:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handleWalletPass = async (passType: 'apple' | 'google') => {
    if (!memberId) return;

    setWalletLoading(passType);
    try {
      const response = await fetch(`/api/wallet-passes/generate/${memberId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ passType })
      });

      const data = await response.json();

      if (data.stubbed) {
        toast(data.message, 'info');
      } else if (data.success) {
        toast(`${passType === 'apple' ? 'Apple' : 'Google'} Wallet pass generated successfully!`, 'success');
      }
    } catch (error) {
      console.error('Error generating wallet pass:', error);
    } finally {
      setWalletLoading(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.qrWrapper} style={{ width: size, height: size }}>
        {qrCodeData.startsWith('data:') ? (
          <img
            src={qrCodeData}
            alt={`QR Code for ${memberName || 'member'}`}
            className={styles.qrImage}
          />
        ) : (
          <div className={styles.qrPlaceholder}>
            <span>QR Code</span>
          </div>
        )}
      </div>

      {memberName && (
        <p className={styles.memberName}>{memberName}</p>
      )}

      <div className={styles.actions}>
        {showDownload && memberId && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={styles.downloadBtn}
          >
            {downloading ? 'Downloading...' : 'Download PNG'}
          </button>
        )}

        {showWalletButtons && memberId && (
          <div className={styles.walletButtons}>
            <button
              onClick={() => handleWalletPass('apple')}
              disabled={walletLoading !== null}
              className={`${styles.walletBtn} ${styles.appleWallet}`}
            >
              {walletLoading === 'apple' ? 'Generating...' : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Apple Wallet
                </>
              )}
            </button>
            <button
              onClick={() => handleWalletPass('google')}
              disabled={walletLoading !== null}
              className={`${styles.walletBtn} ${styles.googleWallet}`}
            >
              {walletLoading === 'google' ? 'Generating...' : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                  </svg>
                  Google Wallet
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRCodeDisplay;
