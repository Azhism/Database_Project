import pool from '../config/database';

interface VendorOption {
  vendor: string;
  totalCost: number;
  availableItems: number;
  totalItems: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  unavailableItems: string[];
}

interface MegaOption {
  totalCost: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    vendor: string;
    price: number;
    total: number;
  }>;
}

export class ShoppingListService {
  static async createList(userId: string, name: string) {
    const result = await pool.query(
      `INSERT INTO shopping_lists (user_id, list_name)
       VALUES ($1, $2)
       RETURNING list_id, user_id, list_name`,
      [parseInt(userId), name]
    );

    const list = result.rows[0];

    // Fetch items for this list (will be empty for new list)
    const itemsResult = await pool.query(
      `SELECT sli.*, p.product_id, p.product_name, p.brand, p.package_size
       FROM shopping_list_items sli
       LEFT JOIN products p ON sli.product_id = p.product_id
       WHERE sli.list_id = $1`,
      [list.list_id]
    );

    // Transform items to have nested products object
    const transformedItems = itemsResult.rows.map(row => ({
      item_id: row.item_id,
      list_id: row.list_id,
      product_id: row.product_id,
      quantity: row.quantity,
      products: row.product_id ? {
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        package_size: row.package_size
      } : null
    }));

    return {
      ...list,
      shopping_list_items: transformedItems,
    };
  }

  static async getUserLists(userId: string) {
    const listsResult = await pool.query(
      `SELECT * FROM shopping_lists
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [parseInt(userId)]
    );

    const lists = await Promise.all(
      listsResult.rows.map(async (list) => {
        const itemsResult = await pool.query(
          `SELECT sli.*, p.product_id, p.product_name, p.brand, p.package_size
           FROM shopping_list_items sli
           LEFT JOIN products p ON sli.product_id = p.product_id
           WHERE sli.list_id = $1`,
          [list.list_id]
        );

        // Transform items to have nested products object
        const transformedItems = itemsResult.rows.map(row => ({
          item_id: row.item_id,
          list_id: row.list_id,
          product_id: row.product_id,
          quantity: row.quantity,
          products: row.product_id ? {
            product_id: row.product_id,
            product_name: row.product_name,
            brand: row.brand,
            package_size: row.package_size
          } : null
        }));

        return {
          ...list,
          shopping_list_items: transformedItems,
        };
      })
    );

    return lists;
  }

  static async getListById(listId: string, userId: string) {
    // Validate listId
    if (!listId || listId === 'undefined' || listId === 'null') {
      throw new Error('Invalid list ID');
    }
    
    // Convert listId to integer if it's a valid number
    const listIdNum = parseInt(listId, 10);
    if (isNaN(listIdNum)) {
      throw new Error('Invalid list ID: must be a number');
    }
    
    const listResult = await pool.query(
      `SELECT * FROM shopping_lists
       WHERE list_id = $1 AND user_id = $2`,
      [listIdNum, parseInt(userId)]
    );

    if (listResult.rows.length === 0) {
      throw new Error('Shopping list not found');
    }

    const list = listResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT sli.*, p.product_id, p.product_name, p.brand, p.package_size
       FROM shopping_list_items sli
       LEFT JOIN products p ON sli.product_id = p.product_id
       WHERE sli.list_id = $1`,
      [listIdNum]
    );

    // Transform items to have nested products object
    const transformedItems = itemsResult.rows.map(row => ({
      item_id: row.item_id,
      list_id: row.list_id,
      product_id: row.product_id,
      quantity: row.quantity,
      products: row.product_id ? {
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        package_size: row.package_size
      } : null
    }));

    return {
      ...list,
      shopping_list_items: transformedItems,
    };
  }

  static async updateList(listId: string, userId: string, name: string) {
    const list = await this.getListById(listId, userId);
    
    // Convert listId to integer if it's a valid number
    const listIdNum = parseInt(listId, 10);

    const result = await pool.query(
      `UPDATE shopping_lists
       SET list_name = $1
       WHERE list_id = $2
       RETURNING *`,
      [name, listIdNum]
    );

    const updatedList = result.rows[0];

    const itemsResult = await pool.query(
      `SELECT sli.*, p.product_id, p.product_name, p.brand, p.package_size
       FROM shopping_list_items sli
       LEFT JOIN products p ON sli.product_id = p.product_id
       WHERE sli.list_id = $1`,
      [listIdNum]
    );

    // Transform items to have nested products object
    const transformedItems = itemsResult.rows.map(row => ({
      item_id: row.item_id,
      list_id: row.list_id,
      product_id: row.product_id,
      quantity: row.quantity,
      products: row.product_id ? {
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        package_size: row.package_size
      } : null
    }));

    return {
      ...updatedList,
      shopping_list_items: transformedItems,
    };
  }

  static async deleteList(listId: string, userId: string) {
    const list = await this.getListById(listId, userId);
    
    // Convert listId to integer if it's a valid number
    const listIdNum = parseInt(listId, 10);

    // Remove all items first to avoid FK constraints
    await pool.query(
      'DELETE FROM shopping_list_items WHERE list_id = $1',
      [listIdNum]
    );

    const result = await pool.query(
      'DELETE FROM shopping_lists WHERE list_id = $1 RETURNING *',
      [listIdNum]
    );

    return result.rows[0];
  }

  static async clearAllItems(listId: string, userId: string) {
    const list = await this.getListById(listId, userId);
    
    // Convert listId to integer if it's a valid number
    const listIdNum = parseInt(listId, 10);

    // Remove all items from the list
    const result = await pool.query(
      'DELETE FROM shopping_list_items WHERE list_id = $1',
      [listIdNum]
    );
    
    return { count: result.rowCount };
  }

  static async addItemToList(
    listId: string,
    userId: string,
    productId: string,
    quantity: number = 1
  ) {
    const list = await this.getListById(listId, userId);
    
    // Convert listId and productId to integers if they're valid numbers
    const listIdNum = parseInt(listId, 10);
    const productIdNum = parseInt(productId, 10);

    // Check if item already exists
    const existingItemResult = await pool.query(
      `SELECT * FROM shopping_list_items
       WHERE list_id = $1 AND product_id = $2`,
      [listIdNum, productIdNum]
    );

    if (existingItemResult.rows.length > 0) {
      const existingItem = existingItemResult.rows[0];
      const itemPrimaryKey = existingItem.item_id || existingItem.id;
      
      const updateResult = await pool.query(
        `UPDATE shopping_list_items
         SET quantity = $1
         WHERE item_id = $2
         RETURNING *`,
        [(existingItem.quantity || 0) + quantity, itemPrimaryKey]
      );

      const updatedItem = updateResult.rows[0];

      // Fetch product details
      const productResult = await pool.query(
        'SELECT * FROM products WHERE product_id = $1',
        [productIdNum]
      );

      return {
        ...updatedItem,
        products: productResult.rows[0],
      };
    }

    const insertResult = await pool.query(
      `INSERT INTO shopping_list_items (list_id, product_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [listIdNum, productIdNum, quantity]
    );

    const newItem = insertResult.rows[0];

    // Fetch product details
    const productResult = await pool.query(
      'SELECT * FROM products WHERE product_id = $1',
      [productIdNum]
    );

    return {
      ...newItem,
      products: productResult.rows[0],
    };
  }

  static async updateListItem(
    listId: string,
    userId: string,
    itemId: string,
    quantity: number
  ) {
    // Validate itemId
    if (!itemId || itemId === 'undefined' || itemId === 'null') {
      throw new Error('Invalid item ID');
    }
    
    const list = await this.getListById(listId, userId);
    
    // Convert itemId to integer if it's a valid number
    const itemIdNum = parseInt(itemId, 10);
    if (isNaN(itemIdNum)) {
      throw new Error('Invalid item ID: must be a number');
    }

    if (quantity <= 0) {
      const result = await pool.query(
        'DELETE FROM shopping_list_items WHERE item_id = $1 RETURNING *',
        [itemIdNum]
      );
      return result.rows[0];
    }

    const updateResult = await pool.query(
      `UPDATE shopping_list_items
       SET quantity = $1
       WHERE item_id = $2
       RETURNING *`,
      [quantity, itemIdNum]
    );

    const updatedItem = updateResult.rows[0];

    // Fetch product details
    const productResult = await pool.query(
      'SELECT * FROM products WHERE product_id = $1',
      [updatedItem.product_id]
    );

    return {
      ...updatedItem,
      products: productResult.rows[0],
    };
  }

  static async removeItemFromList(
    listId: string,
    userId: string,
    itemId: string
  ) {
    // Validate itemId
    if (!itemId || itemId === 'undefined' || itemId === 'null') {
      throw new Error('Invalid item ID');
    }
    
    const list = await this.getListById(listId, userId);
    
    // Convert itemId to integer if it's a valid number
    const itemIdNum = parseInt(itemId, 10);
    if (isNaN(itemIdNum)) {
      throw new Error('Invalid item ID: must be a number');
    }

    const result = await pool.query(
      'DELETE FROM shopping_list_items WHERE item_id = $1 RETURNING *',
      [itemIdNum]
    );

    return result.rows[0];
  }

  static async calculateShoppingListCosts(listId: string, userId: string): Promise<{
    vendorOptions: VendorOption[];
    megaOption: MegaOption;
  }> {
    // Validate list ownership
    const list = await this.getListById(listId, userId);
    
    if (!list.shopping_list_items || list.shopping_list_items.length === 0) {
      return {
        vendorOptions: [],
        megaOption: { totalCost: 0, items: [] },
      };
    }

    const listIdNum = parseInt(listId, 10);
    const totalItemsCount = list.shopping_list_items.length;

    try {
      // Optimized SQL query: Calculate total cost per vendor
      const vendorQuery = `
        SELECT
          v.vendor_id,
          v.vendor_name,
          SUM(vl.price * sli.quantity) AS total_amount,
          COUNT(DISTINCT sli.item_id) AS available_items,
          json_agg(
            json_build_object(
              'productId', p.product_id::text,
              'productName', p.product_name,
              'quantity', sli.quantity,
              'price', vl.price,
              'total', vl.price * sli.quantity
            )
          ) AS items
        FROM shopping_list_items sli
        JOIN products p ON sli.product_id = p.product_id
        JOIN vendor_listings vl ON p.product_id = vl.product_id
        JOIN vendors v ON vl.vendor_id = v.vendor_id
        WHERE sli.list_id = $1
          AND vl.is_available = true
        GROUP BY v.vendor_id, v.vendor_name
        ORDER BY total_amount ASC
      `;

      const vendorResult = await pool.query(vendorQuery, [listIdNum]);

      // Query for unavailable items per vendor
      const unavailableQuery = `
        SELECT
          v.vendor_id,
          array_agg(DISTINCT p.product_name) AS unavailable_items
        FROM vendors v
        CROSS JOIN shopping_list_items sli
        JOIN products p ON sli.product_id = p.product_id
        LEFT JOIN vendor_listings vl ON p.product_id = vl.product_id 
          AND vl.vendor_id = v.vendor_id 
          AND vl.is_available = true
        WHERE sli.list_id = $1
          AND vl.listing_id IS NULL
        GROUP BY v.vendor_id
      `;

      const unavailableResult = await pool.query(unavailableQuery, [listIdNum]);
      
      // Map unavailable items by vendor
      const unavailableMap = new Map<string, string[]>();
      unavailableResult.rows.forEach(row => {
        unavailableMap.set(row.vendor_id.toString(), row.unavailable_items || []);
      });

      // Build vendor options from query results
      const vendorOptions: VendorOption[] = vendorResult.rows.map(row => ({
        vendor: row.vendor_name,
        totalCost: parseFloat(row.total_amount) || 0,
        availableItems: parseInt(row.available_items) || 0,
        totalItems: totalItemsCount,
        items: row.items.map((item: any) => ({
          productId: item.productId || '',
          productName: item.productName || 'Unknown Product',
          quantity: item.quantity || 0,
          price: parseFloat(item.price) || 0,
          total: parseFloat(item.total) || 0,
        })),
        unavailableItems: unavailableMap.get(row.vendor_id.toString()) || [],
      }));

      // Calculate mega option: find cheapest vendor for each product
      const megaQuery = `
        WITH cheapest_listings AS (
          SELECT DISTINCT ON (sli.product_id)
            sli.product_id,
            p.product_name,
            sli.quantity,
            v.vendor_name,
            vl.price,
            vl.price * sli.quantity AS total
          FROM shopping_list_items sli
          JOIN products p ON sli.product_id = p.product_id
          JOIN vendor_listings vl ON p.product_id = vl.product_id
          JOIN vendors v ON vl.vendor_id = v.vendor_id
          WHERE sli.list_id = $1
            AND vl.is_available = true
          ORDER BY sli.product_id, vl.price ASC
        )
        SELECT
          SUM(total) AS mega_total,
          json_agg(
            json_build_object(
              'productId', product_id::text,
              'productName', product_name,
              'quantity', quantity,
              'vendor', vendor_name,
              'price', price,
              'total', total
            )
          ) AS items
        FROM cheapest_listings
      `;

      const megaResult = await pool.query(megaQuery, [listIdNum]);
      
      const megaRow = megaResult.rows[0];
      const megaOption: MegaOption = {
        totalCost: parseFloat(megaRow?.mega_total) || 0,
        items: (megaRow?.items || []).map((item: any) => ({
          productId: item.productId || '',
          productName: item.productName || 'Unknown Product',
          quantity: item.quantity || 0,
          vendor: item.vendor || 'Unknown Vendor',
          price: parseFloat(item.price) || 0,
          total: parseFloat(item.total) || 0,
        })),
      };

      console.log(`✅ Shopping list ${listId} cost calculation completed`);
      console.log(`   Vendors analyzed: ${vendorOptions.length}`);
      if (vendorOptions.length > 0) {
        console.log(`   Cheapest vendor: ${vendorOptions[0].vendor} (Rs. ${vendorOptions[0].totalCost.toFixed(2)})`);
      }
      console.log(`   Mega option cost: Rs. ${megaOption.totalCost.toFixed(2)}`);

      return {
        vendorOptions,
        megaOption,
      };

    } catch (error: any) {
      console.error('❌ Shopping list cost calculation error:', error.message);
      throw new Error('Failed to calculate shopping list costs: ' + error.message);
    }
  }
}

