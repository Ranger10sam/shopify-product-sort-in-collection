import 'dotenv/config'; // Loads .env file
import fs from 'fs';
import readline from 'readline'; // Use readline for line-by-line processing
import path from 'path'; // Needed for resolving file path

// --- Configuration ---
// The handle of the collection you want to sort
const COLLECTION_HANDLE = 'regiment-pride-polo-collection'; // Change this to your target collection handle
// The JSONL file containing your sales data
const JSONL_FILE = 'sales-export.jsonl';
// Base name for log files (timestamp will be added)
const LOG_FILE_BASE = 'sort-products_log';
// Delay between API fetches in milliseconds
const API_FETCH_DELAY_MS = 500;
// Delay BETWEEN EACH MOVE mutation call (Increased for safety)
const API_MOVE_DELAY_MS = 650; // 1.5 seconds between each product move
// Shopify API Version
const API_VERSION = '2024-10';
// ---------------------

// --- Dynamic Log File Setup ---
let logStream;
let csvWriter;

function initializeCsvLogger() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // YYYY-MM-DDTHH-MM-SS-mmmZ
    const logFilename = `${LOG_FILE_BASE}_${timestamp}.csv`;
    logStream = fs.createWriteStream(logFilename, { flags: 'w' }); // Use 'w' to overwrite/create new

    // Basic CSV writer function (handles quoting)
    csvWriter = (rowArray) => {
        const line = rowArray.map(value => {
            const strValue = String(value ?? ''); // Handle null/undefined
            // Quote if it contains comma, double quote, or newline
            if (/[",\n\r]/.test(strValue)) {
                return `"${strValue.replace(/"/g, '""')}"`; // Escape double quotes
            }
            return strValue;
        }).join(',');
        logStream.write(line + '\n');
    };

    // Write CSV Header
    csvWriter(['Timestamp', 'Level', 'Action', 'Product Title', 'Product ID', 'Details']);
    console.log(`Logging to CSV file: ${logFilename}`);
}

// Initialize logger immediately
initializeCsvLogger();

// New CSV Logging function
function logCsv(level, action, productTitle = '', productId = '', details = '') {
  const timestamp = new Date().toISOString();
  csvWriter([timestamp, level.toUpperCase(), action, productTitle, productId, details]);
  // Also log basic info to console for real-time feedback
  const consoleMsg = `[${timestamp}] [${level.toUpperCase()}] ${action}` +
                     (productTitle ? ` | Title: ${productTitle}` : '') +
                     (productId ? ` | ID: ${productId}` : '') +
                     (details ? ` | Details: ${details.substring(0, 100)}...` : ''); // Truncate long details for console
  console.log(consoleMsg);
}
// ----------------------------

// Utility to pause execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Global variables for Shopify API ---
let shopifyEndpoint = '';
let shopifyHeaders = {};

/**
 * A helper function to make GraphQL calls to Shopify
 */
async function shopifyFetch(query, variables) {
  try {
    const response = await fetch(shopifyEndpoint, {
      method: 'POST',
      headers: shopifyHeaders,
      body: JSON.stringify({
        query: query,
        variables: variables,
      }),
    });

    // Improved error handling
    if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText;
        let errorBody = '';
        try { errorBody = await response.text(); } catch (e) { /* ignore */ }
        const details = `Status: ${status} ${statusText}. Body: ${errorBody}`;
        logCsv('error', 'API HTTP Error', '', '', details);
        if (status === 403) logCsv('error', 'Permission Check', '', '', 'Received 403 Forbidden. Verify API token permissions (needs write_products).');
        throw new Error(`API HTTP Error: ${status}`);
    }

    const data = await response.json();

    if (data.errors) {
      const errorDetails = JSON.stringify(data.errors);
      logCsv('warn', 'GraphQL Warning/Error', '', '', errorDetails);
      if (!data.data) throw new Error('GraphQL Error'); // Throw only if no data at all
    }

     if (variables && data.data) {
       const mutationName = Object.keys(data.data)[0];
       const userErrors = data.data[mutationName]?.userErrors;
       if (userErrors?.length > 0) {
         const errorDetails = JSON.stringify(userErrors);
         logCsv('warn', `UserErrors in ${mutationName}`, '', '', errorDetails);
       }
     }

    return data.data;
  } catch (e) {
    // Avoid double-logging basic fetch errors
    if (!e.message.includes('API HTTP Error') && !e.message.includes('GraphQL Error')) {
        logCsv('error', 'API Fetch Exception', '', '', e.message);
    }
    if (e.message.includes('429') || e.message.includes('Too Many Requests')) {
      logCsv('warn', 'Rate Limit Hit', '', '', 'Waiting 10 seconds...');
      await sleep(10000);
    }
    throw e; // Re-throw to be handled by main try/catch
  }
}


/**
 * Reads the sales data from a local JSONL file and aggregates sales per product title.
 * Also stores the Product ID.
 * @returns {Promise<Map<string, { totalSales: number, productId: string | null }>>} A Map of Product Title -> { Total Sales, Product ID (numeric string) }
 */
function loadAggregateSalesFromJsonl() {
  return new Promise((resolve, reject) => {
    logCsv('info', 'Reading JSONL Start', '', '', `File: ${JSONL_FILE}`);
    const productSalesData = new Map(); // Title -> { totalSales, productId }

    if (!fs.existsSync(JSONL_FILE)) {
        const fullPath = path.resolve(JSONL_FILE);
        const errorMsg = `JSONL file not found at path: ${fullPath}.`;
        logCsv('error', 'File Not Found', '', '', errorMsg);
        return reject(new Error(errorMsg));
    }

    const fileStream = fs.createReadStream(JSONL_FILE);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineNumber = 0;
    let productsWithIdCount = 0;
    let skippedLineCount = 0;

    rl.on('line', (line) => {
        lineNumber++;
        if (!line.trim()) {
            skippedLineCount++;
            return; // Skip empty lines
        }

        try {
            const row = JSON.parse(line);
            const productTitle = row['product_title']?.trim();
            const sales = parseInt(row['net_items_sold'], 10);
            const productIdNumeric = row['product_id']?.trim();

            let isValidRow = true;
            let skipReason = '';

            if (!productTitle) { isValidRow = false; skipReason = 'Missing product_title'; }
            if (isNaN(sales)) { isValidRow = false; skipReason = 'Invalid net_items_sold'; }
            if (!productIdNumeric) { isValidRow = false; skipReason = 'Missing product_id'; }
            if (productIdNumeric && !/^\d+$/.test(productIdNumeric)) { isValidRow = false; skipReason = 'Invalid product_id format'; }

            if (isValidRow) {
                const currentData = productSalesData.get(productTitle) || { totalSales: 0, productId: null };
                currentData.totalSales += sales;

                if (!currentData.productId) {
                    currentData.productId = productIdNumeric;
                } else if (currentData.productId !== productIdNumeric) {
                     logCsv('warn', 'Multiple Product IDs', productTitle, '', `Using first ID: ${currentData.productId}. Found: ${productIdNumeric}. Sales still aggregated.`);
                }
                productSalesData.set(productTitle, currentData);
            } else {
                 skippedLineCount++;
                 logCsv('warn', 'Skipping Invalid Line', '', '', `Line ${lineNumber}: ${skipReason}. Data: ${line.substring(0,100)}...`);
            }
        } catch (e) {
            skippedLineCount++;
            logCsv('error', 'JSON Parse Error', '', '', `Line ${lineNumber}: ${e.message}. Line: "${line.substring(0,100)}..."`);
        }
    });

    rl.on('close', () => {
        logCsv('info', 'Reading JSONL End', '', '', `Total lines read: ${lineNumber}, Skipped lines: ${skippedLineCount}`);
        if (productSalesData.size === 0 && lineNumber > skippedLineCount) {
            logCsv('warn', 'Aggregation Result', '', '', `No valid product data aggregated. Check file content/format.`);
        } else if (productSalesData.size > 0) {
             logCsv('info', 'Aggregation Result', '', '', `Aggregated sales for ${productSalesData.size} unique products.`);
             productsWithIdCount = Array.from(productSalesData.values()).filter(data => data.productId).length;
             logCsv('info', 'ID Check', '', '', `${productsWithIdCount} products have a valid Product ID stored.`);
             if (productsWithIdCount === 0) {
                 const errorMsg = "No valid Product IDs found/stored from JSONL.";
                 logCsv('error', 'ID Check Failed', '', '', errorMsg);
                 return reject(new Error(errorMsg));
             }
        } else if (lineNumber === 0 || lineNumber === skippedLineCount) {
             logCsv('warn', 'File Status', '', '', `JSONL file '${JSONL_FILE}' appears empty or contains only invalid lines.`);
             // Resolve with empty map if file is empty, reject if IDs missing otherwise
              if(productsWithIdCount === 0 && productSalesData.size === 0){
                 resolve(productSalesData); // Allow script to continue and report 0 products to move
              } else {
                 const errorMsg = "No valid Product IDs found/stored from JSONL.";
                 logCsv('error', 'ID Check Failed', '', '', errorMsg);
                 return reject(new Error(errorMsg));
              }

        }
        resolve(productSalesData);
    });

    rl.on('error', (err) => {
        logCsv('error', 'File Read Error', '', '', err.message);
        reject(err);
    });
  });
}


// --- GraphQL Queries and Mutations ---

// Get Collection ID
const GET_COLLECTION_ID_QUERY = `
  query getCollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
      title
    }
  }
`;

// Mutation to reorder products (move one product)
const MOVE_PRODUCT_IN_COLLECTION_MUTATION = `
  mutation collectionReorderProducts($collectionId: ID!, $moves: [MoveInput!]!) {
    collectionReorderProducts(id: $collectionId, moves: $moves) {
      job {
        id
        done
      }
      userErrors {
        field
        message
      }
    }
  }
`;


// --- Main Script Logic ---

async function main() {
  logCsv('info', 'Script Start', '', '', `Target Collection: ${COLLECTION_HANDLE}`);

  try {
    // 1. Load configuration from .env file
    const shopURL = process.env.SHOP_URL ? process.env.SHOP_URL.trim() : null;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN ? process.env.SHOPIFY_ACCESS_TOKEN.trim() : null;

    if (!shopURL || !accessToken) {
      logCsv('error', 'Config Error', '', '', 'Missing SHOP_URL or SHOPIFY_ACCESS_TOKEN in .env file.');
      return;
    }

    logCsv('info', 'Config Loaded', '', '', `SHOP_URL: ${shopURL}, Token: ${accessToken.substring(0, 10)}...`);

    // 2. Set up global API variables
    const shopDomain = shopURL.replace('https://', '').replace('/', '');
    shopifyEndpoint = `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;
    shopifyHeaders = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    };
    logCsv('info', 'API Client Configured');

    // 3. Aggregate sales from local JSONL file
    const productSalesData = await loadAggregateSalesFromJsonl();


    // 4. Get Collection ID
    logCsv('info', 'Fetch Collection Start', '', '', `Handle: ${COLLECTION_HANDLE}`);
    const collectionData = await shopifyFetch(GET_COLLECTION_ID_QUERY, { handle: COLLECTION_HANDLE });
    const collection = collectionData.collectionByHandle;

    if (!collection) {
      const errorMsg = `Collection with handle "${COLLECTION_HANDLE}" not found.`;
      logCsv('error', 'Fetch Collection Failed', '', '', errorMsg);
      return;
    }
    const collectionId = collection.id;
    logCsv('info', 'Fetch Collection Success', collection.title, collectionId);


    // 5. Prepare the list of products to move, sorted by sales
    logCsv('info', 'Prepare Product List Start');
    const sortedProductsToMove = Array.from(productSalesData.entries())
      .filter(([title, data]) => data.productId) // Should be guaranteed by load func now
      .map(([title, data]) => ({
          id: `gid://shopify/Product/${data.productId}`,
          title: title,
          totalSales: data.totalSales
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

     if (sortedProductsToMove.length === 0) {
        logCsv('warn', 'Prepare Product List', '', '', "List of products to move is empty (either CSV empty or no valid IDs). Nothing to do.");
        return; // Exit gracefully
     }

    logCsv('info', 'Prepare Product List Success', '', '', `Products to move: ${sortedProductsToMove.length}`);
    logCsv('info', 'Target Order Preview', '', '', `Top 5: ${sortedProductsToMove.slice(0, 5).map(p => `${p.title} (${p.totalSales})`).join(' | ')}`);


    // 6. Execute moves sequentially using "move-to-top" in reverse order
    logCsv('info', 'Execute Moves Start', '', '', `Total moves: ${sortedProductsToMove.length}`);

    const reversedProducts = [...sortedProductsToMove].reverse();

    for (const [index, product] of reversedProducts.entries()) {
        const moveAction = `Move ${index + 1}/${reversedProducts.length}`;
        logCsv('info', moveAction, product.title, product.id, 'Moving to top');

        if (!product.id.startsWith('gid://shopify/Product/')) {
            logCsv('error', moveAction, product.title, product.id, `Invalid GID format. Skipping.`);
            continue;
        }

        const movesPayload = [{ id: product.id, newPosition: "0" }];

        try {
            const moveMutationData = await shopifyFetch(MOVE_PRODUCT_IN_COLLECTION_MUTATION, {
              collectionId: collectionId,
              moves: movesPayload,
            });

             const moveErrors = moveMutationData?.collectionReorderProducts?.userErrors;
             if (moveErrors && moveErrors.length > 0) {
               const errorDetails = JSON.stringify(moveErrors);
               logCsv('error', moveAction, product.title, product.id, `Move Failed: ${errorDetails}`);
             } else {
               const job = moveMutationData?.collectionReorderProducts?.job;
               if (job?.id && !job?.done) logCsv('info', moveAction, product.title, product.id, `Submitted as job: ${job.id}`);
               else if (job?.done) logCsv('info', moveAction, product.title, product.id, `Completed immediately.`);
               else logCsv('warn', moveAction, product.title, product.id, `Submitted, but no job details/status.`);
             }
        } catch (e) {
            // Error already logged by shopifyFetch
             logCsv('error', moveAction, product.title, product.id, `Mutation Exception: ${e.message}`);
         }

        logCsv('debug', 'Delaying', '', '', `Waiting ${API_MOVE_DELAY_MS}ms...`);
        await sleep(API_MOVE_DELAY_MS);

    } // End of loop
    logCsv('info', 'Execute Moves End');


  } catch (e) {
     // Catch errors from loadAggregateSalesFromJsonl or other setup steps
     if (e.message.includes('JSONL file not found') || e.message.includes('No valid Product IDs found')) {
         logCsv('error', 'Script Halted', '', '', `JSONL processing error: ${e.message}`);
     } else {
        logCsv('error', 'Fatal Script Error', '', '', `${e.message}\n${e.stack}`);
     }
  } finally {
    logCsv('info', 'Script End');
    if (logStream && !logStream.destroyed) {
        logStream.end(() => {
            console.log("Log stream closed."); // Confirm stream closure
        });
    }
  }
}

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = `Unhandled Rejection at: ${promise}, reason: ${reason.stack || reason}`;
  logCsv('error', 'Unhandled Rejection', '', '', errorMsg);
  if (logStream && !logStream.destroyed) {
    logStream.end(() => {
        process.exit(1); // Exit after attempting to close stream
    });
  } else {
      process.exit(1);
  }

});

main();

