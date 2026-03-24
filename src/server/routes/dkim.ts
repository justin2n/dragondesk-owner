import express from 'express';
import NodeRSA from 'node-rsa';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin } from '../middleware/auth';

const router = express.Router();

// Generate DKIM keys for a domain
router.post('/generate', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { domain, selector = 'dragondesk' } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    // Generate RSA key pair (2048-bit for DKIM)
    const key = new NodeRSA({ b: 2048 });

    // Export keys in the correct format
    const privateKey = key.exportKey('pkcs1-private-pem');
    const publicKey = key.exportKey('pkcs8-public-pem');

    // Extract public key content for DNS (remove headers and newlines)
    const publicKeyDNS = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\n/g, '');

    // Check if DKIM config already exists for this domain
    const existing = await get('SELECT id FROM dkim_config WHERE domain = ?', [domain]);

    if (existing) {
      // Update existing configuration
      await run(
        `UPDATE dkim_config
         SET selector = ?, privateKey = ?, publicKey = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE domain = ?`,
        [selector, privateKey, publicKeyDNS, domain]
      );
    } else {
      // Insert new configuration
      await run(
        `INSERT INTO dkim_config (domain, selector, privateKey, publicKey)
         VALUES (?, ?, ?, ?)`,
        [domain, selector, privateKey, publicKeyDNS]
      );
    }

    // Create DNS record instructions
    const dnsRecord = {
      type: 'TXT',
      host: `${selector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${publicKeyDNS}`,
    };

    res.json({
      success: true,
      domain,
      selector,
      publicKey: publicKeyDNS,
      dnsRecord,
      instructions: {
        step1: 'Add the following TXT record to your domain\'s DNS settings:',
        step2: `Host/Name: ${selector}._domainkey`,
        step3: `Value: v=DKIM1; k=rsa; p=${publicKeyDNS}`,
        step4: 'Wait for DNS propagation (can take up to 48 hours, usually much faster)',
        step5: 'Use the "Verify DNS" button to check if the record is properly configured',
      },
    });
  } catch (error: any) {
    console.error('Error generating DKIM keys:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get DKIM configuration
router.get('/config', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const configs = await query('SELECT id, domain, selector, publicKey, isActive, createdAt, updatedAt FROM dkim_config ORDER BY createdAt DESC');
    res.json(configs);
  } catch (error: any) {
    console.error('Error fetching DKIM config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific DKIM configuration by domain
router.get('/config/:domain', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { domain } = req.params;
    const config = await get(
      'SELECT id, domain, selector, publicKey, isActive, createdAt, updatedAt FROM dkim_config WHERE domain = ?',
      [domain]
    );

    if (!config) {
      return res.status(404).json({ error: 'DKIM configuration not found for this domain' });
    }

    // Create DNS record for display
    const dnsRecord = {
      type: 'TXT',
      host: `${config.selector}._domainkey.${config.domain}`,
      value: `v=DKIM1; k=rsa; p=${config.publicKey}`,
    };

    res.json({ ...config, dnsRecord });
  } catch (error: any) {
    console.error('Error fetching DKIM config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify DNS record
router.post('/verify/:domain', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { domain } = req.params;
    const dns = require('dns').promises;

    const config = await get('SELECT selector, publicKey FROM dkim_config WHERE domain = ?', [domain]);

    if (!config) {
      return res.status(404).json({ error: 'DKIM configuration not found for this domain' });
    }

    const dnsHost = `${config.selector}._domainkey.${domain}`;

    try {
      const records = await dns.resolveTxt(dnsHost);

      // Check if any record matches our public key
      let found = false;
      let recordValue = '';

      for (const record of records) {
        const txtValue = record.join('');
        recordValue = txtValue;

        // Check if the TXT record contains our public key
        if (txtValue.includes(config.publicKey)) {
          found = true;
          break;
        }
      }

      if (found) {
        res.json({
          verified: true,
          message: 'DKIM DNS record is correctly configured!',
          record: recordValue,
        });
      } else {
        res.json({
          verified: false,
          message: 'DKIM DNS record exists but does not match the configured public key',
          found: recordValue,
          expected: `v=DKIM1; k=rsa; p=${config.publicKey}`,
        });
      }
    } catch (dnsError: any) {
      res.json({
        verified: false,
        message: 'DKIM DNS record not found. Please add the TXT record to your domain\'s DNS settings.',
        error: dnsError.code || dnsError.message,
      });
    }
  } catch (error: any) {
    console.error('Error verifying DKIM DNS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle DKIM active status
router.patch('/config/:domain/toggle', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { domain } = req.params;
    const { isActive } = req.body;

    await run(
      'UPDATE dkim_config SET isActive = ?, updatedAt = CURRENT_TIMESTAMP WHERE domain = ?',
      [isActive ? 1 : 0, domain]
    );

    res.json({ success: true, message: `DKIM signing ${isActive ? 'enabled' : 'disabled'} for ${domain}` });
  } catch (error: any) {
    console.error('Error toggling DKIM status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete DKIM configuration
router.delete('/config/:domain', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { domain } = req.params;

    await run('DELETE FROM dkim_config WHERE domain = ?', [domain]);

    res.json({ success: true, message: 'DKIM configuration deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting DKIM config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
