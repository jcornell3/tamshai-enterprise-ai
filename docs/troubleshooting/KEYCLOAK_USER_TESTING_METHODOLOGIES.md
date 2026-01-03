This was a classic **"200 OK ≠ Working Application"** failure. Your server correctly served the HTML file (200 OK), but the application logic (the client-side asset fetching) failed silently from the perspective of a simple HTTP check.

Here is an analysis of options to close this testing gap, ranged from "Drop-in CLI replacement" to "Full Browser Simulation."

### Option 1: The "Smarter CLI" Approach (Wget)

**Complexity:** Low | **Execution:** Fast | **JS Execution:** No

If you want to stay in the terminal/bash script realm but validate that assets are reachable, `wget` is superior to `curl`. It has a "page requisites" spider mode that parses HTML and attempts to fetch linked assets (`<script>`, `<link>`, `<img>`).

**The Command:**

<!----><!----><!----><!----><!----><!----><!---->

Bash<!----><!----><!----><!---->
    
    `wget --spider --force-html -r -l1 --no-directories -e robots=off http://localhost/app/  
    `

<!---->

  
<!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!---->

* `--spider`: Checks for existence (HTTP status) without downloading files.
* `-r -l1`: Recursive, but only 1 level deep (fetches the page and its immediate assets).
* **Why this would have caught your bug:**
  1. Wget fetches `/app/`.
  2. It parses the HTML and finds `<script src="/assets/index.js">`.
  3. It resolves that URL relative to the root (because of the missing base path) → `http://localhost/assets/index.js`.
  4. It requests that URL.
  5. Caddy returns 404 (or the wrong content).
  6. Wget exits with a non-zero error code.

### Option 2: The "Lightweight Parser" (Node.js + Cheerio)

**Complexity:** Medium | **Execution:** Fast | **JS Execution:** No

This is a middle ground. You write a small script that fetches the HTML, parses the DOM to find asset tags, and validates that their `src/href` attributes resolve to valid 200 OK responses.

**Why use this:** It is faster than a browser but smarter than `wget` because you can add logic (e.g., "Ensure the `<base>` tag exists" or "Ensure assets start with `/app/`").

**Concept Script:**

<!----><!----><!----><!----><!----><!----><!---->

JavaScript<!----><!----><!----><!---->
    
    `import cheerio from 'cheerio'; // HTML parser  
    import axios from 'axios';  
      
    async function verifyAssets(url) {  
    const html = await axios.get(url);  
    const $ = cheerio.load(html.data);  
      
    // Find all scripts and CSS  
    const assets = $('script[src], link[rel="stylesheet"]');  
      
    for (const el of assets) {  
    const path = $(el).attr('src') || $(el).attr('href');  
      
    // Check if path includes the expected base  
    if (!path.startsWith('/app/')) {  
    throw new Error(\`Asset path incorrect: ${path}\`); // Catches your specific bug immediately  
    }  
      
    // Verify it is reachable  
    await axios.head(new URL(path, url).toString());  
    }  
    }  
    `

<!---->

  
<!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!---->

### Option 3: The "Gold Standard" (Playwright / Puppeteer)

**Complexity:** High | **Execution:** Slower | **JS Execution:** Yes

To guarantee the user actually sees the app, you must execute the JavaScript. `curl` and `wget` cannot confirm that React mounted successfully; they only confirm the files exist. If you had a syntax error in your JS that caused a white screen, Option 1 and 2 would still pass.

**Playwright** is the modern industry standard for this.

**Why this is the best solution:**

1. **Network Interception:** It logs every network request the browser makes. It would have seen the 404 on the JS file.
2. **Visual Confirmation:** You can wait for a specific element (e.g., `data-testid="login-form"`) to appear. If the JS fails to load, this element never appears, and the test fails.

**Example Playwright Test for your scenario:**

<!----><!----><!----><!----><!----><!----><!---->

TypeScript<!----><!----><!----><!---->
    
    `// tests/e2e/portal.spec.ts  
    import { test, expect } from '@playwright/test';  
      
    test('Portal loads and mounts React', async ({ page }) => {  
    // 1. Go to the app  
    const response = await page.goto('http://localhost/app/');  
      
    // 2. Verify main HTML status  
    expect(response?.status()).toBe(200);  
      
    // 3. CRITICAL: Wait for React to render something  
    // If JS path is wrong, this times out and fails.  
    await expect(page.getByText('Login to Portal')).toBeVisible();  
      
    // 4. (Optional) Fail on any 404 network requests during load  
    page.on('response', response => {  
    if (response.status() === 404) {  
    console.error(\`Failed to load resource: ${response.url()}\`);  
    }  
    });  
    });  
    `

<!---->

  
<!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!----><!---->

### Summary & Recommendation
**Feature**
**Curl**
**Wget (--spider)**
**Node Script (Cheerio)**
**Playwright (Browser)**
**Verifies HTML 200**
✅
✅
✅
✅
**Verifies Asset 200**
❌
✅
✅
✅
**Catches Path Errors**
❌
✅
✅
✅
**Catches JS Crashes**
❌
❌
❌
✅
**Running Cost**
Near Zero
Very Low
Low
High (requires CPU/RAM)

**Recommendation:**

1. **Immediate Fix (CI/CD):** Switch your `curl` check to the **`wget --spider`** command shown in Option 1\. It costs nothing to implement and effectively catches "broken link" deployment issues like this one.
2. **Long Term (QA):** Implement **Playwright**. It is the only way to verify that the application actually _renders_. If you ship a JS file that returns 200 OK but contains a syntax error, only Playwright will catch the resulting white screen.
