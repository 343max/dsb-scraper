import { DSBScraper } from './scraper';

async function main() {
  const scraper = new DSBScraper();

  // Check for --ui argument
  const useUI = process.argv.includes('--ui');

  try {
    await scraper.init(!useUI); // If --ui is passed, run in non-headless mode
    console.log(`Browser initialized (${useUI ? 'UI mode' : 'headless mode'})`);

    await scraper.navigate();
    console.log('Navigated to DSB Mobile');

    // Take a screenshot to see the initial page
    await scraper.screenshot('initial-page.png');

    // Attempt login with provided credentials
    const loginSuccess = await scraper.login('XXXXXXXXXXX', 'XXXXXXXXXXX');
    console.log(`Login attempt completed: ${loginSuccess ? 'SUCCESS' : 'FAILED'}`);

    // Take screenshot after login attempt
    await scraper.screenshot('after-login.png');

    if (loginSuccess) {
      // Click on dsbmobile_schueler element
      await scraper.clickSchuelerElement();
      console.log('Clicked on student section');

      // Take screenshot after clicking
      await scraper.screenshot('after-schueler-click.png');

      // Extract table data from all iframes
      const allDaysData = await scraper.extractAllDaysData();
      console.log(`Extraction completed for ${allDaysData.length} days`);

      // Save all days data to JSON file
      await Bun.write('table-data.json', JSON.stringify(allDaysData, null, 2));
      console.log('All days data saved to table-data.json');
    }

    // Keep browser open for a few seconds to observe
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('Error:', error);
    await scraper.screenshot('error-state.png');
  } finally {
    await scraper.close();
  }
}

// Run the scraper
main().catch(console.error);