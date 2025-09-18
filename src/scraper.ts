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

  async screenshot(filename: string = 'screenshot.png') {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.screenshot({ path: filename, fullPage: true });
    console.log(`Screenshot saved as ${filename}`);
  }
}