Shopify Collection Product Sorter Script

This Node.js script sorts the products within a specific Shopify collection based on their total unit sales, using data provided in a CSV file.

This script works on ALL Shopify plans.

It works by:

Reading your CSV file to get total sales for each product title.

Fetching all products currently in the specified collection.

Matching the products to the sales data using the product title.

Sending a command to Shopify to reorder the products in the collection based on sales (highest first).

:warning: Important: Run on a Test Store First

This script performs write operations (changes collection data) on your store. It is strongly recommended to test this script on a duplicate or development store before running it on your live production store.

How to Use

Step 1: Install Node.js

If you don't already have it, download and install Node.js: https://nodejs.org/ (use the "LTS" version).

Step 2: Create a Shopify Custom App & Get Credentials

In your Shopify Admin, go to Apps > Apps and sales channels > Develop apps.

Click Create an app.

Give it a name, like "Collection Sorter Script".

Click Configure Admin API scopes.

Find and check the following permissions:

read_products (To read collection and product data)

write_products (Required for the collectionReorderProducts mutation)

Click Save.

Go to the API credentials tab.

Click Install app and confirm.

You will see an Admin API access token. This is your SHOPIFY_ACCESS_TOKEN. Copy this token. It starts with shpat_.

Step 3: Set Up the Project

Create a new folder on your computer (e.g., D:\Shopify Apps\shopify-collection-sort).

Place the package.json, sort-products.js, and this README.md file into the new folder.

Prepare your CSV file: Ensure your CSV file (e.g., Variants sold as per product tags - 2024-10-23 - 2025-10-23.csv) has at least two columns: Product title and Net items sold. Place this CSV file in the same folder.

Create a new file named .env in the same folder and add your credentials:

# Your shop's full .myshopify.com URL
SHOP_URL="[https://your-store-name.myshopify.com](https://your-store-name.myshopify.com)"

# The Admin API access token (shpat_...) you copied in Step 2
SHOPIFY_ACCESS_TOKEN="shpat_YOUR_TOKEN_HERE"


Step 4: Install Dependencies

Open your computer's terminal (like PowerShell).

Navigate to the folder you created:

cd D:\Shopify Apps\shopify-collection-sort


Run this command to install the necessary libraries:

npm install


Step 5: Run the Script

Open sort-products.js and change the COLLECTION_HANDLE variable at the top to the handle of the collection you want to sort (e.g., 'assam_rifles').

Verify the CSV_FILE variable matches the name of your CSV file.

From your terminal, run the script:

node sort-products.js


Step 6: Monitor and Verify

Monitor the Terminal: The script will print its progress: reading the CSV, fetching products, and submitting the reorder job.

Check the Log: A file named sort-products.log will be created with a detailed history.

Verify in Shopify: Go to your Shopify Admin > Products > Collections and view the products in the specified collection. It might take a minute or two for the sorting job to complete and the new order to appear. You may need to refresh the page. The products should now be ordered by total sales according to your CSV data.