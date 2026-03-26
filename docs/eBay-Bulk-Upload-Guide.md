eBay’s bulk upload system (found in the **Seller Hub \> Reports \> Uploads** section) uses a specific CSV format called "File Exchange." Setting this up correctly allows you to list 100+ cards in minutes rather than hours.

Here is the professional CSV structure optimized for sports cards.

## ---

**1\. The Core CSV Header**

Copy this row into the first line of your spreadsheet. These are the mandatory fields eBay requires to recognize a listing.

Code snippet

Action(SiteID=US|Country=US|Currency=USD),Category,Title,Description,ConditionID,PicURL,Format,StartPrice,Quantity,Duration,Location,ShippingService-1:Option,ShippingService-1:Cost,DispatchTimeMax,ReturnsAcceptedOption,C:Player,C:Team,C:Season,C:Set,C:Parallel/Variety,C:Graded

## ---

**2\. Column Mapping & Descriptions**

To ensure your upload doesn't error out, fill the columns using these specific values:

| Column Header | Value / Example | Note |
| :---- | :---- | :---- |
| **Action** | Add | Tells eBay to create a new listing. |
| **Category** | 212 | The standard ID for **Trading Cards \- Sport**. |
| **Title** | 2024 Prizm Silver CJ Stroud RC \#1 | Max 80 characters. Include Year, Set, Player. |
| **Description** | \[Paste generated description here\] | Use the Python/Excel output we created earlier. |
| **ConditionID** | 3000 | Standard for "Used" (Sports cards are almost always 3000). |
| **PicURL** | https://your-host.com/img.jpg | eBay requires a direct URL to your photos. |
| **Format** | FixedPrice or Auction | FixedPrice is usually best for bulk cards. |
| **StartPrice** | 19.99 | Your asking price. |
| **Quantity** | 1 | Usually 1 for specific sports cards. |
| **Location** | Your City, State | Your shipping origin. |
| **C:Graded** | No | Item Specific: Change to Yes for PSA/BGS. |

## ---

**3\. Handling Item Specifics (C:)**

The columns starting with C: are **Item Specifics**. These are what buyers use to filter search results. Using them correctly is the difference between a card sitting for months or selling in days.

* **C:Player:** The athlete's name.  
* **C:Team:** The professional team.  
* **C:Season:** The year (e.g., 2023-24).  
* **C:Set:** The product line (e.g., Optic, Bowman Chrome).  
* **C:Parallel/Variety:** If it’s a specific color or finish (e.g., Blue Shimmer, Holo).

## ---

**4\. Connecting Your Photos (The "PicURL" Hurdle)**

Since you are using an iPhone, your photos are likely in iCloud or Google Photos. eBay's CSV tool **cannot** "browse" your phone for files; it needs a web link.

**Options for Bulk Image Hosting:**

1. **ImgBB or Cloudinary:** You can bulk-upload your card photos here and get a list of direct URLs to paste into your CSV.  
2. **Self-Hosting:** If you have a personal site or server, upload them to a folder (e.g., /images/card001\_front.jpg) and use a formula to generate the URLs in your sheet.  
3. **Dropbox/Google Drive:** This is tricky because the links aren't "direct" by default. You often have to modify the sharing link to make it "raw" for eBay to see it.

## ---

**5\. Pro-Tip: The "Master Template" Strategy**

Create a "Master" tab in your spreadsheet where you enter your card scores and details. Use a separate "Export" tab that pulls that data into this CSV format using simple cell references (=Master\!A2).

This keeps your raw data (with the grading formulas) safe while you generate a clean CSV for eBay.

**Would you like me to write a Python script that takes a folder of images on your computer and automatically generates the PicURL list for your CSV?**