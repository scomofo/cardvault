This grading logic mimics the "weakest link" approach used by professional grading companies. In most cases, a card's final grade cannot be significantly higher than its lowest sub-grade.

### **1\. The "Floor" vs. "Weighted" Logic**

There are two ways to calculate this. I recommend using the **Floor \+ Weighted Average** approach for the most realistic result.

* **The Floor (Conservative):** Your grade is simply the lowest of your four scores. If you have 10s everywhere but a 6 on the surface, it’s a 6\.  
* **The Weighted Average (Balanced):** This assigns more "value" to high-impact areas like Corners and Surface.

### ---

**2\. The Spreadsheet Setup**

Assuming your data starts in **Row 2**:

* **Column B:** Centering (1–10)  
* **Column C:** Corners (1–10)  
* **Column D:** Edges (1–10)  
* **Column E:** Surface (1–10)

#### **The Conservative "Floor" Formula**

Copy this into **Column F**:

Excel

\=MIN(B2:E2)

#### **The Weighted Realistic Formula**

Copy this into **Column G**. This weights Corners and Surface at 30% each, and Centering and Edges at 20% each.

Excel

\=(B2\*0.2) \+ (C2\*0.3) \+ (D2\*0.2) \+ (E2\*0.3)

### ---

**3\. Final Estimated Grade (The Hybrid)**

To get the most accurate "Hobby Grade," use this formula. It takes the weighted average but ensures the final grade doesn't exceed the lowest sub-grade by more than **1.0 point**.

Excel

\=MIN(AVERAGE(B2:E2), MIN(B2:E2)+1)

### ---

**4\. Grade Translation Scale**

Use this table to convert your numerical result into a market-standard term:

| Score | Market Term | Condition Description |
| :---- | :---- | :---- |
| **9.5 – 10** | **Gem Mint** | Virtually perfect to the naked eye. |
| **9.0 – 9.4** | **Mint** | One very minor flaw (usually centering or a single white speck). |
| **8.0 – 8.9** | **NM-MT** | Near Mint-Mint. Sharp, but has visible minor wear. |
| **7.0 – 7.9** | **NM** | Near Mint. Visible whitening or slight surface scuffing. |
| **6.0 & Below** | **EX / VG** | Significant flaws; strictly for "Raw" sales or personal collections. |

### ---

**Efficiency Tip: Conditional Formatting**

Highlight your **Final Grade** column and set **Conditional Formatting** rules:

* **Green:** $\\geq 9.5$ (Immediate Grading Candidate)  
* **Yellow:** $8.5 \- 9.4$ (Review for Raw Sale)  
* **Red:** $\< 8.5$ (Bulk/Value Bin)

**Would you like me to write a small script that can take these grades and automatically generate a "Condition Statement" for an eBay description?**