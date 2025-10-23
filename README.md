Shopify Collection Product Mover Script (JSONL Version)

This Node.js script automates the sorting of products within a specified Shopify collection based on sales performance data provided in a JSON Lines (.jsonl) file.

It reads the sales report, determines the ranking based on net_items_sold, and then moves products individually to the top of the target collection using Shopify's API, resulting in the highest-selling product being positioned first.

This script works on ALL Shopify plans.

:warning: Important

Run on a Test Store First: This script performs write operations (changes product order). Test it thoroughly on a duplicate or development store before running it on your live production store.

Collection Sort Order: Ensure the target collection's sort order is set to "Manually" in the Shopify admin before running the script. The script will fail if the collection is set to automatic sorting.

JSONL Format: Each line in your .jsonl file must be a valid JSON object containing at least these keys: "product_title" (string), "product_id" (string containing the numeric product ID), and "net_items_sold" (string or number representing the sales count).

Workflow Overview

Run ShopifyQL Query: Execute your sales query in Shopify.

Export Data: Export the query results in JSON Lines (.jsonl) format.

Prepare Files: Rename the exported file and place it in the script's directory. Configure the script.

Run Script: Execute the Node.js script to reorder the collection.

Verify: Check the collection order in your Shopify admin.

Step-by-Step Instructions

Step 1: Install Node.js

If you don't already have it, download and install Node.js (use the "LTS" version): https://nodejs.org/

Step 2: Create a Shopify Custom App & Get Credentials

In your Shopify Admin, go to Apps > Apps and sales channels > Develop apps.

Click Create an app.

Give it a name (e.g., "Collection Sorter Script").

Click Configure Admin API scopes.

Find and check read_products and write_products.

Click Save.

Go to the API credentials tab.

Click Install app and confirm.

Reveal and copy the Admin API access token (shpat_...).

Step 3: Prepare Your Sales Data File

Run Your Query in Shopify: Execute a query similar to this (adjust filters/dates as needed):

FROM sales
SHOW net_items_sold
WHERE product_collections CONTAINS 'YOUR_COLLECTION_ID' OR product_tags CONTAINS 'YOUR_PRODUCT_TAG'
GROUP BY product_title, product_id
SINCE -30d UNTIL today
ORDER BY net_items_sold DESC


Important: Ensure your query includes product_id in the GROUP BY clause. Replace placeholders like YOUR_COLLECTION_ID or YOUR_PRODUCT_TAG.

Export as JSONL: Export the results of your query in JSON Lines (.jsonl) format.

Rename & Save: Rename the downloaded file exactly to sales-export.jsonl and save it in the same directory where you will put the script.

Step 4: Set Up the Project Folder

Create a new folder on your computer (e.g., D:\Shopify Apps\shopify-collection-sorter).

Place the following files inside this folder:

package.json (Provided by the assistant)

sort-products.js (Provided by the assistant)

sales-export.jsonl (The file you prepared in Step 3)

This README.md file (Optional)

Create .env file: Create a new file named .env in the folder and add your credentials:

# Your shop's full .myshopify.com URL
SHOP_URL="[https://your-store-name.myshopify.com](https://your-store-name.myshopify.com)"

# The Admin API access token (shpat_...) you copied in Step 2
SHOPIFY_ACCESS_TOKEN="shpat_YOUR_TOKEN_HERE"


Step 5: Install Dependencies

Open your computer's terminal (like PowerShell or Command Prompt).

Navigate (cd) to the project folder you created.

Run the command:

npm install


Step 6: Configure and Run the Script

Edit sort-products.js:

Change the COLLECTION_HANDLE variable (around line 7) to the exact handle of the collection you want to sort (e.g., 'regiment-pride-polo-collection').

Verify the JSONL_FILE variable (around line 10) matches your data file name ('sales-export.jsonl').

(Optional) Adjust API_MOVE_DELAY_MS if needed (time in milliseconds between moving each product).

Run from Terminal:

node sort-products.js


Step 7: Monitor and Verify

Monitor Terminal: The script will output its progress to the console, showing each product being moved.

Check Log File: A detailed CSV log file (e.g., sort-products_log_YYYY-MM-DD-HH-MM-SS-mmmZ.csv) will be created in the same folder. Review this file for any errors or warnings.

Verify in Shopify: Go to your Shopify Admin > Products > Collections. Open the target collection. Ensure the sort order is set to "Manually". Refresh the page. The products listed in your sales-export.jsonl should now be ordered at the top according to their net_items_sold, with the highest seller first.