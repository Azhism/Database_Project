import { Router, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import pool from '../config/database';
import { authenticate, requireVendor, AuthRequest } from '../middleware/auth';
import { checkVendorApproval } from '../middleware/checkVendorApproval';
import path from 'path';
import fs from 'fs/promises';
import * as XLSX from 'xlsx';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// All routes require vendor authentication
router.use(authenticate);
router.use(requireVendor);

// Get vendor approval status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT vendor_id, vendor_name, is_approved, is_verified, created_at
       FROM vendors
       WHERE user_id = $1`,
      [parseInt(req.userId!)]
    );

    const vendor = result.rows[0];

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    res.json({
      approved: vendor.is_approved || false,
      verified: vendor.is_verified || false,
      vendorName: vendor.vendor_name,
      createdAt: vendor.created_at,
    });
  } catch (error: any) {
    console.error('Error fetching vendor status:', error);
    res.status(500).json({ error: 'Failed to fetch vendor status' });
  }
});

// File upload route - NOW REQUIRES APPROVAL
router.post('/upload', checkVendorApproval, upload.single('file'), async (req: AuthRequest, res: Response) => {
  console.log('📤 Upload request received');
  console.log('User ID:', req.userId);
  console.log('File:', req.file?.originalname);
  
  try {
    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get vendor record for this user
    const vendorResult = await pool.query(
      'SELECT vendor_id FROM vendors WHERE user_id = $1',
      [parseInt(req.userId!)]
    );

    const vendor = vendorResult.rows[0];

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const filePath = req.file.path;
    let productsCreated = 0;
    let errors: string[] = [];

    let records: any[] = [];

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (ext === '.xlsx' || ext === '.xls') {
        const buffer = await fs.readFile(filePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
          throw new Error('Excel file does not contain any sheets');
        }

        const sheet = workbook.Sheets[sheetName];
        records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        // Read and parse CSV/TSV file
        const fileContent = await fs.readFile(filePath, 'utf-8');

        // Detect delimiter (comma or tab)
        const delimiter = fileContent.includes('\t') ? '\t' : ',';

        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter,
        });
      }

      console.log(`Parsing ${records.length} products from upload`);

      if (!records || records.length === 0) {
        return res.status(400).json({
          error: 'No data rows found in the uploaded file. Please include at least one product row.',
        });
      }

      // Process in smaller batches to avoid overwhelming database
      const BATCH_SIZE = 10;
      
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        
        // Process batch
        for (const record of batch) {
          try {
            const normalizedRecord = Object.keys(record).reduce<Record<string, any>>((acc, key) => {
              if (!key) return acc;
              acc[key.toString().trim().toLowerCase()] = record[key];
              return acc;
            }, {});

            const productName = normalizedRecord['product_name'] || normalizedRecord['name'] || normalizedRecord['product'];
            const rawPrice = normalizedRecord['price'] || normalizedRecord['unit_price'];
            const brand = normalizedRecord['brand'] || null;
            const stock = normalizedRecord['stock'] || normalizedRecord['stock_quantity'] || normalizedRecord['qty'] || '0';

            const numericPrice = typeof rawPrice === 'number'
              ? rawPrice
              : parseFloat(String(rawPrice || '').replace(/[^0-9.\-]/g, ''));
            const numericStock = typeof stock === 'number'
              ? stock
              : parseInt(String(stock || '').replace(/[^0-9\-]/g, '')) || 0;

            if (!productName || isNaN(numericPrice)) {
              errors.push(`Skipped row: missing product name or invalid price`);
              continue;
            }

            // Use UPSERT for products (INSERT ... ON CONFLICT)
            const productResult = await pool.query(
              `INSERT INTO products (product_name, base_product_name, variant_name, brand, quantity_value, quantity_unit, package_size, category_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (product_name, brand) 
               DO UPDATE SET 
                 base_product_name = EXCLUDED.base_product_name,
                 variant_name = EXCLUDED.variant_name,
                 quantity_value = EXCLUDED.quantity_value,
                 quantity_unit = EXCLUDED.quantity_unit,
                 package_size = EXCLUDED.package_size,
                 category_id = EXCLUDED.category_id
               RETURNING product_id`,
              [
                productName,
                normalizedRecord['base_product_name'] || productName,
                normalizedRecord['variant'] || normalizedRecord['variant_name'] || null,
                brand,
                normalizedRecord['quantity'] ? parseFloat(normalizedRecord['quantity']) : null,
                normalizedRecord['unit'] || normalizedRecord['quantity_unit'] || null,
                normalizedRecord['package_size'] || normalizedRecord['pack_size'] || null,
                normalizedRecord['category_id'] ? parseInt(normalizedRecord['category_id']) : null
              ]
            );

            const product = productResult.rows[0];

            // Use UPSERT for vendor listings too
            await pool.query(
              `INSERT INTO vendor_listings (product_id, vendor_id, price, stock_quantity, is_available)
               VALUES ($1, $2, $3, $4, true)
               ON CONFLICT (product_id, vendor_id) 
               DO UPDATE SET 
                 price = EXCLUDED.price,
                 stock_quantity = EXCLUDED.stock_quantity,
                 is_available = true,
                 last_updated = CURRENT_TIMESTAMP`,
              [product.product_id, vendor.vendor_id, numericPrice, numericStock]
            );

            productsCreated++;
          } catch (err: any) {
            errors.push(`Error processing product: ${err.message}`);
          }
        }
        
        // Small delay between batches to prevent overwhelming database
        if (i + BATCH_SIZE < records.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (parseError: any) {
      console.error('❌ Parse error:', parseError);
      return res.status(400).json({ 
        error: 'Failed to parse CSV file. Please ensure it is a valid CSV format.',
        details: parseError.message 
      });
    }

    console.log(`✅ Upload complete! ${productsCreated} products imported`);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors encountered:`, errors.slice(0, 5));
    }

    // Return success response directly (no vendor_uploads table needed)
    res.json({
      message: `File uploaded successfully. ${productsCreated} products imported.`,
      productsCreated,
      errors: errors.length > 0 ? errors : undefined,
      status: productsCreated > 0 ? 'success' : 'failed',
    });
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/products', async (req: AuthRequest, res: Response) => {
  try {
    // Get vendor record for this user
    const vendorResult = await pool.query(
      'SELECT vendor_id FROM vendors WHERE user_id = $1',
      [parseInt(req.userId!)]
    );

    const vendor = vendorResult.rows[0];

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    // Get all products from this vendor's listings
    const productsResult = await pool.query(
      `SELECT p.*, vl.price, vl.stock_quantity, vl.is_available
       FROM vendor_listings vl
       JOIN products p ON vl.product_id = p.product_id
       WHERE vl.vendor_id = $1
       ORDER BY p.created_at DESC`,
      [vendor.vendor_id]
    );

    res.json(productsResult.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

