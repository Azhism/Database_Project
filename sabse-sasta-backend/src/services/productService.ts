import pool from '../config/database';
import { ProductSearchQuery } from '../types';

export class ProductService {
  
  /**
   * Search products with optimized SQL query using JOINs
   * Filters data in the database instead of JavaScript
   */
  static async searchProducts(query: ProductSearchQuery) {
    const limit = query.limit ?? 500;
    const offset = query.offset ?? 0;

    try {
      // Build WHERE conditions dynamically
      const conditions: string[] = ['vl.is_available = true'];
      const params: any[] = [];
      let paramCount = 1;

      if (query.name) {
        conditions.push(`p.product_name ILIKE $${paramCount}`);
        params.push(`%${query.name}%`);
        paramCount++;
      }

      if (query.category) {
        conditions.push(`c.category_name ILIKE $${paramCount}`);
        params.push(`%${query.category}%`);
        paramCount++;
      }

      if (query.brand) {
        conditions.push(`p.brand ILIKE $${paramCount}`);
        params.push(`%${query.brand}%`);
        paramCount++;
      }

      if (query.minPrice !== undefined) {
        conditions.push(`vl.price >= $${paramCount}`);
        params.push(query.minPrice);
        paramCount++;
      }

      if (query.maxPrice !== undefined) {
        conditions.push(`vl.price <= $${paramCount}`);
        params.push(query.maxPrice);
        paramCount++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Optimized SQL query with JOINs - filters in database
      const sqlQuery = `
        SELECT 
          p.product_id,
          p.product_name,
          c.category_name,
          p.brand,
          p.package_size,
          v.vendor_id,
          v.vendor_name,
          vl.price,
          vl.stock_quantity,
          vl.is_available,
          vl.listing_id
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        JOIN vendor_listings vl ON p.product_id = vl.product_id
        JOIN vendors v ON vl.vendor_id = v.vendor_id
        ${whereClause}
        ORDER BY vl.price ASC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      params.push(limit, offset);

      console.log('Search query received:', { 
        name: query.name, 
        category: query.category, 
        brand: query.brand, 
        minPrice: query.minPrice, 
        maxPrice: query.maxPrice,
        limit, 
        offset 
      });

      const result = await pool.query(sqlQuery, params);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        JOIN vendor_listings vl ON p.product_id = vl.product_id
        JOIN vendors v ON vl.vendor_id = v.vendor_id
        ${whereClause}
      `;

      const countResult = await pool.query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0]?.total || '0');

      const products = result.rows.map(row => ({
        id: row.product_id?.toString(),
        product_id: row.product_id?.toString(),
        name: row.product_name,
        product_name: row.product_name,
        category: row.category_name,
        category_name: row.category_name,
        brand: row.brand,
        package_size: row.package_size,
        price: parseFloat(row.price) || 0,
        vendor: row.vendor_name,
        vendor_name: row.vendor_name,
        vendor_id: row.vendor_id,
        stock_quantity: row.stock_quantity,
        in_stock: row.is_available,
        listing_id: row.listing_id
      }));

      console.log(`Search returned ${products.length} products for query:`, query.name || 'all');

      return {
        products,
        total,
        limit,
        offset,
      };
    } catch (error: any) {
      console.error('Search error:', error.message);
      throw error;
    }
  }

  /**
   * Get featured products with optimized query
   */
  static async getFeaturedProducts(limit: number = 10) {
    try {
      const sqlQuery = `
        SELECT 
          p.product_id,
          p.product_name,
          c.category_name,
          p.brand,
          p.package_size,
          MIN(vl.price) as price,
          MAX(v.vendor_name) as vendor_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        JOIN vendor_listings vl ON p.product_id = vl.product_id
        JOIN vendors v ON vl.vendor_id = v.vendor_id
        WHERE vl.is_available = true
        GROUP BY p.product_id, p.product_name, c.category_name, p.brand, p.package_size
        ORDER BY RANDOM()
        LIMIT $1
      `;

      const result = await pool.query(sqlQuery, [limit]);

      return result.rows.map(row => ({
        id: row.product_id?.toString(),
        product_id: row.product_id?.toString(),
        name: row.product_name,
        product_name: row.product_name,
        category: row.category_name,
        brand: row.brand,
        package_size: row.package_size,
        price: parseFloat(row.price) || 0,
        vendor_name: row.vendor_name
      }));
    } catch (error: any) {
      console.error('Featured products error:', error.message);
      return [];
    }
  }

  /**
   * Get all products with pagination
   */
  static async getAllProducts(limit: number = 1000, offset: number = 0) {
    try {
      const sqlQuery = `
        SELECT DISTINCT
          p.product_id,
          p.product_name,
          c.category_name,
          p.brand,
          p.package_size
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        ORDER BY p.product_id
        LIMIT $1 OFFSET $2
      `;

      const result = await pool.query(sqlQuery, [limit, offset]);

      return result.rows.map(row => ({
        id: row.product_id?.toString(),
        product_id: row.product_id?.toString(),
        name: row.product_name,
        product_name: row.product_name,
        category: row.category_name,
        brand: row.brand,
        package_size: row.package_size
      }));
    } catch (error: any) {
      console.error('Get all products error:', error.message);
      return [];
    }
  }

  /**
   * Get single product by ID
   */
  static async getProductById(id: string) {
    if (!id) return null;

    try {
      const sqlQuery = `
        SELECT 
          p.product_id,
          p.product_name,
          c.category_name,
          p.brand,
          p.package_size
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        WHERE p.product_id = $1
      `;

      const result = await pool.query(sqlQuery, [id]);

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.product_id?.toString(),
        product_id: row.product_id?.toString(),
        name: row.product_name,
        product_name: row.product_name,
        category: row.category_name,
        brand: row.brand,
        package_size: row.package_size
      };
    } catch (error: any) {
      console.error('Get product by ID error:', error.message);
      return null;
    }
  }

  /**
   * Get products by vendor
   */
  static async getProductsByVendor(vendorId: string) {
    if (!vendorId) return [];

    try {
      const sqlQuery = `
        SELECT 
          p.product_id,
          p.product_name,
          c.category_name,
          p.brand,
          p.package_size,
          vl.price,
          vl.stock_quantity,
          vl.is_available
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        JOIN vendor_listings vl ON p.product_id = vl.product_id
        WHERE vl.vendor_id = $1
        ORDER BY p.product_name
      `;

      const result = await pool.query(sqlQuery, [vendorId]);

      return result.rows.map(row => ({
        id: row.product_id?.toString(),
        product_id: row.product_id?.toString(),
        name: row.product_name,
        product_name: row.product_name,
        category: row.category_name,
        brand: row.brand,
        package_size: row.package_size,
        price: parseFloat(row.price) || 0,
        stock_quantity: row.stock_quantity,
        in_stock: row.is_available
      }));
    } catch (error: any) {
      console.error('Get products by vendor error:', error.message);
      return [];
    }
  }

  /**
   * Get price comparison for a product across vendors
   */
  static async getProductPriceComparison(productName: string, brand?: string) {
    if (!productName) return [];

    try {
      const conditions = ['vl.is_available = true', 'p.product_name ILIKE $1'];
      const params: any[] = [`%${productName}%`];

      if (brand) {
        conditions.push('p.brand ILIKE $2');
        params.push(`%${brand}%`);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const sqlQuery = `
        SELECT 
          v.vendor_name,
          v.vendor_id,
          COUNT(*) as product_count,
          SUM(vl.price) as total_cost,
          json_agg(json_build_object(
            'product_id', p.product_id,
            'product_name', p.product_name,
            'brand', p.brand,
            'price', vl.price
          )) as items
        FROM products p
        JOIN vendor_listings vl ON p.product_id = vl.product_id
        JOIN vendors v ON vl.vendor_id = v.vendor_id
        ${whereClause}
        GROUP BY v.vendor_id, v.vendor_name
        ORDER BY total_cost ASC
      `;

      const result = await pool.query(sqlQuery, params);

      return result.rows.map(row => ({
        vendor: row.vendor_name,
        totalCost: parseFloat(row.total_cost) || 0,
        items: row.items || []
      }));
    } catch (error: any) {
      console.error('Price comparison error:', error.message);
      return [];
    }
  }

  /**
   * Get all vendors selling a specific product
   */
  static async getVendorsForProduct(productId: string) {
    if (!productId) {
      throw new Error('Product ID is required');
    }

    try {
      // Get product details
      const productQuery = `
        SELECT 
          p.product_id,
          p.product_name,
          c.category_name,
          p.brand,
          p.package_size
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        WHERE p.product_id = $1
      `;

      const productResult = await pool.query(productQuery, [productId]);

      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }

      const product = {
        id: productResult.rows[0].product_id?.toString(),
        product_id: productResult.rows[0].product_id?.toString(),
        name: productResult.rows[0].product_name,
        category: productResult.rows[0].category_name,
        brand: productResult.rows[0].brand,
        package_size: productResult.rows[0].package_size
      };

      // Get vendors selling this product
      const vendorsQuery = `
        SELECT 
          v.vendor_id,
          v.vendor_name,
          vl.price,
          vl.stock_quantity,
          vl.is_available
        FROM vendor_listings vl
        JOIN vendors v ON vl.vendor_id = v.vendor_id
        WHERE vl.product_id = $1
        ORDER BY vl.price ASC
      `;

      const vendorsResult = await pool.query(vendorsQuery, [productId]);

      const vendors = vendorsResult.rows.map(row => ({
        vendorId: row.vendor_id?.toString(),
        vendorName: row.vendor_name,
        price: parseFloat(row.price) || 0,
        stockQuantity: row.stock_quantity,
        isAvailable: row.is_available
      }));

      return {
        product,
        vendors
      };
    } catch (error: any) {
      console.error('Get vendors for product error:', error.message);
      throw error;
    }
  }
}
