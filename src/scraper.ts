import { chromium, Browser, Page } from 'playwright';

export class DSBScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(headless: boolean = true) {
    this.browser = await chromium.launch({
      headless, // Default to headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
  }

  async navigate() {
    if (!this.page) throw new Error('Page not initialized');

    console.log('Navigating to DSB Mobile...');
    await this.page.goto('https://www.dsbmobile.de/');

    // Wait for page to load
    await this.page.waitForLoadState('networkidle');
    console.log('Page loaded successfully');
  }

  async login(username: string, password: string) {
    if (!this.page) throw new Error('Page not initialized');

    console.log('Attempting to login...');

    // Look for login form elements
    try {
      // Wait for login elements to be present
      await this.page.waitForSelector('input[type="text"], input[name*="user"], input[id*="user"]', { timeout: 10000 });

      // Try to find username field by various selectors
      const usernameField = await this.page.locator('input[type="text"], input[name*="user"], input[id*="user"]').first();
      await usernameField.fill(username);
      console.log('Username entered');

      // Try to find password field
      const passwordField = await this.page.locator('input[type="password"]').first();
      await passwordField.fill(password);
      console.log('Password entered');

      // Look for login button
      const loginButton = await this.page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Anmelden")').first();
      await loginButton.click();
      console.log('Login button clicked');

      // Wait for navigation or error
      await this.page.waitForLoadState('networkidle');

      // Check if login was successful by looking for default.aspx in URL
      const currentUrl = this.page.url();
      if (currentUrl.includes('default.aspx')) {
        console.log('Login successful! Redirected to:', currentUrl);
        return true;
      } else {
        console.log('Login may have failed. Current URL:', currentUrl);
        return false;
      }

    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async clickSchuelerElement() {
    if (!this.page) throw new Error('Page not initialized');

    console.log('Looking for dsbmobile_schueler element...');

    try {
      // Wait for the element containing "dsbmobile_schueler" text
      await this.page.waitForSelector('text=dsbmobile_schueler', { timeout: 10000 });

      // Click on the element
      await this.page.click('text=dsbmobile_schueler');
      console.log('Clicked on dsbmobile_schueler element');

      // Wait for navigation/loading
      await this.page.waitForLoadState('networkidle');

    } catch (error) {
      console.error('Failed to click dsbmobile_schueler element:', error);
      throw error;
    }
  }

  async extractTableFromFrame() {
    if (!this.page) throw new Error('Page not initialized');

    console.log('Looking for iframe and extracting schedule table data...');

    try {
      // Wait for iframe to be present
      await this.page.waitForSelector('iframe', { timeout: 10000 });
      console.log('Found iframe');

      // Get all frames on the page
      const frames = this.page.frames();
      console.log(`Found ${frames.length} frames`);

      // Find the iframe that contains tables
      let targetFrame = null;
      for (const frame of frames) {
        try {
          await frame.waitForSelector('table', { timeout: 2000 });
          targetFrame = frame;
          console.log('Found frame with tables');
          break;
        } catch {
          // Frame doesn't have tables, continue
        }
      }

      if (!targetFrame) {
        throw new Error('No frame with tables found');
      }

      // Look for the table that starts with "Stunde" in the first cell
      const tableData = await targetFrame.evaluate(() => {
        const tables = document.querySelectorAll('table');
        console.log(`Found ${tables.length} tables`);

        for (let i = 0; i < tables.length; i++) {
          const table = tables[i];
          const firstCell = table.querySelector('tr:first-child td:first-child, tr:first-child th:first-child');

          if (firstCell && firstCell.textContent?.trim().toLowerCase().includes('stunde')) {
            console.log(`Found schedule table (table ${i + 1})`);

            const rows = table.querySelectorAll('tr');
            const data: string[][] = [];

            rows.forEach((row) => {
              const cells = row.querySelectorAll('td, th');
              const rowData: string[] = [];

              cells.forEach((cell) => {
                // Get text content and clean it up
                const text = cell.textContent?.trim() || '';
                rowData.push(text);
              });

              if (rowData.length > 0) {
                data.push(rowData);
              }
            });

            return data;
          }
        }

        // If no table with "Stunde" found, return info about all tables
        console.log('No table with "Stunde" found. Available tables:');
        const allTablesInfo: string[] = [];
        tables.forEach((table, i) => {
          const firstCell = table.querySelector('tr:first-child td:first-child, tr:first-child th:first-child');
          const firstCellText = firstCell?.textContent?.trim() || 'empty';
          allTablesInfo.push(`Table ${i + 1}: "${firstCellText}"`);
          console.log(`Table ${i + 1}: "${firstCellText}"`);
        });

        throw new Error(`No table with "Stunde" found. Available: ${allTablesInfo.join(', ')}`);
      });

      console.log('Extracted schedule table data:');
      console.log(JSON.stringify(tableData, null, 2));

      // Process the data to format it properly
      const formattedData = this.formatScheduleData(tableData);
      console.log('Formatted schedule data:');
      console.log(JSON.stringify(formattedData, null, 2));

      return formattedData;

    } catch (error) {
      console.error('Failed to extract schedule table from iframe:', error);
      throw error;
    }
  }

  private formatScheduleData(rawData: string[][]): Record<string, any[]> {
    // Skip the header row (first row)
    const dataRows = rawData.slice(1);
    const formattedData: Record<string, any[]> = {};

    let currentKey = '';

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // If row has only one entry, it's a key (class name)
      if (row.length === 1 && row[0].trim() !== '' && row[0] !== '-----') {
        currentKey = row[0].trim();
        formattedData[currentKey] = [];
      }
      // If row has multiple entries and we have a current key, it's data for that key
      else if (row.length > 1 && currentKey) {
        // Create an object from the row data using the original header structure
        // Convert '---' strings to null for cleaner data
        const scheduleEntry = {
          stunde: row[0] === '---' ? null : (row[0] || ''),
          vertreter: row[1] === '---' ? null : (row[1] || ''),
          fach_klammer: row[2] === '---' ? null : (row[2] || ''),
          fach: row[3] === '---' ? null : (row[3] || ''),
          raum_klammer: row[4] === '---' ? null : (row[4] || ''),
          raum: row[5] === '---' ? null : (row[5] || ''),
          text: row[6] === '---' ? null : (row[6] || '')
        };
        formattedData[currentKey].push(scheduleEntry);
      }
    }

    return formattedData;
  }

  async screenshot(filename: string = 'screenshot.png') {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.screenshot({ path: filename, fullPage: true });
    console.log(`Screenshot saved as ${filename}`);
  }
}